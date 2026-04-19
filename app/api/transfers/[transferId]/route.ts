import { NextResponse } from "next/server";
import {
  CircleTransferError,
} from "@/lib/server/circle-transfer";
import { getCircleBridgeStatus } from "@/lib/server/circle-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transferId: string }> }
) {
  try {
    const { transferId } = await params;

    if (!transferId) {
      return NextResponse.json(
        { error: "Missing transferId parameter" },
        { status: 400 }
      );
    }

    const transfer = await getCircleBridgeStatus(transferId);

    return NextResponse.json({ data: transfer });
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