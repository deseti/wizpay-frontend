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
import { STABLE_FX_ADAPTER_ADDRESS } from "@/constants/addresses";
import {
  formatCompactAddress,
  formatTokenAmount,
  TOKEN_OPTIONS,
  type TokenSymbol,
} from "@/lib/wizpay";
import { LiquidityManagerModal } from "./LiquidityManagerModal";
import { Button } from "@/components/ui/button";

interface StatsCardsProps {
  selectedToken: TokenSymbol;
  onTokenChange: (token: TokenSymbol) => void;
  isBusy: boolean;
  currentBalance: bigint;
  activeToken: { symbol: TokenSymbol; decimals: number };
  walletAddress: string | undefined;
  totalRouted: bigint;
  historyCount: number;
  engineBalances: Record<TokenSymbol, bigint>;
  fxEngineData: Address | undefined;
  onClearMessages: () => void;
}

export function StatsCards({
  selectedToken,
  onTokenChange,
  isBusy,
  currentBalance,
  activeToken,
  walletAddress,
  totalRouted,
  historyCount,
  engineBalances,
  fxEngineData,
  onClearMessages,
}: StatsCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Input Token */}
      <Card className="glass-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            Input Token
          </CardTitle>
          <CardDescription>
            The batch is funded from one input token, then routed per row.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={selectedToken}
            onValueChange={(value) => {
              onTokenChange(value as TokenSymbol);
              onClearMessages();
            }}
            disabled={isBusy}
          >
            <SelectTrigger className="h-11 bg-background/70">
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
          <p className="text-xs text-muted-foreground">
            Approval is exact to the gross batch spend. Fees are deducted from
            that same approved amount.
          </p>
        </CardContent>
      </Card>

      {/* Token Balance */}
      <Card className="glass-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Token Balance
          </CardTitle>
          <CardDescription>
            Always refreshed after successful batch settlement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight">
            {formatTokenAmount(currentBalance, activeToken.decimals, 2)}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{activeToken.symbol}</Badge>
            <span>
              {walletAddress ? formatCompactAddress(walletAddress) : "-"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Total Routed */}
      <Card className="glass-card border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Total Routed
          </CardTitle>
          <CardDescription>
            Summed from confirmed `BatchPaymentRouted` events for your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight">
            {formatTokenAmount(totalRouted, activeToken.decimals, 2)}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{activeToken.symbol}</Badge>
            <span>{historyCount} confirmed batches</span>
          </div>
        </CardContent>
      </Card>

      {/* FX Engine */}
      <Card className="glass-card border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-row justify-between items-start">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                FX Engine
              </CardTitle>
              <CardDescription>
                Live pool liquidity for WizPay routing.
              </CardDescription>
            </div>
            <LiquidityManagerModal>
              <Button variant="outline" size="sm" className="h-8 shadow-sm">
                Manage
              </Button>
            </LiquidityManagerModal>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">USDC</span>
            <span className="font-mono text-sm">
              {formatTokenAmount(engineBalances.USDC, 6, 2)}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">EURC</span>
            <span className="font-mono text-sm">
              {formatTokenAmount(engineBalances.EURC, 6, 2)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Engine:{" "}
            {fxEngineData
              ? formatCompactAddress(fxEngineData)
              : formatCompactAddress(STABLE_FX_ADAPTER_ADDRESS)}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
