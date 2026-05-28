import { PriceEvolution } from "../price-evolution";

export default function EvolucionPage() {
  return (
    <main className="min-h-screen bg-[#fff8f2]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-5 sm:py-6 md:px-8">
        <PriceEvolution />
      </section>
    </main>
  );
}
