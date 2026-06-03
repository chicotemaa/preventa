import type {
  Browser,
  BrowserContextOptions,
  Page,
} from "playwright";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { normalizePrice } from "./normalizers.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type MaxiconsumoStorageState = Exclude<
  BrowserContextOptions["storageState"],
  string | undefined
>;

type MaxiconsumoRawProduct = {
  imageUrl: string | null;
  name: string;
  price: string;
  productUrl: string | null;
  sku: string | null;
};

let cachedMaxiconsumoStorageState: MaxiconsumoStorageState | undefined;

export async function extractProductsFromMaxiconsumoAuth(
  browser: Browser,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.maxiconsumo.email ?? config.tokin.email;
  const password = config.maxiconsumo.password;

  if (!email || !password) {
    throw new Error(
      "Faltan MAXICONSUMO_EMAIL/MAXICONSUMO_PASSWORD para consultar Maxiconsumo Chaco.",
    );
  }

  const context = await browser.newContext(
    cachedMaxiconsumoStorageState
      ? { storageState: cachedMaxiconsumoStorageState }
      : {},
  );
  const page = await context.newPage();
  page.setDefaultTimeout(config.sourceTimeoutMs);

  try {
    await ensureMaxiconsumoAuthenticated(page, email, password);
    await page.goto(buildSearchUrl(source.searchUrlTemplate, query), {
      waitUntil: "domcontentloaded",
      timeout: config.sourceTimeoutMs,
    });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
      return undefined;
    });

    const rawProducts = await extractVisibleMaxiconsumoProducts(page);

    return rawProducts
      .slice(0, source.maxCards ?? 40)
      .map((product) => toMaxiconsumoProductResult(product, source, query))
      .filter((result): result is ProductSearchResult => result !== null);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function ensureMaxiconsumoAuthenticated(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto(config.maxiconsumo.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.sourceTimeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    return undefined;
  });

  if (!(await isLoginFormVisible(page))) {
    cachedMaxiconsumoStorageState = await page.context().storageState();
    return;
  }

  await page.locator('#login-form input[name="login[username]"], #email')
    .first()
    .fill(email);
  await page.locator('#login-form input[name="login[password]"], #pass')
    .first()
    .fill(password);

  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: config.sourceTimeoutMs,
    }).catch(() => undefined),
    page.locator('#login-form button[type="submit"], #login-form .action.login')
      .first()
      .click(),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    return undefined;
  });

  if (await isLoginFormVisible(page)) {
    throw new Error(
      "Maxiconsumo no acepto las credenciales o requiere validacion adicional.",
    );
  }

  cachedMaxiconsumoStorageState = await page.context().storageState();
}

async function isLoginFormVisible(page: Page) {
  return page
    .locator('#login-form input[name="login[username]"], #email')
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
}

async function extractVisibleMaxiconsumoProducts(page: Page) {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) =>
      value?.replace(/\s+/g, " ").trim() ?? "";

    return Array.from(
      document.querySelectorAll("li.item.product.product-item"),
    )
      .map((card) => {
        const name = normalize(
          card.querySelector("a.product-item-link")?.textContent,
        );
        const productUrl =
          card.querySelector("a.product-item-link")?.getAttribute("href") ??
          null;
        const skuText = normalize(card.querySelector(".product-sku")?.textContent);
        const sku = skuText.replace(/^sku\s*/i, "").trim() || null;
        const price = normalize(
          card.querySelector(".price-box.highest .price")?.textContent ??
            card.querySelector(".price-box .price")?.textContent,
        );
        const imageSource =
          (card.querySelector("img.product-image-photo") as HTMLImageElement | null)
            ?.currentSrc ||
          card.querySelector("img.product-image-photo")?.getAttribute("src") ||
          null;
        const imageUrl = imageSource
          ? new URL(imageSource, location.href).toString()
          : null;

        return {
          imageUrl,
          name,
          price,
          productUrl: productUrl
            ? new URL(productUrl, location.href).toString()
            : null,
          sku,
        };
      })
      .filter((item) => item.name && item.price);
  }) as Promise<MaxiconsumoRawProduct[]>;
}

function toMaxiconsumoProductResult(
  product: MaxiconsumoRawProduct,
  source: ScrapingSource,
  query: string,
): ProductSearchResult | null {
  const price = normalizePrice(product.price);

  if (price === null) {
    return null;
  }

  const result = createProductResult(
    source,
    query,
    product.name,
    price,
    product.productUrl,
    product.imageUrl,
  );

  return {
    ...result,
    sku: product.sku,
  };
}
