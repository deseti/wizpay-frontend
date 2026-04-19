import { after, NextResponse } from "next/server";
import {
  CircleTransferError,
  type CircleTransferBlockchain,
} from "@/lib/server/circle-transfer";
import {
  queueCircleBridgeTransfer,
  runCircleBridgeTransfer,
} from "@/lib/server/circle-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      destinationAddress?: string;
      amount?: string;
      referenceId?: string;
      tokenAddress?: string;
      walletId?: string;
      walletAddress?: string;
      blockchain?: CircleTransferBlockchain;
    };
    const {
      destinationAddress,
      amount,
      referenceId,
      tokenAddress,
      walletId,
      walletAddress,
      blockchain,
    } = body;

    if (!destinationAddress || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: destinationAddress, amount" },
        { status: 400 }
      );
    }

    const { execution, record } = await queueCircleBridgeTransfer({
      destinationAddress,
      amount,
      referenceId,
      tokenAddress,
      walletId,
      walletAddress,
      blockchain,
    });

    after(async () => {
      try {
        await runCircleBridgeTransfer(execution);
      } catch (error) {
        console.error("Circle bridge background execution failed", {
          error,
          transferId: execution.transferId,
        });
      }
    });

    return NextResponse.json({ data: record }, { status: 202 });
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