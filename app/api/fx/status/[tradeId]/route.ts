import { NextResponse } from "next/server";
import { getTradeStatus } from "@/lib/stablefx";

/**
 * GET /api/fx/status/[tradeId]
 *
 * Check the settlement status of a previously executed trade.
 *
 * Returns: { data: FxTrade }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const { tradeId } = await params;

  if (!tradeId) {
    return NextResponse.json(
      { error: "Missing tradeId parameter" },
      { status: 400 }
    );
  }

  const trade = getTradeStatus(tradeId);

  return NextResponse.json({ data: trade });
}
