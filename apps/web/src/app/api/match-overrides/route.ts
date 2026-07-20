import { NextResponse } from "next/server";
import {
  getProductMatchOverrides,
  saveProductMatchOverride,
  type SaveMatchOverrideInput,
} from "@/lib/match-overrides";

export async function GET() {
  return NextResponse.json(await getProductMatchOverrides());
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<SaveMatchOverrideInput>;

    if (!isValidPayload(payload)) {
      return NextResponse.json(
        { saved: false, errorMessage: "Equivalencia incompleta o invalida." },
        { status: 400 },
      );
    }

    const result = await saveProductMatchOverride(payload);
    return NextResponse.json(result, { status: result.saved ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        saved: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : "No se pudo procesar la equivalencia.",
      },
      { status: 400 },
    );
  }
}

function isValidPayload(
  payload: Partial<SaveMatchOverrideInput>,
): payload is SaveMatchOverrideInput {
  return Boolean(
    payload.item &&
      typeof payload.item.rowNumber === "number" &&
      payload.candidate?.sourceId?.trim() &&
      payload.candidate.storeName?.trim() &&
      payload.candidate.productName?.trim() &&
      (payload.status === "confirmed" || payload.status === "rejected"),
  );
}
