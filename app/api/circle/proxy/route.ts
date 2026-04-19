import { NextResponse } from "next/server";

const ALLOWED_UPSTREAMS = new Set([
  "api.circle.com",
  "iris-api.circle.com",
  "iris-api-sandbox.circle.com",
]);

const BLOCKED_HEADERS = new Set([
  "authorization",
  "content-length",
  "host",
  "origin",
  "referer",
  "x-user-agent",
]);

function isAllowedCircleUrl(url: URL) {
  if (!ALLOWED_UPSTREAMS.has(url.host)) {
    return false;
  }

  return (
    url.pathname.startsWith("/v1/stablecoinKits/") ||
    url.pathname.startsWith("/v2/messages/")
  );
}

function getServerCircleKitKey() {
  return process.env.CIRCLE_KIT_KEY ?? process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ?? "";
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      body?: string;
      headers?: Record<string, string>;
      method?: string;
      url?: string;
    };

    if (!body.url || !body.method) {
      return NextResponse.json(
        { error: "Missing required fields: url and method" },
        { status: 400 }
      );
    }

    const upstreamUrl = new URL(body.url);

    if (!isAllowedCircleUrl(upstreamUrl)) {
      return NextResponse.json(
        { error: "Unsupported upstream URL" },
        { status: 400 }
      );
    }

    const upstreamHeaders = new Headers();
    for (const [key, value] of Object.entries(body.headers ?? {})) {
      if (!value || BLOCKED_HEADERS.has(key.toLowerCase())) {
        continue;
      }

      upstreamHeaders.set(key, value);
    }

    if (upstreamUrl.host === "api.circle.com") {
      const kitKey = getServerCircleKitKey();
      if (!kitKey) {
        return NextResponse.json(
          {
            error:
              "Circle Kit key is not configured on the server. Set CIRCLE_KIT_KEY or NEXT_PUBLIC_CIRCLE_KIT_KEY.",
          },
          { status: 500 }
        );
      }

      upstreamHeaders.set("Authorization", `Bearer ${kitKey}`);
    }

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: body.method,
      headers: upstreamHeaders,
      body:
        body.method === "GET" || body.method === "HEAD"
          ? undefined
          : body.body,
    });

    const responseText = await upstreamResponse.text();
    const contentType =
      upstreamResponse.headers.get("content-type") ?? "application/json";

    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to proxy Circle request";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}