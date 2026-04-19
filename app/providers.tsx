"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { CircleApiProxyProvider } from "@/components/providers/CircleApiProxyProvider";
import { CircleWalletProvider } from "@/components/providers/CircleWalletProvider";
import { config } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <CircleWalletProvider>
          <CircleApiProxyProvider>{children}</CircleApiProxyProvider>
        </CircleWalletProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
