import { NextResponse } from "next/server";
import { executeTrade } from "@/lib/stablefx";

/**
 * POST /api/fx/execute
 *
 * Execute a previously quoted FX trade.
 *
 * Body: { quoteId, senderAddress, referenceId? }
 * Returns: { data: FxTrade }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quoteId, senderAddress, referenceId } = body;

    if (!quoteId || !senderAddress) {
      return NextResponse.json(
        { error: "Missing required fields: quoteId, senderAddress" },
        { status: 400 }
      );
    }

    const trade = executeTrade({ quoteId, senderAddress, referenceId });

    return NextResponse.json({ data: trade }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
