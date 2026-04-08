import { NextResponse } from "next/server";
import { requestQuote } from "@/lib/stablefx";

/**
 * POST /api/fx/quote
 *
 * Request an FX quote for a stablecoin conversion.
 *
 * Body: { sourceCurrency, targetCurrency, sourceAmount }
 * Returns: { data: FxQuote }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceCurrency, targetCurrency, sourceAmount } = body;

    if (!sourceCurrency || !targetCurrency || !sourceAmount) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: sourceCurrency, targetCurrency, sourceAmount",
        },
        { status: 400 }
      );
    }

    const quote = requestQuote({ sourceCurrency, targetCurrency, sourceAmount });

    return NextResponse.json({ data: quote });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
