import { PriceEvolution } from "../price-evolution";

export default function EvolucionPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8f2]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 md:py-6 lg:px-8">
        <PriceEvolution />
      </section>
    </main>
  );
}
