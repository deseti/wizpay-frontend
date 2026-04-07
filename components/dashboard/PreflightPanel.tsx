"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TokenSymbol } from "@/lib/wizpay";
import { formatTokenAmount } from "@/lib/wizpay";

interface PreflightPanelProps {
  currentAllowance: bigint;
  approvalAmount: bigint;
  activeToken: { symbol: TokenSymbol; decimals: number };
  feeBps: bigint;
  rowDiagnostics: (string | null)[];
  insufficientBalance: boolean;
  selectedToken: TokenSymbol;
}

export function PreflightPanel({
  currentAllowance,
  approvalAmount,
  activeToken,
  feeBps,
  rowDiagnostics,
  insufficientBalance,
  selectedToken,
}: PreflightPanelProps) {
  return (
    <Card className="glass-card border-border/60">
      <CardHeader>
        <CardTitle>Preflight</CardTitle>
        <CardDescription>
          Live checks before `writeContract` is allowed to fire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Allowance */}
        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Allowance
          </p>
          <p className="mt-2 font-mono text-sm">
            {formatTokenAmount(currentAllowance, activeToken.decimals, 2)}{" "}
            {activeToken.symbol}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Required:{" "}
            {formatTokenAmount(approvalAmount, activeToken.decimals, 2)}{" "}
            {activeToken.symbol}
          </p>
        </div>

        {/* Route health */}
        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Route health
          </p>
          <div className="mt-2 space-y-2">
            {rowDiagnostics.some(Boolean) ? (
              rowDiagnostics
                .filter((d): d is string => Boolean(d))
                .slice(0, 3)
                .map((diagnostic) => (
                  <p key={diagnostic} className="text-xs text-amber-300">
                    {diagnostic}
                  </p>
                ))
            ) : (
              <p className="text-xs text-emerald-300">
                Quotes and liquidity checks look healthy for the current draft.
              </p>
            )}
          </div>
        </div>

        {/* Fee config */}
        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Fee config
          </p>
          <p className="mt-2 text-sm">
            {(Number(feeBps) / 100).toFixed(2)}% ({feeBps.toString()} bps)
          </p>
        </div>

        {/* Insufficient balance warning */}
        {insufficientBalance ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-xs text-amber-200">
            Balance is below the gross batch amount. Add more {selectedToken}{" "}
            before submitting.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
