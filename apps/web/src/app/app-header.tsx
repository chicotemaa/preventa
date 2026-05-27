"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Carga ARA" },
  { href: "/evolucion", label: "Evolución" },
  { href: "/historial", label: "Historial" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[#f0e1da] bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[76px] w-full max-w-6xl flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:px-8">
        <Link href="/" className="flex w-fit items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-[#df2e38] text-xl font-extrabold text-white shadow-[0_10px_24px_rgba(223,46,56,0.18)]">
            A
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-1/2 h-1 w-4 -translate-x-1/2 rounded bg-white"
            />
          </div>
          <div>
            <div className="text-xl font-extrabold leading-none text-[#171717]">
              ARA
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#df2e38]">
              Distribuidora RAP
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
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
