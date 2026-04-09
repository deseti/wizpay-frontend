import { NextResponse } from "next/server";
import { getTradeStatus, CircleApiError } from "@/lib/stablefx";

/**
 * GET /api/fx/status/[tradeId]
 *
 * Check the settlement status of a previously executed trade.
 * Polls Circle StableFX API for the latest status.
 *
 * Returns: { data: FxTrade }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  try {
    const { tradeId } = await params;

    if (!tradeId) {
      return NextResponse.json(
        { error: "Missing tradeId parameter" },
        { status: 400 }
      );
    }

    const trade = await getTradeStatus(tradeId);

    return NextResponse.json({ data: trade });
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
