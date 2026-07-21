"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import type { CategoryDecisionRow } from "@/lib/category-pricing";
import { getComparablePrice } from "@/lib/category-pricing";
import { getSourceChannel } from "@/lib/source-priority";
import type { ProductSearchResult } from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function CategoryProductDetail({
  row,
  onClose,
}: {
  row: CategoryDecisionRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!row) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, row]);

  if (!row) {
    return null;
  }

  const ownProducts = row.products.filter((product) => getSourceChannel(product) === "own");
  const marketProducts = row.products.filter((product) => getSourceChannel(product) !== "own");

  return (
    <div className="fixed inset-0 z-50 bg-[#17202a]/35" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-product-detail-title"
        className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-[#d9dee7] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5e9ef] px-4 py-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.05em] text-[#667789]">
              Detalle de comparación
            </div>
            <h3 id="category-product-detail-title" className="mt-1 text-lg font-bold text-[#17202a]">
              {row.clusterName}
            </h3>
            <p className="mt-1 text-sm text-[#667789]">
              {row.brand} · {row.presentationLabel} · {row.sourcesWithPrice} fuentes de mercado
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Cerrar detalle"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d9dee7] bg-white text-[#526170] hover:border-[#153d7b] hover:text-[#153d7b]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <details open className="group">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#17202a]">
              Tokin / Aguiar ({ownProducts.length})
            </summary>
            <ProductGrid
              products={ownProducts}
              emptyMessage="Sin un producto propio equivalente confirmado."
            />
          </details>

          <details open className="group border-t border-[#e5e9ef]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#17202a]">
              Competencia ({marketProducts.length})
            </summary>
            <ProductGrid
              products={marketProducts}
              emptyMessage="Sin productos de competencia para este grupo."
            />
          </details>
        </div>
      </section>
    </div>
  );
}

function ProductGrid({
  products,
  emptyMessage,
}: {
  products: ProductSearchResult[];
  emptyMessage: string;
}) {
  if (products.length === 0) {
    return (
      <div className="px-4 pb-4">
        <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-5 text-center text-sm text-[#526170]">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
      {products.map((product) => (
        <ProductCard key={`${product.sourceId}-${product.rawName}-${product.price}`} product={product} />
      ))}
    </div>
  );
}

function ProductCard({ product }: { product: ProductSearchResult }) {
  const packageDetails = getPackageDetails(product);

  return (
    <article className="rounded-md border border-[#d9dee7] bg-[#fffdfa] p-3">
      <div className="flex gap-3">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.rawName}
            className="h-20 w-20 shrink-0 rounded-md border border-[#d9dee7] bg-white object-contain"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f8fafc] text-xs font-semibold text-[#8a96a3]">
            Sin foto
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[#edf1f5] px-2 py-0.5 text-[10px] font-bold text-[#526170]">
              {product.storeName}
            </span>
            <span className="rounded bg-[#eaf7ef] px-2 py-0.5 text-[10px] font-bold text-[#16613c]">
              {product.storeType}
            </span>
            {product.brand ? (
              <span className="rounded bg-[#fff4e8] px-2 py-0.5 text-[10px] font-bold text-[#8a4b12]">
                {product.brand}
              </span>
            ) : null}
          </div>
          <h4 className="mt-2 line-clamp-3 text-sm font-bold leading-5 text-[#17202a]">
            {product.rawName}
          </h4>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PriceBox
          label="Unidad"
          value={currencyFormatter.format(getComparablePrice(product))}
          helper="precio unitario o equivalente"
          tone="unit"
        />
        <PriceBox
          label="Bulto / pack"
          value={packageDetails.value}
          helper={packageDetails.helper}
          tone="pack"
        />
      </div>

      <AlternatePrices product={product} />

      {product.productUrl ? (
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-[#d9dee7] bg-white px-3 text-sm font-semibold text-[#153d7b] transition hover:border-[#153d7b] hover:bg-[#f5f8ff]"
        >
          Abrir producto
        </a>
      ) : null}
    </article>
  );
}

function PriceBox({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "unit" | "pack";
}) {
  const className =
    tone === "unit"
      ? "border-[#dbe7df] bg-[#f4fbf7] text-[#173d2f]"
      : "border-[#eadbd3] bg-[#fff8f2] text-[#7a4a16]";

  return (
    <div className={`rounded-md border px-3 py-2 ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#526170]">
        {label}
      </div>
      <div className="mt-1 text-base font-extrabold">{value}</div>
      <div className="mt-1 text-xs leading-4 text-[#667789]">{helper}</div>
    </div>
  );
}

function AlternatePrices({ product }: { product: ProductSearchResult }) {
  const labels = (product.alternatePrices ?? [])
    .filter((price) => Number.isFinite(price.price) && price.price > 0)
    .map((price) => `${price.label}: ${currencyFormatter.format(price.price)}`);

  if (labels.length === 0 && !product.priceCondition) {
    return null;
  }

  return (
    <div className="mt-2 rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#526170]">
        Condiciones
      </div>
      <div className="mt-1 space-y-1 text-xs leading-4 text-[#667789]">
        {product.priceCondition ? <div>{product.priceCondition}</div> : null}
        {labels.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
    </div>
  );
}

function getPackageDetails(product: ProductSearchResult) {
  if (hasPackagePrice(product)) {
    return {
      value: currencyFormatter.format(product.price),
      helper: product.priceCondition ?? product.packageLabel ?? `bulto x ${product.packageQuantity}`,
    };
  }

  const alternatePackagePrice = findPackageAlternatePrice(product);

  if (alternatePackagePrice) {
    return {
      value: currencyFormatter.format(alternatePackagePrice.price),
      helper: alternatePackagePrice.label,
    };
  }

  return {
    value: "-",
    helper: "no informado por la fuente",
  };
}

function hasPackagePrice(product: ProductSearchResult) {
  return Boolean(
    (product.packageQuantity && product.packageQuantity > 1) ||
      (product.packageLabel && /bulto|caja|pack|display/i.test(product.packageLabel)) ||
      (product.priceCondition && /bulto|caja|pack|display/i.test(product.priceCondition)),
  );
}

function findPackageAlternatePrice(product: ProductSearchResult) {
  return (product.alternatePrices ?? []).find(
    (price) =>
      Number.isFinite(price.price) &&
      price.price > 0 &&
      /bulto|caja|pack|display/i.test(price.label),
  );
}
