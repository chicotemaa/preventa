import { extractProductsFromStaticHtmlText } from "./api-extractors.js";
import { launchBrowser } from "./browser.js";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { detectQueryType, normalizePrice } from "./normalizers.js";
import type {
  BrowserContext,
  Page,
  Response as PlaywrightResponse,
} from "playwright";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type CookieJar = Map<string, string>;

type YaguarAuthenticatedResult = {
  results: ProductSearchResult[];
  cookies: CookieJar;
};

type YaguarLoginResponse = {
  success?: boolean;
  data?: {
    status?: boolean;
    redirect?: string;
    message?: string;
  };
};

type YaguarNonceResponse = {
  success?: boolean;
  data?: string;
};

type YaguarVisibleCandidate = {
  rawName: string;
  priceText: string;
  sku: string | null;
  imageUrl: string | null;
  productUrl: string | null;
};

const YAGUAR_AUTH_TIMEOUT_MS = config.yaguar.sourceTimeoutMs;
const YAGUAR_MAX_REDIRECTS = 5;
const YAGUAR_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function extractProductsFromYaguarAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.yaguar.email ?? config.tokin.email;
  const password = config.yaguar.password ?? config.tokin.password;

  if (!config.yaguar.enabled || !email || !password) {
    throw new Error(
      "Faltan YAGUAR_EMAIL/YAGUAR_PASSWORD o TOKIN_EMAIL/TOKIN_PASSWORD para consultar Yaguar Chaco.",
    );
  }

  return withLocalTimeout(
    fetchAuthenticatedYaguarProducts(source, query, email, password)
      .then(({ results, cookies }) => {
        if (results.length > 0) {
          return results;
        }

        // Yaguar autentica por HTTP, pero el catalogo util suele quedar
        // renderizado en la tienda. Si el HTML estatico viene vacio, se fuerza
        // el navegador aunque YAGUAR_BROWSER_FALLBACK este desactivado.
        return fetchYaguarProductsWithBrowser(
          source,
          query,
          email,
          password,
          cookies,
        );
      })
      .catch((error) => {
        if (!config.yaguar.browserFallback) {
          throw error;
        }

        return fetchYaguarProductsWithBrowser(source, query, email, password);
      }),
    YAGUAR_AUTH_TIMEOUT_MS,
  );
}

async function fetchAuthenticatedYaguarProducts(
  source: ScrapingSource,
  query: string,
  email: string,
  password: string,
): Promise<YaguarAuthenticatedResult> {
  const cookies: CookieJar = new Map();
  const loginHtml = await fetchYaguarHtml(config.yaguar.loginUrl, cookies);
  const pageNonce = findYaguarLoginNonce(loginHtml);

  if (!pageNonce) {
    throw new Error("Yaguar no expuso nonce de login.");
  }

  const nonce = await refreshYaguarLoginNonce(cookies, pageNonce);
  await loginYaguar(cookies, email, password, nonce);

  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const html = await fetchYaguarHtml(url, cookies);

  if (isYaguarLoginPage(html)) {
    throw new Error("Yaguar no mantuvo la sesion luego del login.");
  }

  return {
    results: extractProductsFromStaticHtmlText(html, url, source, query),
    cookies,
  };
}

async function fetchYaguarProductsWithBrowser(
  source: ScrapingSource,
  query: string,
  email: string,
  password: string,
  authenticatedCookies?: CookieJar,
) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent: YAGUAR_USER_AGENT,
  });

  await addYaguarCookiesToContext(context, authenticatedCookies);

  const page = await context.newPage();

  page.setDefaultTimeout(config.yaguar.sourceTimeoutMs);

  try {
    if (!authenticatedCookies?.size) {
      await loginYaguarWithBrowser(page, email, password);
    }

    await page.goto(config.yaguar.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });

    const homeHtml = await page.content();

    if (isYaguarLoginPage(homeHtml)) {
      throw new Error(
        "Yaguar no mantuvo la sesion con navegador; revisar si las credenciales estan aprobadas para la tienda Chaco.",
      );
    }

    await ensureYaguarChacoBranch(page);

    const directSearchUrl = buildSearchUrl(source.searchUrlTemplate, query);

    await page.goto(directSearchUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {
      return undefined;
    });
    await page.waitForTimeout(800);

    let html = await page.content();

    if (isYaguarLoginPage(html)) {
      throw new Error("Yaguar redirigio a login al consultar productos.");
    }

    const directBrowserResults = filterYaguarResultsForQuery(
      await extractProductsFromYaguarVisibleGrid(page, source, query),
      query,
    );

    if (directBrowserResults.length > 0) {
      return directBrowserResults;
    }

    const directTextResults = filterYaguarResultsForQuery(
      await extractProductsFromYaguarVisibleText(page, source, query),
      query,
    );

    if (directTextResults.length > 0) {
      return directTextResults;
    }

    const directStaticResults = filterYaguarResultsForQuery(
      extractProductsFromStaticHtmlText(html, directSearchUrl, source, query),
      query,
    );

    if (directStaticResults.length > 0) {
      return directStaticResults;
    }

    await page.goto(config.yaguar.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });
    await ensureYaguarChacoBranch(page);

    await applyYaguarVisibleSearch(page, query);
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {
      return undefined;
    });
    await page.waitForTimeout(1_000);

    html = await page.content();

    if (isYaguarLoginPage(html)) {
      throw new Error("Yaguar redirigio a login al consultar productos.");
    }

    const browserResults = filterYaguarResultsForQuery(
      await extractProductsFromYaguarVisibleGrid(page, source, query),
      query,
    );

    if (browserResults.length > 0) {
      return browserResults;
    }

    const textResults = filterYaguarResultsForQuery(
      await extractProductsFromYaguarVisibleText(page, source, query),
      query,
    );

    if (textResults.length > 0) {
      return textResults;
    }

    const finalStaticResults = filterYaguarResultsForQuery(
      extractProductsFromStaticHtmlText(html, directSearchUrl, source, query),
      query,
    );

    if (finalStaticResults.length > 0) {
      return finalStaticResults;
    }

    throw new Error(await buildYaguarNoResultsDiagnostic(page, query));
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function ensureYaguarChacoBranch(page: Page) {
  const selected = await page
    .evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select"));

      for (const select of selects) {
        const options = Array.from(select.options);
        const option = options.find((item) =>
          /chaco|resistencia/i.test(
            [item.textContent, item.label, item.value].filter(Boolean).join(" "),
          ),
        );

        if (!option || select.value === option.value) {
          continue;
        }

        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      return false;
    })
    .catch(() => false);

  if (!selected) {
    return;
  }

  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {
    return undefined;
  });
  await page.waitForTimeout(1_000);
}

async function addYaguarCookiesToContext(
  context: BrowserContext,
  cookies: CookieJar | undefined,
) {
  if (!cookies?.size) {
    return;
  }

  await context.addCookies(
    Array.from(cookies.entries()).map(([name, value]) => ({
      name,
      value,
      url: config.yaguar.homeUrl,
    })),
  );
}

function filterYaguarResultsForQuery(
  results: ProductSearchResult[],
  query: string,
) {
  const queryType = detectQueryType(query);
  const normalizedDigits = query.replace(/\D/g, "");

  return results.filter((result) => {
    if (queryType !== "text") {
      return [
        result.sku,
        ...(result.barcodes ?? []),
      ].some((value) => value?.replace(/\D/g, "").includes(normalizedDigits));
    }

    return result.confidenceScore >= 35;
  });
}

async function loginYaguarWithBrowser(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto(config.yaguar.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.yaguar.sourceTimeoutMs,
  });

  await page.fill('input[name="username"], #username', email);
  await page.fill('input[name="password"], #password', password);

  const loginResponse = page
    .waitForResponse(
      (response) =>
        response.url().includes("/wp-admin/admin-ajax.php") &&
        response.request().method() === "POST",
      { timeout: Math.min(config.yaguar.sourceTimeoutMs, 12_000) },
    )
    .catch(() => null);

  await page.click("#user_registration_ajax_login_submit, button[name='login']");
  const response = await loginResponse;
  const loginError = await readYaguarBrowserLoginError(response);

  if (loginError) {
    throw new Error(loginError);
  }

  await page
    .waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 6_000,
    })
    .catch(() => undefined);
}

async function applyYaguarVisibleSearch(page: Page, query: string) {
  try {
    const inputIndex = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const scoredInputs = inputs
        .map((input, index) => {
          const rect = input.getBoundingClientRect();
          const style = window.getComputedStyle(input);
          const type = input.getAttribute("type")?.toLowerCase() ?? "text";

          if (
            rect.width <= 80 ||
            rect.height <= 16 ||
            style.visibility === "hidden" ||
            style.display === "none" ||
            ["hidden", "password", "number", "checkbox", "radio", "submit"].includes(type)
          ) {
            return null;
          }

          const surroundingText = getSurroundingText(input);
          const metadata = [
            input.getAttribute("name"),
            input.getAttribute("id"),
            input.getAttribute("class"),
            input.getAttribute("placeholder"),
            input.getAttribute("aria-label"),
            surroundingText,
          ]
            .filter(Boolean)
            .join(" ");
          let score = 100;

          if (/filtros|limpiar filtros|almac[eé]n|kiosco|desayuno|bodega/i.test(surroundingText)) {
            score -= 70;
          }

          if (/buscar|search|producto|marca|filtro/i.test(metadata)) {
            score -= 45;
          }

          if (type === "search") {
            score -= 30;
          }

          if (rect.left < window.innerWidth * 0.45) {
            score -= 5;
          }

          return { index, score };
        })
        .filter(
          (candidate): candidate is { index: number; score: number } =>
            candidate !== null,
        )
        .sort((first, second) => first.score - second.score);

      return scoredInputs[0]?.index ?? -1;

      function getSurroundingText(input: HTMLInputElement) {
        let current: Element | null = input;

        for (let depth = 0; current && depth < 5; depth += 1) {
          const text = (current as HTMLElement).innerText;

          if (text && text.length < 2_000) {
            return text;
          }

          current = current.parentElement;
        }

        return "";
      }
    });

    if (inputIndex < 0) {
      return undefined;
    }

    const input = page.locator("input").nth(inputIndex);
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(query, { delay: 45 });
    await page.keyboard.press("Enter").catch(() => undefined);
    await page
      .waitForFunction(
        (searchTerm) =>
          document.body.innerText.toLowerCase().includes(searchTerm.toLowerCase()) &&
          /\bCod\.?\s*[A-Z0-9-]+/i.test(document.body.innerText) &&
          /\$\s*\d[\d.,]*/.test(document.body.innerText),
        query,
        { timeout: 10_000 },
      )
      .catch(() => undefined);
    await page.waitForTimeout(1_500);
  } catch {
    return undefined;
  }
}

async function extractProductsFromYaguarVisibleGrid(
  page: Page,
  source: ScrapingSource,
  query: string,
) {
  const candidates = (await page.evaluate(() => {
    const addToCartPattern = /a(?:ñ|n)adir\s+al\s+carrito|agregar\s+al\s+carrito/i;
    const pricePattern = /\$\s*\d[\d.,]*(?:\s*final)?/i;
    const codePattern = /\bCod\.?\s*([A-Z0-9-]+)/i;
    const addToCartElements = "button, a, input[type='submit'], input[type='button']";
    const productSelectors = [
      ".product",
      ".product-type-simple",
      "li.product",
      ".e-loop-item",
      ".elementor-loop-item",
      "[class*='product']",
      "[data-product_id]",
    ].join(", ");
    const cards = new Set<Element>();
    const buttons = Array.from(document.querySelectorAll(addToCartElements)).filter(
      (element) => addToCartPattern.test(getElementText(element)),
    );

    for (const button of buttons) {
      const card = findProductCard(button);

      if (card) {
        cards.add(card);
      }
    }

    for (const element of document.querySelectorAll(productSelectors)) {
      if (isLikelyNamedProductCard(element)) {
        cards.add(element);
      }
    }

    for (const element of document.querySelectorAll("body *")) {
      if (
        isLikelyNamedProductCard(element) &&
        !Array.from(element.children).some((child) =>
          isLikelyNamedProductCard(child),
        )
      ) {
        cards.add(element);
      }
    }

    return Array.from(cards)
      .map((card) => {
        if (!isLikelyProductCard(card)) {
          return null;
        }

        const text = (card as HTMLElement).innerText
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const joinedText = text.join(" ");
        const priceText = joinedText.match(pricePattern)?.[0] ?? "";
        const nameLines = getProductNameLines(card);
        const rawName = nameLines.join(" ").replace(/\s+/g, " ").trim();
        const code =
          joinedText.match(/\bCod\.?\s*([A-Z0-9-]+)/i)?.[1] ??
          joinedText.match(/\bSKU\s*([A-Z0-9-]+)/i)?.[1] ??
          null;
        const image = card.querySelector("img") as HTMLImageElement | null;
        const link = card.querySelector(
          'a[href*="/producto"], a[href*="/tienda/"], a[href]',
        );

        if (!rawName || !priceText) {
          return null;
        }

        return {
          rawName,
          priceText,
          sku: code,
          imageUrl:
            image?.currentSrc ||
            image?.getAttribute("data-src") ||
            image?.getAttribute("src") ||
            null,
          productUrl: link?.getAttribute("href") ?? null,
        };
      })
      .filter(Boolean)
      .slice(0, 80);

    function findProductCard(button: Element) {
      let current = button.parentElement;
      let fallback: Element | null = null;

      while (current && current !== document.body) {
        if (isLikelyNamedProductCard(current)) {
          return current;
        }

        if (!fallback && isLikelyProductCard(current)) {
          fallback = current;
        }

        current = current.parentElement;
      }

      return fallback;
    }

    function isLikelyProductCard(element: Element) {
      const text = (element as HTMLElement).innerText ?? "";
      const priceMatches = text.match(new RegExp(pricePattern, "gi")) ?? [];
      const codeMatches = text.match(new RegExp(codePattern, "gi")) ?? [];
      const addButtonsCount = Array.from(
        element.querySelectorAll(addToCartElements),
      ).filter((candidate) => addToCartPattern.test(getElementText(candidate)))
        .length;

      return (
        text.length >= 20 &&
        text.length <= 1_000 &&
        priceMatches.length >= 1 &&
        priceMatches.length <= 3 &&
        codeMatches.length <= 3 &&
        addButtonsCount <= 3 &&
        !/^filtros/i.test(text)
      );
    }

    function isLikelyNamedProductCard(element: Element) {
      return isLikelyProductCard(element) && getProductNameLines(element).length > 0;
    }

    function getProductNameLines(element: Element) {
      const lines = ((element as HTMLElement).innerText ?? "")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const priceLineIndex = lines.findIndex((line) => pricePattern.test(line));
      const codeLineIndex = lines.findIndex((line) => codePattern.test(line));

      return lines
        .slice(
          0,
          codeLineIndex >= 0
            ? codeLineIndex
            : priceLineIndex >= 0
            ? priceLineIndex
            : lines.length,
        )
        .filter(isProductNameLine);
    }

    function isProductNameLine(line: string) {
      return (
        line.length >= 4 &&
        !pricePattern.test(line) &&
        !/^Cod\.?/i.test(line) &&
        !/^\d+$/.test(line) &&
        !addToCartPattern.test(line) &&
        !/^limpiar filtros$/i.test(line) &&
        !/^filtros$/i.test(line)
      );
    }

    function getElementText(element: Element) {
      const text = element.textContent?.trim();
      const value = (element as HTMLInputElement).value?.trim();
      const label = element.getAttribute("aria-label")?.trim();

      return text || value || label || "";
    }
  })) as YaguarVisibleCandidate[];

  const results: ProductSearchResult[] = [];

  for (const candidate of candidates) {
    const price = normalizePrice(candidate.priceText);

    if (price === null) {
      continue;
    }

    results.push({
      ...createProductResult(
        source,
        query,
        candidate.rawName,
        price,
        resolveYaguarUrl(candidate.productUrl),
        resolveYaguarUrl(candidate.imageUrl),
      ),
      sku: candidate.sku,
    });
  }

  return results;
}

async function extractProductsFromYaguarVisibleText(
  page: Page,
  source: ScrapingSource,
  query: string,
) {
  const candidates = (await page.evaluate(() => {
    const pricePattern = /\$\s*\d[\d.,]*(?:\s*final)?/i;
    const codePattern = /\bCod\.?\s*([A-Z0-9-]+)/i;
    const lines = (document.body.innerText ?? "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const candidatesByKey = new Map<string, YaguarVisibleCandidate>();

    for (let index = 0; index < lines.length; index += 1) {
      const priceText = lines[index]?.match(pricePattern)?.[0];

      if (!priceText) {
        continue;
      }

      const codeIndex = findCodeLineIndex(lines, index);
      const nameEndIndex = codeIndex >= 0 ? codeIndex - 1 : index - 1;
      const nameLines = collectNameLines(lines, nameEndIndex);
      const rawName = nameLines.join(" ").replace(/\s+/g, " ").trim();

      if (!rawName) {
        continue;
      }

      const sku =
        codeIndex >= 0 ? lines[codeIndex]?.match(codePattern)?.[1] ?? null : null;
      const key = `${rawName.toLowerCase()}|${priceText}|${sku ?? ""}`;

      candidatesByKey.set(key, {
        rawName,
        priceText,
        sku,
        imageUrl: null,
        productUrl: null,
      });
    }

    return Array.from(candidatesByKey.values()).slice(0, 80);

    function findCodeLineIndex(linesToSearch: string[], priceLineIndex: number) {
      const from = Math.max(0, priceLineIndex - 6);
      const to = Math.min(linesToSearch.length - 1, priceLineIndex + 2);

      for (let index = priceLineIndex - 1; index >= from; index -= 1) {
        if (codePattern.test(linesToSearch[index] ?? "")) {
          return index;
        }
      }

      for (let index = priceLineIndex + 1; index <= to; index += 1) {
        if (codePattern.test(linesToSearch[index] ?? "")) {
          return index;
        }
      }

      return -1;
    }

    function collectNameLines(linesToSearch: string[], nameEndIndex: number) {
      const nameLines: string[] = [];

      for (
        let index = nameEndIndex;
        index >= 0 && nameLines.length < 4;
        index -= 1
      ) {
        const line = linesToSearch[index] ?? "";

        if (isProductNameBoundary(line)) {
          break;
        }

        if (isLikelyProductNameLine(line)) {
          nameLines.unshift(line);
          continue;
        }

        if (nameLines.length > 0) {
          break;
        }
      }

      return nameLines;
    }

    function isLikelyProductNameLine(line: string) {
      return (
        line.length >= 5 &&
        line.length <= 120 &&
        /[a-záéíóúñ]/i.test(line) &&
        !pricePattern.test(line) &&
        !codePattern.test(line) &&
        !/^\d+$/.test(line) &&
        !/^(x\s*)?\d+\s*$/i.test(line) &&
        !/^(inicio|tienda online|cat[aá]logos y ofertas|marcas propias|promociones bancarias|gift cards|recetas|nosotros)$/i.test(
          line,
        ) &&
        !/^(filtros|limpiar filtros|seleccionar sucursal|sucursal chaco|whatsapp oficial|hola,?\s*)/i.test(
          line,
        ) &&
        !/^(almac[eé]n|bazar|bebidas|bodega|desayuno|frescos|kiosco|limpieza|mascotas|papeles|perfumer[ií]a|sin categorizar)\b/i.test(
          line,
        ) &&
        !/^mayorista\s+yaguar$/i.test(line) &&
        !/a(?:ñ|n)adir\s+al\s+carrito|agregar\s+al\s+carrito/i.test(line)
      );
    }

    function isProductNameBoundary(line: string) {
      return (
        pricePattern.test(line) ||
        codePattern.test(line) ||
        /a(?:ñ|n)adir\s+al\s+carrito|agregar\s+al\s+carrito/i.test(line) ||
        /^limpiar filtros$/i.test(line) ||
        /^filtros$/i.test(line)
      );
    }
  })) as YaguarVisibleCandidate[];

  const results: ProductSearchResult[] = [];

  for (const candidate of candidates) {
    const price = normalizePrice(candidate.priceText);

    if (price === null) {
      continue;
    }

    results.push({
      ...createProductResult(
        source,
        query,
        candidate.rawName,
        price,
        resolveYaguarUrl(candidate.productUrl),
        resolveYaguarUrl(candidate.imageUrl),
      ),
      sku: candidate.sku,
    });
  }

  return results;
}

async function buildYaguarNoResultsDiagnostic(page: Page, query: string) {
  const state = await page
    .evaluate((searchTerm) => {
      const text = document.body.innerText ?? "";
      const lines = text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const relevantLines = lines
        .filter((line) => {
          const normalizedLine = line.toLowerCase();
          const normalizedSearch = searchTerm.toLowerCase();

          return (
            normalizedLine.includes(normalizedSearch) ||
            /\bCod\.?\s*[A-Z0-9-]+/i.test(line) ||
            /\$\s*\d[\d.,]*(?:\s*final)?/i.test(line) ||
            /sucursal|seleccionar|filtros|sin resultados|no se encontraron/i.test(
              line,
            )
          );
        })
        .slice(0, 24)
        .map((line) => line.slice(0, 140));
      const visibleInputs = Array.from(document.querySelectorAll("input"))
        .filter((input) => {
          const rect = input.getBoundingClientRect();
          const style = window.getComputedStyle(input);
          const type = input.getAttribute("type")?.toLowerCase() ?? "text";

          return (
            rect.width > 60 &&
            rect.height > 12 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !["hidden", "password"].includes(type)
          );
        })
        .slice(0, 8)
        .map((input) => ({
          type: input.getAttribute("type") ?? "text",
          name: input.getAttribute("name"),
          id: input.getAttribute("id"),
          placeholder: input.getAttribute("placeholder"),
          value: input.value?.slice(0, 80) ?? "",
        }));
      const selects = Array.from(document.querySelectorAll("select"))
        .slice(0, 6)
        .map((select) => ({
          name: select.getAttribute("name"),
          id: select.getAttribute("id"),
          value: select.value,
          selectedText:
            select.selectedOptions[0]?.textContent
              ?.replace(/\s+/g, " ")
              .trim()
              .slice(0, 80) ?? "",
          options: Array.from(select.options)
            .slice(0, 8)
            .map((option) =>
              [option.value, option.textContent?.replace(/\s+/g, " ").trim()]
                .filter(Boolean)
                .join(":")
                .slice(0, 80),
            ),
        }));

      return {
        url: window.location.href,
        title: document.title,
        textLength: text.length,
        hasQuery: text.toLowerCase().includes(searchTerm.toLowerCase()),
        hasPrice: /\$\s*\d[\d.,]*(?:\s*final)?/i.test(text),
        hasCode: /\bCod\.?\s*[A-Z0-9-]+/i.test(text),
        addToCartCount: Array.from(
          document.querySelectorAll("button, a, input[type='submit']"),
        ).filter((element) =>
          /a(?:ñ|n)adir\s+al\s+carrito|agregar\s+al\s+carrito/i.test(
            element.textContent ?? (element as HTMLInputElement).value ?? "",
          ),
        ).length,
        productNodeCount: document.querySelectorAll(
          ".product, .product-type-simple, li.product, .e-loop-item, .elementor-loop-item, [class*='product'], [data-product_id]",
        ).length,
        relevantLines,
        visibleInputs,
        selects,
      };
    }, query)
    .catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));

  return `Yaguar no expuso productos extraibles despues del login. Diagnostico: ${JSON.stringify(
    state,
  ).slice(0, 2200)}`;
}

async function readYaguarBrowserLoginError(
  response: PlaywrightResponse | null,
) {
  if (!response) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | YaguarLoginResponse
    | null;

  if (!payload || payload.success) {
    return null;
  }

  return stripHtml(payload.data?.message ?? "Yaguar no autorizo el login.");
}

async function refreshYaguarLoginNonce(cookies: CookieJar, fallbackNonce: string) {
  const response = await fetch(config.yaguar.ajaxUrl, {
    method: "POST",
    headers: buildYaguarHeaders(cookies, {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: config.yaguar.loginUrl,
      "x-requested-with": "XMLHttpRequest",
    }),
    body: new URLSearchParams({
      action: "user_registration_get_recent_nonce",
      nonce_for: "login",
    }),
    redirect: "manual",
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    return fallbackNonce;
  }

  const payload = (await response.json().catch(() => ({}))) as YaguarNonceResponse;
  return payload.success && payload.data ? payload.data : fallbackNonce;
}

async function loginYaguar(
  cookies: CookieJar,
  email: string,
  password: string,
  nonce: string,
) {
  const url = new URL(config.yaguar.ajaxUrl);
  url.searchParams.set("action", "user_registration_ajax_login_submit");
  url.searchParams.set("security", nonce);

  const response = await fetch(url, {
    method: "POST",
    headers: buildYaguarHeaders(cookies, {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://yaguar.com.ar",
      referer: config.yaguar.loginUrl,
      "x-requested-with": "XMLHttpRequest",
    }),
    body: new URLSearchParams({
      username: email,
      password,
      CaptchaResponse: "",
      redirect: config.yaguar.homeUrl,
    }),
    redirect: "manual",
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Yaguar login respondio ${response.status}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as YaguarLoginResponse;

  if (!payload.success) {
    throw new Error(
      stripHtml(payload.data?.message ?? "Yaguar no autorizo el login."),
    );
  }

  const redirectUrl = resolveYaguarPostLoginUrl(payload);
  await fetchYaguarHtml(redirectUrl, cookies, config.yaguar.loginUrl);
}

async function fetchYaguarHtml(
  url: string,
  cookies: CookieJar,
  referer = config.yaguar.homeUrl,
) {
  let currentUrl = url;
  let currentReferer = referer;

  for (let redirectCount = 0; redirectCount <= YAGUAR_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      headers: buildYaguarHeaders(cookies, {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: currentReferer,
      }),
      redirect: "manual",
    });

    storeResponseCookies(cookies, response);

    if (isRedirectResponse(response)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error(`Yaguar redirigio sin location desde ${currentUrl}`);
      }

      currentReferer = currentUrl;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Yaguar respondio ${response.status} para ${currentUrl}`);
    }

    return response.text();
  }

  throw new Error(`Yaguar excedio ${YAGUAR_MAX_REDIRECTS} redirecciones para ${url}`);
}

function findYaguarLoginNonce(html: string) {
  return (
    html.match(/ur_login_form_save_nonce["']?\s*:\s*["']([^"']+)/)?.[1] ??
    html.match(/name=["']user-registration-login-nonce["'][^>]*value=["']([^"']+)/)
      ?.[1] ??
    ""
  );
}

function isYaguarLoginPage(html: string) {
  return (
    /user_registration_ajax_login_submit/i.test(html) ||
    /user-registration-login-nonce/i.test(html) ||
    /Ingres[aá] tu usuario o correo electr[oó]nico/i.test(html)
  );
}

function resolveYaguarPostLoginUrl(payload: YaguarLoginResponse) {
  const redirectCandidate =
    payload.data?.redirect ??
    (looksLikeUrl(payload.data?.message) ? payload.data?.message : undefined) ??
    config.yaguar.homeUrl;

  return new URL(redirectCandidate, config.yaguar.homeUrl).toString();
}

function resolveYaguarUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image/")) {
    return null;
  }

  try {
    return new URL(value, config.yaguar.homeUrl).toString();
  } catch {
    return value;
  }
}

function looksLikeUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function buildYaguarHeaders(
  cookies: CookieJar,
  headers: Record<string, string>,
) {
  const cookieHeader = serializeCookies(cookies);

  return {
    "accept-language": "es-AR,es;q=0.9,en;q=0.8",
    "user-agent": YAGUAR_USER_AGENT,
    ...headers,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function isRedirectResponse(response: Response) {
  return response.status >= 300 && response.status < 400;
}

function storeResponseCookies(cookies: CookieJar, response: Response) {
  for (const cookie of getSetCookieHeaders(response)) {
    const [nameValue] = cookie.split(";");
    const separatorIndex = nameValue.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    cookies.set(
      nameValue.slice(0, separatorIndex).trim(),
      nameValue.slice(separatorIndex + 1).trim(),
    );
  }
}

function getSetCookieHeaders(response: Response) {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookieHeaders = headersWithSetCookie.getSetCookie?.();

  if (cookieHeaders?.length) {
    return cookieHeaders;
  }

  const combinedCookie = response.headers.get("set-cookie");
  return combinedCookie ? splitCombinedSetCookie(combinedCookie) : [];
}

function splitCombinedSetCookie(value: string) {
  return value.split(/,\s*(?=[^=;,]+=)/);
}

function serializeCookies(cookies: CookieJar) {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function withLocalTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}
