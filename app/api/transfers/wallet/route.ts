import { NextResponse } from "next/server";

import {
  CircleTransferError,
  getTransferWallet,
  type CircleTransferBlockchain,
} from "@/lib/server/circle-transfer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = await getTransferWallet({
      walletId: searchParams.get("walletId") || undefined,
      walletAddress: searchParams.get("walletAddress") || undefined,
      blockchain:
        (searchParams.get("blockchain") as CircleTransferBlockchain | null) ||
        undefined,
      tokenAddress: searchParams.get("tokenAddress") || undefined,
    });

    return NextResponse.json({ data: wallet });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof CircleTransferError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(typeof error.details !== "undefined" ? { details: error.details } : {}),
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}