"use client";

import { ExternalLink, Wallet, TrendingUp, ArrowRightLeft } from "lucide-react";
import Link from "next/link";

import { DashboardAppFrame } from "@/components/dashboard/DashboardAppFrame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyStateView } from "@/components/ui/empty-state";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useWizPay } from "@/hooks/wizpay";
import { formatTokenAmount, TOKEN_OPTIONS, EXPLORER_BASE_URL } from "@/lib/wizpay";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import type { UnifiedHistoryItem } from "@/lib/types";

function TokenDetailCard({
  symbol,
  name,
  balance,
  decimals,
  address,
  history,
}: {
  symbol: string;
  name: string;
  balance: bigint;
  decimals: number;
  address: string;
  history: UnifiedHistoryItem[];
}) {
  const formattedBalance = formatTokenAmount(balance, decimals);
  const isEmpty = balance === 0n;

  // Filter history for this token
  const tokenHistory = history.filter(
    (item) =>
      item.tokenIn?.toLowerCase() === address.toLowerCase() ||
      item.tokenOut?.toLowerCase() === address.toLowerCase() ||
      item.lpToken?.toLowerCase() === address.toLowerCase()
  ).slice(0, 5);

  return (
    <Card className="glass-card border-border/40 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg ring-1 ring-primary/20">
              {symbol.charAt(0)}
            </div>
            <div>
              <CardTitle className="text-lg">{symbol}</CardTitle>
              <p className="text-xs text-muted-foreground/60">{name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xl font-bold font-mono ${isEmpty ? "text-muted-foreground/40" : ""}`}>
              {formattedBalance}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Quick actions */}
        <div className="flex gap-2">
          <Link href="/send" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 border-border/40">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Send
            </Button>
          </Link>
          <Link href="/swap" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-1.5 border-border/40">
              <TrendingUp className="h-3.5 w-3.5" />
              Swap
            </Button>
          </Link>
          <a
            href={`${EXPLORER_BASE_URL}/token/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full gap-1.5 border-border/40">
              <ExternalLink className="h-3.5 w-3.5" />
              Explorer
            </Button>
          </a>
        </div>

        {/* Recent token history */}
        {tokenHistory.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-background/20 divide-y divide-border/20">
            <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold">
              Recent Activity
            </p>
            {tokenHistory.map((item) => {
              const actionLabel =
                item.type === "payroll" ? "Send" :
                item.type === "add_lp" ? "Add LP" :
                item.type === "remove_lp" ? "Remove LP" : item.type;
              const amount = item.totalAmountIn
                ? formatTokenAmount(item.totalAmountIn, 6)
                : item.lpAmount
                  ? formatTokenAmount(item.lpAmount, 6)
                  : "—";

              return (
                <a
                  key={item.txHash}
                  href={`${EXPLORER_BASE_URL}/tx/${item.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/15 transition-colors"
                >
                  <div>
                    <p className="text-xs font-medium">{actionLabel}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {new Date(item.timestampMs).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="text-xs font-mono">{amount} {symbol}</p>
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssetsContent() {
  const { balances, isLoading } = useTokenBalances();
  const { walletAddress } = useActiveWalletAddress();
  const wp = useWizPay();

  if (isLoading) {
    return (
      <div className="animate-fade-up space-y-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Assets</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="glass-card border-border/40">
              <CardContent className="py-8">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-muted/25 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-20 rounded bg-muted/20 animate-pulse" />
                    <div className="h-3 w-32 rounded bg-muted/15 animate-pulse" />
                  </div>
                  <div className="h-6 w-24 rounded bg-muted/20 animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const hasAnyBalance = TOKEN_OPTIONS.some((t) => balances[t.symbol] > 0n);

  return (
    <div className="animate-fade-up space-y-5 stagger-children">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Assets</h1>
          <p className="text-sm text-muted-foreground/70">
            Your token balances and activity on Arc Testnet.
          </p>
        </div>
        {walletAddress && (
          <a
            href={`${EXPLORER_BASE_URL}/address/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            View on Explorer <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {!hasAnyBalance ? (
        <EmptyStateView
          icon={<Wallet className="h-7 w-7 text-primary/60" />}
          title="No Assets Yet"
          description="Fund your wallet with testnet tokens to get started. Use the faucet to get USDC and EURC."
          action={
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                className="glow-btn bg-gradient-to-r from-primary to-violet-500 text-primary-foreground"
              >
                Get Testnet Tokens
              </Button>
            </a>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {TOKEN_OPTIONS.map((token) => (
            <TokenDetailCard
              key={token.symbol}
              symbol={token.symbol}
              name={token.name}
              balance={balances[token.symbol]}
              decimals={token.decimals}
              address={token.address}
              history={wp.unifiedHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <DashboardAppFrame>
      <AssetsContent />
    </DashboardAppFrame>
  );
}
