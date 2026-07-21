import { PricingAlertsDashboard } from "@/components/pricing-alerts/PricingAlertsDashboard";

export default function AlertasPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8f2]">
      <section className="border-b border-[#d8e2f1] bg-[#153d7b] text-white">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Alertas de pricing</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85 sm:text-base">
            Revisá diferencias mayoristas, oportunidades y problemas de cobertura detectados por la actualización diaria.
          </p>
        </div>
      </section>
      <section className="w-full px-3 py-4 sm:px-4 lg:px-6">
        <PricingAlertsDashboard />
      </section>
    </main>
  );
}
