import type {
  Browser,
  BrowserContextOptions,
  Page,
} from "playwright";
import { findAllowedBrand } from "./brands.js";
import { config } from "./config.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type TokinStorageState = Exclude<
  BrowserContextOptions["storageState"],
  string | undefined
>;

type TokinRawProduct = {
  code: string | null;
  imageUrl: string | null;
  name: string;
  presentation: string | null;
  price: string;
};

let cachedTokinStorageState: TokinStorageState | undefined;

export async function extractProductsFromTokin(
  browser: Browser,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  if (!config.tokin.email || !config.tokin.password) {
    throw new Error("Faltan TOKIN_EMAIL y TOKIN_PASSWORD para consultar Tokin.");
  }

  const context = await browser.newContext(
    cachedTokinStorageState ? { storageState: cachedTokinStorageState } : {},
  );
  const page = await context.newPage();
  page.setDefaultTimeout(config.sourceTimeoutMs);

  try {
    await ensureTokinAuthenticated(page);
    await page.goto(buildSearchUrl(source.searchUrlTemplate, query), {
      waitUntil: "domcontentloaded",
      timeout: config.sourceTimeoutMs,
    });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
      return undefined;
    });

    const rawProducts = await collectTokinProducts(page, source.maxCards ?? 80);

    return rawProducts
      .map((product) => toTokinProductResult(product, source, query))
      .filter((result): result is ProductSearchResult => result !== null);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function ensureTokinAuthenticated(page: Page) {
  await page.goto(config.tokin.homeUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.sourceTimeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    return undefined;
  });

  if (await isTokinStoreReady(page)) {
    return;
  }

  await page.goto(config.tokin.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.sourceTimeoutMs,
  });

  await clickFirstVisible(page, [
    '[data-id="login-with-password"]',
    'button:has-text("mail y contraseña")',
    'text="Ingresar con mail y contraseña"',
  ]);

  const emailInput = await findFirstVisible(page, [
    'input[data-id="email-input"]',
    'input[name="email"]',
    'input[type="email"]',
  ]);
  await emailInput.fill(config.tokin.email ?? "");

  await clickFirstVisible(page, [
    '[data-id="email-next-buton"]',
    '[data-id="email-next-button"]',
    'button:has-text("Continuar")',
    'button:has-text("Siguiente")',
    'button[type="submit"]',
  ]);

  const passwordInput = await findFirstVisible(page, [
    'input[data-id="password-input"]',
    'input[name="password"]',
    'input[type="password"]',
  ]);
  await passwordInput.fill(config.tokin.password ?? "");

  await clickFirstVisible(page, [
    '[data-id="password-next-button"]',
    'button:has-text("Ingresar")',
    'button:has-text("Continuar")',
    'button[type="submit"]',
  ]);

  await page
    .waitForURL(/\/store\/(home|pre-home-ingreso|search)/, {
      timeout: config.sourceTimeoutMs,
      waitUntil: "domcontentloaded",
    })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    return undefined;
  });

  await settleTokinStoreSelection(page);

  if (!(await isTokinStoreReady(page))) {
    throw new Error(
      "Tokin autentico, pero no dejo acceder al catalogo. Revisar cuenta/sucursal.",
    );
  }

  cachedTokinStorageState = await page.context().storageState();
}

async function settleTokinStoreSelection(page: Page) {
  if (await isTokinStoreReady(page)) {
    return;
  }

  await page.goto(config.tokin.homeUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.sourceTimeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    return undefined;
  });

  if (await isTokinStoreReady(page)) {
    return;
  }

  const clicked = await clickFirstVisible(page, [
    'a[href*="/store/home"]',
    'button:has-text("Ingresar")',
    'button:has-text("Entrar")',
    'button:has-text("Continuar")',
    'button:has-text("Comenzar")',
  ]);

  if (clicked) {
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
      return undefined;
    });
  }
}

async function isTokinStoreReady(page: Page) {
  if (page.url().includes("/store/login")) {
    return false;
  }

  const visibleSearchInput = await page
    .locator('input[placeholder*="productos" i], input[placeholder*="marcas" i]')
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);

  if (visibleSearchInput) {
    return true;
  }

  return (
    (await page
      .locator('main[data-section="results"], article[data-section^="product-card-"]')
      .count()
      .catch(() => 0)) > 0
  );
}

async function findFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: 2500 }).catch(() => false)) {
      return locator;
    }
  }

  throw new Error(`No se encontro el campo requerido en Tokin: ${selectors[0]}`);
}

async function clickFirstVisible(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: 2500 }).catch(() => false)) {
      await locator.click();
      return true;
    }
  }

  return false;
}

async function collectTokinProducts(page: Page, maxCards: number) {
  await page
    .locator('article[data-section^="product-card-"]')
    .first()
    .waitFor({ state: "visible", timeout: config.sourceTimeoutMs })
    .catch(() => undefined);

  const products = new Map<string, TokinRawProduct>();
  let stableIterations = 0;
  let previousSize = 0;

  for (let iteration = 0; iteration < 14; iteration += 1) {
    const visibleProducts = await extractVisibleTokinProducts(page);

    for (const product of visibleProducts) {
      products.set(
        [product.code, product.name, product.presentation, product.price].join("|"),
        product,
      );
    }

    if (products.size >= maxCards) {
      break;
    }

    stableIterations =
      products.size === previousSize ? stableIterations + 1 : 0;
    previousSize = products.size;

    if (stableIterations >= 3) {
      break;
    }

    await page.evaluate(() => {
      window.scrollBy(0, Math.max(window.innerHeight * 0.9, 700));
    });
    await page.waitForTimeout(700);
  }

  return Array.from(products.values()).slice(0, maxCards);
}

async function extractVisibleTokinProducts(page: Page) {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      value?.replace(/\s+/g, " ").trim() ?? "";
    const presentationLabels = ["x Unidad", "x Display", "x Bulto"];

    return Array.from(
      document.querySelectorAll('article[data-section^="product-card-"]'),
    )
      .map((card) => {
        const name = normalize(
          card.querySelector('h3[data-id="product-name"]')?.textContent,
        );
        const code =
          normalize(card.querySelector('h4[data-id="product-ref-id"]')?.textContent) ||
          null;
        const price = normalize(
          card.querySelector('[data-testid="product-card-vertical-price"]')
            ?.textContent,
        );
        const selectedSkuButton =
          card.querySelector(
            '[data-id="sku-selector-button"].border-blue-400',
          ) ?? card.querySelector('[data-id="sku-selector-button"]');
        const selectedSkuText = normalize(selectedSkuButton?.textContent);
        const presentation =
          presentationLabels.find((label) => selectedSkuText.includes(label)) ??
          null;
        const imageSource =
          (card.querySelector("img[alt]") as HTMLImageElement | null)
            ?.currentSrc ||
          card.querySelector("img[alt]")?.getAttribute("src") ||
          null;
        const imageUrl = imageSource
          ? new URL(imageSource, location.href).toString()
          : null;

        return { code, imageUrl, name, presentation, price };
      })
      .filter((item) => item.name && item.price);
  }) as Promise<TokinRawProduct[]>;
}

function toTokinProductResult(
  product: TokinRawProduct,
  source: ScrapingSource,
  query: string,
): ProductSearchResult | null {
  const price = normalizePrice(product.price);

  if (price === null) {
    return null;
  }

  const rawName = product.presentation
    ? `${product.name} (${product.presentation})`
    : product.name;
  const matchText = findAllowedBrand(product.name)
    ? product.name
    : [product.code, product.name].filter(Boolean).join(" ");

  return {
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: product.code,
    barcodes: [],
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: null,
    imageUrl: product.imageUrl,
    confidenceScore: calculateConfidenceScore(query, matchText),
  };
}
