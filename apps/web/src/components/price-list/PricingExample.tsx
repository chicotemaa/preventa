"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { buildPricingExample } from "@/lib/pricing-example";
import { ImportDecisionTable } from "./ImportDecisionTable";

export function PricingExample({ initial }: { initial: ReturnType<typeof buildPricingExample> }) {
  const [response, setResponse] = useState(initial);
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-[#cfd8e3] py-3">
      <p className="max-w-3xl text-sm text-[#526170]">Datos simulados. Supuestos iniciales: sin IVA ni ajustes, margen objetivo 20%. No son cotizaciones, no representan condiciones del cliente y no se guardan.</p>
      <button type="button" onClick={() => setResponse(initial)} className="inline-flex items-center gap-2 rounded border border-[#cfd8e3] bg-white px-3 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4" />Restablecer ejemplo</button>
    </div>
    <ImportDecisionTable response={response} example onCostConditionsChange={(rowNumber, costConditions) => {
      setResponse(current => ({ ...current, results: current.results.map(row => row.input.rowNumber === rowNumber ? { ...row, costConditions } : row) }));
    }} />
  </>;
}
