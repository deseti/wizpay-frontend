import { NextResponse } from "next/server";
import { requestQuote, CircleApiError } from "@/lib/stablefx";

/**
 * POST /api/fx/quote
 *
 * Request a live FX quote for a stablecoin conversion.
 * Calls Circle StableFX API under the hood.
 *
 * Body: { sourceCurrency, targetCurrency, sourceAmount }
 * Returns: { data: FxQuote }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceCurrency, targetCurrency, sourceAmount, recipientAddress } = body;

    if (!sourceCurrency || !targetCurrency || !sourceAmount) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: sourceCurrency, targetCurrency, sourceAmount",
        },
        { status: 400 }
      );
    }

    const quote = await requestQuote({
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      recipientAddress,
    });

    return NextResponse.json({ data: quote });
  } catch (err: unknown) {
    if (err instanceof CircleApiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
