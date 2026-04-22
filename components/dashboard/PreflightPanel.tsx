"use client";

import { ShieldCheck, Activity, Percent, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TokenSymbol } from "@/lib/wizpay";
import { formatTokenAmount } from "@/lib/wizpay";

interface PreflightPanelProps {
  currentAllowance: bigint;
  approvalAmount: bigint;
  activeToken: { symbol: TokenSymbol; decimals: number };
  feeBps: bigint;
  allowanceLoading: boolean;
  feeLoading: boolean;
  rowDiagnostics: (string | null)[];
  insufficientBalance: boolean;
  selectedToken: TokenSymbol;
}

export function PreflightPanel({
  currentAllowance,
  approvalAmount,
  activeToken,
  feeBps,
  allowanceLoading,
  feeLoading,
  rowDiagnostics,
  insufficientBalance,
  selectedToken,
}: PreflightPanelProps) {
  const allowanceOk = currentAllowance >= approvalAmount && approvalAmount > 0n;
  const routeHealthy = !rowDiagnostics.some(Boolean);
  const uniqueDiagnostics = Array.from(
    new Set(rowDiagnostics.filter((diagnostic): diagnostic is string => Boolean(diagnostic)))
  ).slice(0, 3);

  return (
    <Card className="glass-card border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          Preflight
        </CardTitle>
        <CardDescription>
          Live checks before submission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Allowance */}
        <div className="rounded-xl border border-border/40 bg-background/35 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold">
              Allowance
            </p>
            <div className={`h-2 w-2 rounded-full ${allowanceOk ? 'bg-emerald-400 shadow-sm shadow-emerald-400/40' : 'bg-muted-foreground/30'}`} />
          </div>
            {allowanceLoading ? (
              <Skeleton className="mt-2 h-4 w-28 bg-muted/20" />
            ) : (
              <p className="mt-2 font-mono text-sm font-medium">
                {formatTokenAmount(currentAllowance, activeToken.decimals, 2)}{" "}
                {activeToken.symbol}
              </p>
            )}
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            Required:{" "}
            {formatTokenAmount(approvalAmount, activeToken.decimals, 2)}{" "}
            {activeToken.symbol}
          </p>
        </div>

        {/* Route health */}
        <div className="rounded-xl border border-border/40 bg-background/35 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Route health
            </p>
            <div className={`h-2 w-2 rounded-full ${routeHealthy ? 'bg-emerald-400 shadow-sm shadow-emerald-400/40' : 'bg-amber-400 shadow-sm shadow-amber-400/40'}`} />
          </div>
          <div className="mt-2 space-y-2">
            {rowDiagnostics.some(Boolean) ? (
              uniqueDiagnostics.map((diagnostic, index) => (
                  <p key={`${index}-${diagnostic}`} className="text-xs text-amber-300/80">
                    {diagnostic}
                  </p>
                ))
            ) : (
              <p className="text-xs text-emerald-300/80">
                Quotes and liquidity look healthy.
              </p>
            )}
          </div>
        </div>

        {/* Fee config */}
        <div className="rounded-xl border border-border/40 bg-background/35 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold flex items-center gap-1.5">
            <Percent className="h-3 w-3" />
            Fee config
          </p>
          {feeLoading ? (
            <Skeleton className="mt-2 h-4 w-24 bg-muted/20" />
          ) : (
            <p className="mt-2 text-sm font-medium">
              {(Number(feeBps) / 100).toFixed(2)}% <span className="text-muted-foreground/60 text-xs font-normal">({feeBps.toString()} bps)</span>
            </p>
          )}
        </div>

        {/* Insufficient balance warning */}
        {insufficientBalance ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/90">
              Balance is below the gross batch amount. Add more {selectedToken}{" "}
              before submitting.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
