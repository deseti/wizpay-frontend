import { NextResponse } from "next/server";
import { executeTrade, CircleApiError } from "@/lib/stablefx";

/**
 * POST /api/fx/execute
 *
 * Execute a previously quoted FX trade via Circle StableFX.
 *
 * Body: { quoteId, senderAddress, signature, referenceId? }
 *
 * The `signature` is the user's EIP-712 signature over the Permit2
 * typedData returned in the quote response. The frontend obtains it
 * by calling eth_signTypedData_v4 with the typedData from the quote.
 *
 * Returns: { data: FxTrade }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quoteId, senderAddress, signature, referenceId } = body;

    if (!quoteId || !senderAddress || !signature) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: quoteId, senderAddress, signature",
        },
        { status: 400 }
      );
    }

    const trade = await executeTrade({
      quoteId,
      senderAddress,
      signature,
      referenceId,
    });

    return NextResponse.json({ data: trade }, { status: 201 });
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
