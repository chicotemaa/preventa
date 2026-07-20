import { PricingReviewDashboard } from "@/components/price-review/PricingReviewDashboard";

export default function RevisionesPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8f2]">
      <section className="border-b border-[#d8e2f1] bg-[#153d7b] text-white">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Tablero de decisiones</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85 sm:text-base">
            Priorizá ajustes de precio, equivalencias y cambios semanales sobre la última lista guardada.
          </p>
        </div>
      </section>
      <section className="w-full px-3 py-4 sm:px-4 lg:px-6">
        <PricingReviewDashboard />
      </section>
    </main>
  );
}
