import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";

const BRIDGE_STATE_PREFIX = "wizpay:bridge:";
const BRIDGE_STATE_TTL = 600; // 10 minutes TTL

interface BridgeState {
  transferId: string;
  status: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  createdAt: number;
  updatedAt: number;
  steps?: unknown[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("wallet");

  if (!walletAddress) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    const redis = getRedisClient();
    const key = `${BRIDGE_STATE_PREFIX}${walletAddress.toLowerCase()}`;
    const data = await redis.get<BridgeState>(key);

    if (!data) {
      return NextResponse.json({ state: null });
    }

    // Check if state is stale (completed/failed transfers older than TTL)
    const isTerminal = data.status === "completed" || data.status === "failed";
    const ageMs = Date.now() - data.updatedAt;

    if (isTerminal && ageMs > BRIDGE_STATE_TTL * 1000) {
      await redis.del(key);
      return NextResponse.json({ state: null });
    }

    return NextResponse.json({ state: data });
  } catch {
    return NextResponse.json({ state: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      wallet: string;
      state: BridgeState | null;
    };

    if (!body.wallet) {
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    }

    const redis = getRedisClient();
    const key = `${BRIDGE_STATE_PREFIX}${body.wallet.toLowerCase()}`;

    if (body.state === null) {
      // Clear state
      await redis.del(key);
      return NextResponse.json({ ok: true });
    }

    const state: BridgeState = {
      ...body.state,
      updatedAt: Date.now(),
    };

    // Use TTL so stale data auto-expires
    await redis.set(key, state, { ex: BRIDGE_STATE_TTL });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to save bridge state" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("wallet");

  if (!walletAddress) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    const redis = getRedisClient();
    const key = `${BRIDGE_STATE_PREFIX}${walletAddress.toLowerCase()}`;
    await redis.del(key);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to clear bridge state" },
      { status: 500 }
    );
  }
}
