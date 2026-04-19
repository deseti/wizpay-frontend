import { NextResponse } from "next/server";

import {
  CircleTransferError,
  bootstrapTransferWallet,
  type CircleTransferBlockchain,
} from "@/lib/server/circle-transfer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      walletSetId?: string;
      walletSetName?: string;
      walletName?: string;
      refId?: string;
      blockchain?: CircleTransferBlockchain;
      tokenAddress?: string;
    };

    const wallet = await bootstrapTransferWallet({
      walletSetId: body.walletSetId,
      walletSetName: body.walletSetName,
      walletName: body.walletName,
      refId: body.refId,
      blockchain: body.blockchain,
      tokenAddress: body.tokenAddress,
    });

    return NextResponse.json({ data: wallet }, { status: 201 });
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