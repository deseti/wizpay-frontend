"use client";

import { ArrowRightLeft, Coins, History, Wallet } from "lucide-react";
import type { Address } from "viem";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fxProviderLabel, activeFxEngineAddress, isStableFxMode } from "@/lib/fx-config";
import {
  formatCompactAddress,
  formatTokenAmount,
  TOKEN_OPTIONS,
  type TokenSymbol,
} from "@/lib/wizpay";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardsProps {
  selectedToken: TokenSymbol;
  onTokenChange: (token: TokenSymbol) => void;
  isBusy: boolean;
  currentBalance: bigint;
  balanceLoading: boolean;
  activeToken: { symbol: TokenSymbol; decimals: number };
  walletAddress: string | undefined;
  totalRouted: bigint;
  historyCount: number;
  engineBalances: Record<TokenSymbol, bigint>;
  fxEngineData: Address | undefined;
  engineLoading: boolean;
  onClearMessages: () => void;
}

const cardAccents = [
  "from-violet-500/10 to-transparent",
  "from-emerald-500/10 to-transparent",
  "from-blue-500/10 to-transparent",
  "from-amber-500/10 to-transparent",
];

export function StatsCards({
  selectedToken,
  onTokenChange,
  isBusy,
  currentBalance,
  balanceLoading,
  activeToken,
  walletAddress,
  totalRouted,
  historyCount,
  engineBalances,
  fxEngineData,
  engineLoading,
  onClearMessages,
}: StatsCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Input Token */}
      <Card className="glass-card border-border/40 relative overflow-hidden group">
        <div className={`absolute inset-0 bg-gradient-to-br ${cardAccents[0]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
              <Coins className="h-3.5 w-3.5" />
            </div>
            Input Token
          </CardTitle>
          <CardDescription>
            Batch funded from one input token, routed per row.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 relative">
          <Select
            value={selectedToken}
            onValueChange={(value) => {
              onTokenChange(value as TokenSymbol);
              onClearMessages();
            }}
            disabled={isBusy}
          >
            <SelectTrigger className="h-11 bg-background/50 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOKEN_OPTIONS.map((token) => (
                <SelectItem key={token.symbol} value={token.symbol}>
                  {token.symbol} - {token.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground/70">
            Approval is exact to the gross batch spend.
          </p>
        </CardContent>
      </Card>

      {/* Token Balance */}
      <Card className="glass-card border-border/40 relative overflow-hidden group">
        <div className={`absolute inset-0 bg-gradient-to-br ${cardAccents[1]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Wallet className="h-3.5 w-3.5" />
            </div>
            Token Balance
          </CardTitle>
          <CardDescription>
            Refreshed after batch settlement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 relative">
          {balanceLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-32 bg-muted/20" />
              <Skeleton className="h-4 w-24 bg-muted/20" />
            </div>
          ) : (
            <p className="text-3xl font-bold tracking-tight">
              {formatTokenAmount(currentBalance, activeToken.decimals, 2)}
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-emerald-300/80 border-emerald-500/20 bg-emerald-500/5">{activeToken.symbol}</Badge>
            <span className="text-xs font-mono">
              {walletAddress ? formatCompactAddress(walletAddress) : "-"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Total Routed */}
      <Card className="glass-card border-border/40 relative overflow-hidden group">
        <div className={`absolute inset-0 bg-gradient-to-br ${cardAccents[2]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <History className="h-3.5 w-3.5" />
            </div>
            Total Routed
          </CardTitle>
          <CardDescription>
            From confirmed BatchPaymentRouted events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 relative">
          <p className="text-3xl font-bold tracking-tight">
            {formatTokenAmount(totalRouted, activeToken.decimals, 2)}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-blue-300/80 border-blue-500/20 bg-blue-500/5">{activeToken.symbol}</Badge>
            <span className="text-xs">{historyCount} confirmed batches</span>
          </div>
        </CardContent>
      </Card>

      {/* FX Engine */}
      <Card className="glass-card border-border/40 relative overflow-hidden group">
        <div className={`absolute inset-0 bg-gradient-to-br ${cardAccents[3]} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
        <CardHeader className="pb-3 relative">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </div>
            FX Engine
          </CardTitle>
          <CardDescription>
            {isStableFxMode
              ? "Circle StableFX institutional rates."
              : "Live pool liquidity for routing."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 relative">
          {engineLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-11 w-full rounded-xl bg-muted/20" />
              <Skeleton className="h-11 w-full rounded-xl bg-muted/20" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/20">
                <span className="text-sm text-muted-foreground">USDC</span>
                <span className="font-mono text-sm font-medium">
                  {formatTokenAmount(engineBalances.USDC, 6, 2)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/20">
                <span className="text-sm text-muted-foreground">EURC</span>
                <span className="font-mono text-sm font-medium">
                  {formatTokenAmount(engineBalances.EURC, 6, 2)}
                </span>
              </div>
            </>
          )}
          <p className="text-[11px] text-muted-foreground/60 font-mono">
            {engineLoading
              ? "Loading engine liquidity..."
              : `${fxProviderLabel}: ${fxEngineData ? formatCompactAddress(fxEngineData) : formatCompactAddress(activeFxEngineAddress)}`}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
