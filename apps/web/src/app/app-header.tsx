"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Categorías" },
  { href: "/busqueda-general", label: "Búsqueda general" },
  { href: "/importacion", label: "Importación" },
  { href: "/evolucion", label: "Evolución" },
  { href: "/historial", label: "Historial" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[#f0e1da] bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <Link href="/" className="flex w-fit items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#df2e38] text-lg font-extrabold text-white shadow-[0_10px_24px_rgba(223,46,56,0.18)] sm:h-10 sm:w-10 sm:text-xl">
            A
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-1/2 h-1 w-4 -translate-x-1/2 rounded bg-white"
            />
          </div>
          <div>
            <div className="text-lg font-extrabold leading-none text-[#171717] sm:text-xl">
              Aguiar
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#df2e38] sm:text-[11px] sm:tracking-[0.22em]">
              Gestión de precios
            </div>
          </div>
        </Link>

        <nav className="-mx-1 flex max-w-full flex-wrap items-center gap-1 px-1 md:justify-end">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-md px-2.5 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                  isActive
                    ? "bg-[#171717] text-white"
                    : "text-[#6f625d] hover:bg-[#fff8f2] hover:text-[#171717]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
