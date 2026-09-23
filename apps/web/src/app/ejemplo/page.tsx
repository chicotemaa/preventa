import Link from "next/link";
import { BookOpen } from "lucide-react";
import { PricingExample } from "@/components/price-list/PricingExample";
import { buildPricingExample } from "@/lib/pricing-example";

export const dynamic = "force-dynamic";

export default function ExamplePage() {
  return <main className="min-h-screen bg-[#f5f6f8] px-3 py-5 sm:px-6">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase text-[#8a5a0a]">Práctica · datos simulados</p><h1 className="mt-1 text-2xl font-bold text-[#17202a]">Ejemplo de evaluación de precios</h1></div>
      <Link href="/guia" className="inline-flex items-center gap-2 text-sm font-semibold text-[#153d7b]"><BookOpen className="h-4 w-4" />Manual y presentación</Link>
    </header>
    <PricingExample initial={buildPricingExample()} />
  </main>;
}
