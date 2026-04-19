import { NextResponse } from "next/server";

const CIRCLE_BASE_URL =
  process.env.CIRCLE_BASE_URL ??
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ??
  "https://api.circle.com";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY ?? "";
const MAX_RATE_LIMIT_ATTEMPTS = 2;
const BASE_RATE_LIMIT_DELAY_MS = 800;
const MAX_RATE_LIMIT_DELAY_MS = 30000;

type CircleActionBody = {
  action?: string;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterHeaderMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(timestamp - Date.now(), 0);
}

function getRetryAfterMs(payload: unknown, headerValue: string | null) {
  const headerMs = parseRetryAfterHeaderMs(headerValue);
  const record = isRecord(payload) ? payload : {};
  const bodyMs =
    (typeof record.retryAfterMs === "number" && record.retryAfterMs >= 0
      ? record.retryAfterMs
      : null) ??
    (typeof record.retry_after === "number" && record.retry_after >= 0
      ? record.retry_after * 1000
      : null) ??
    (typeof record.retryAfter === "number" && record.retryAfter >= 0
      ? record.retryAfter * 1000
      : null);

  if (headerMs !== null && bodyMs !== null) {
    return Math.max(headerMs, bodyMs);
  }

  return headerMs ?? bodyMs ?? null;
}

function getRateLimitDelayMs(retryAfterMs: number | null, attempt: number) {
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, MAX_RATE_LIMIT_DELAY_MS);
  }

  return Math.min(
    BASE_RATE_LIMIT_DELAY_MS * 2 ** attempt,
    MAX_RATE_LIMIT_DELAY_MS
  );
}

function normalizeCircleErrorPayload({
  payload,
  status,
  retryAfterMs,
}: {
  payload: unknown;
  retryAfterMs: number | null;
  status: number;
}) {
  const record = isRecord(payload) ? payload : {};
  const message =
    (typeof record.error === "string" && record.error) ||
    (typeof record.message === "string" && record.message) ||
    (status === 429
      ? "Circle rate limit reached while contacting Circle Wallets. Retry in a few seconds."
      : `Circle request failed with status ${status}.`);

  return {
    ...record,
    error: message,
    retryAfterMs,
    status,
  };
}

function ensureApiKey() {
  if (!CIRCLE_API_KEY) {
    throw new Error(
      "CIRCLE_API_KEY is missing. Configure the server before using Circle Wallets."
    );
  }
}

async function circleRequest({
  path,
  method,
  body,
  retryOnRateLimit,
  searchParams,
  userToken,
}: {
  body?: Record<string, unknown>;
  method: "GET" | "POST";
  path: string;
  retryOnRateLimit?: boolean;
  searchParams?: Record<string, string>;
  userToken?: string;
}) {
  ensureApiKey();

  const url = new URL(path, CIRCLE_BASE_URL);

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const attempts = retryOnRateLimit || method === "GET" ? MAX_RATE_LIMIT_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(userToken ? { "X-User-Token": userToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const retryAfterMs = getRetryAfterMs(
      payload,
      response.headers.get("retry-after")
    );

    if (response.ok) {
      return NextResponse.json(payload.data ?? payload, { status: response.status });
    }

    if (response.status === 429 && attempt < attempts - 1) {
      const delayMs = getRateLimitDelayMs(retryAfterMs, attempt);

      console.warn(
        `[api/w3s] Circle ${method} ${path} hit 429. Retrying in ${delayMs}ms (${attempt + 1}/${attempts - 1}).`
      );

      await waitFor(delayMs);
      continue;
    }

    const headers = new Headers();

    if (retryAfterMs !== null) {
      headers.set("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
    }

    return NextResponse.json(
      normalizeCircleErrorPayload({
        payload,
        retryAfterMs,
        status: response.status,
      }),
      {
        headers,
        status: response.status,
      }
    );
  }

  return NextResponse.json(
    { error: "Circle request ended before a response was returned.", status: 502 },
    { status: 502 }
  );
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CircleActionBody;
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing required field: action" },
        { status: 400 }
      );
    }

    switch (action) {
      case "createDeviceToken": {
        const { deviceId } = params;

        if (typeof deviceId !== "string" || !deviceId) {
          return NextResponse.json(
            { error: "Missing deviceId" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/users/social/token",
          body: {
            idempotencyKey: crypto.randomUUID(),
            deviceId,
          },
          retryOnRateLimit: true,
        });
      }

      case "requestEmailOtp": {
        const { deviceId, email } = params;

        if (typeof deviceId !== "string" || !deviceId || typeof email !== "string" || !email) {
          return NextResponse.json(
            { error: "Missing deviceId or email" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/users/email/token",
          body: {
            idempotencyKey: crypto.randomUUID(),
            deviceId,
            email,
          },
          retryOnRateLimit: true,
        });
      }

      case "initializeUser": {
        const { userToken } = params;

        if (typeof userToken !== "string" || !userToken) {
          return NextResponse.json(
            { error: "Missing userToken" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/user/initialize",
          userToken,
          body: {
            idempotencyKey: crypto.randomUUID(),
            accountType: "SCA",
            blockchains: ["ARC-TESTNET", "ETH-SEPOLIA"],
          },
          retryOnRateLimit: true,
        });
      }

      case "listWallets": {
        const { userToken } = params;

        if (typeof userToken !== "string" || !userToken) {
          return NextResponse.json(
            { error: "Missing userToken" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "GET",
          path: "/v1/w3s/wallets",
          userToken,
          retryOnRateLimit: true,
        });
      }

      case "getWalletBalances": {
        const { userToken, walletId } = params;

        if (
          typeof userToken !== "string" ||
          !userToken ||
          typeof walletId !== "string" ||
          !walletId
        ) {
          return NextResponse.json(
            { error: "Missing userToken or walletId" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "GET",
          path: `/v1/w3s/wallets/${walletId}/balances`,
          userToken,
          retryOnRateLimit: true,
        });
      }

      case "createTransferChallenge": {
        const { userToken, payload } = params;

        if (
          typeof userToken !== "string" ||
          !userToken ||
          !payload ||
          typeof payload !== "object"
        ) {
          return NextResponse.json(
            { error: "Missing userToken or payload" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/user/transactions/transfer",
          userToken,
          body: {
            idempotencyKey: crypto.randomUUID(),
            ...(payload as Record<string, unknown>),
          },
          retryOnRateLimit: true,
        });
      }

      case "createContractExecutionChallenge": {
        const { userToken, payload } = params;

        if (
          typeof userToken !== "string" ||
          !userToken ||
          !payload ||
          typeof payload !== "object"
        ) {
          return NextResponse.json(
            { error: "Missing userToken or payload" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/user/transactions/contractExecution",
          userToken,
          body: {
            idempotencyKey: crypto.randomUUID(),
            ...(payload as Record<string, unknown>),
          },
          retryOnRateLimit: true,
        });
      }

      case "createTypedDataChallenge": {
        const { userToken, payload } = params;

        if (
          typeof userToken !== "string" ||
          !userToken ||
          !payload ||
          typeof payload !== "object"
        ) {
          return NextResponse.json(
            { error: "Missing userToken or payload" },
            { status: 400 }
          );
        }

        return circleRequest({
          method: "POST",
          path: "/v1/w3s/user/sign/typedData",
          userToken,
          body: payload as Record<string, unknown>,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}