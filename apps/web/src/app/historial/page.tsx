import { PriceListHistory } from "../price-list-history";

export default function HistorialPage() {
  return (
    <main className="min-h-screen bg-[#fff8f2]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-8">
        <PriceListHistory />
      </section>
    </main>
  );
}
