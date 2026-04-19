"use client";

import { useEffect } from "react";

const PROXIED_HOSTS = new Set([
  "api.circle.com",
  "iris-api.circle.com",
  "iris-api-sandbox.circle.com",
]);

function resolveRequestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }

    if (input instanceof URL) {
      return new URL(input.toString(), window.location.origin);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }
  } catch {
    return null;
  }

  return null;
}

function shouldProxyCircleRequest(url: URL) {
  if (!PROXIED_HOSTS.has(url.host)) {
    return false;
  }

  return (
    url.pathname.startsWith("/v1/stablecoinKits/") ||
    url.pathname.startsWith("/v2/messages/")
  );
}

export function CircleApiProxyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const targetUrl = resolveRequestUrl(input);

      if (!targetUrl || !shouldProxyCircleRequest(targetUrl)) {
        return originalFetch(input, init);
      }

      const request = new Request(input, init);

      const headers = Object.fromEntries(request.headers.entries());
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.clone().text();

      return originalFetch("/api/circle/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: targetUrl.toString(),
          method: request.method,
          headers,
          body,
        }),
        signal: request.signal,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return children;
}