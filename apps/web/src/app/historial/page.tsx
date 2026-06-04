import { PriceListHistory } from "../price-list-history";

export default function HistorialPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fff8f2]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 md:py-6 lg:px-8">
        <PriceListHistory />
      </section>
    </main>
  );
}
