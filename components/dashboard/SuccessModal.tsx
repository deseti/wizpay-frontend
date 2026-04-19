"use client";

import { CheckCircle2, ExternalLink, MessageCircle, X, Sparkles } from "lucide-react";
import type { Hex } from "viem";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EXPLORER_BASE_URL,
  formatCompactAddress,
  formatTokenAmount,
  type TokenSymbol,
} from "@/lib/wizpay";

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  txHash: string | null;
  approvalTxHash?: string | null;
  txHashes?: string[];
  totalAmount: bigint;
  tokenSymbol: TokenSymbol;
  decimals: number;
  recipientCount: number;
  isMultiBatch: boolean;
  referenceId: string;
  sessionTotalDistributed: Record<TokenSymbol, bigint>;
}

function isExplorerHash(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function SuccessModal({
  isOpen,
  onClose,
  txHash,
  approvalTxHash,
  txHashes = [],
  totalAmount,
  tokenSymbol,
  decimals,
  recipientCount,
  isMultiBatch,
  referenceId,
  sessionTotalDistributed,
}: SuccessModalProps) {
  if (!isOpen) return null;

  const amountFormatted = formatTokenAmount(totalAmount, decimals, 2);
  const submissionHashes = txHashes.filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
  const shareSummary = isMultiBatch
    ? `Just settled a payroll of ${amountFormatted} ${tokenSymbol} to ${recipientCount} recipients across multiple submissions on Arc Testnet! 🚀`
    : `Just settled a payroll of ${amountFormatted} ${tokenSymbol} to ${recipientCount} recipients on Arc Testnet! 🚀`;
  const shareDetails = txHash
    ? isExplorerHash(txHash)
      ? `\n\nVerify it on-chain: ${EXPLORER_BASE_URL}/tx/${txHash}`
      : `\n\nCircle settlement reference: ${txHash}`
    : "";
  const shareText = `${shareSummary}${shareDetails}`;
  const xShareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-background/85 px-4 backdrop-blur-md transition-all duration-300">
      <Card className="glass-card relative w-full max-w-md animate-scale-in border-primary/30 shadow-2xl shadow-primary/15">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-32 w-48 rounded-full bg-emerald-500/10 blur-[60px]" />

        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground hover:bg-background/50 hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
        <CardContent className="flex flex-col items-center gap-6 pb-8 pt-10 text-center relative">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/10" />
            <div className="absolute -inset-2 animate-spin-slow rounded-full opacity-40">
              <Sparkles className="h-5 w-5 text-emerald-300 absolute top-0 left-1/2 -translate-x-1/2" />
              <Sparkles className="h-4 w-4 text-emerald-300 absolute bottom-0 right-0" />
              <Sparkles className="h-3 w-3 text-emerald-300 absolute top-1/2 left-0" />
            </div>
            <CheckCircle2 className="h-12 w-12 text-emerald-400 relative z-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight neon-text">
              Payroll Settled Successfully!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your latest payroll settlement completed successfully on Arc.
            </p>
          </div>

          <div className="w-full rounded-2xl border border-border/40 bg-background/35 p-4 shadow-inner">
            <div className="grid grid-cols-2 gap-4 divide-x divide-border/40">
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground/60 font-semibold">
                  Amount Routed
                </p>
                <p className="font-mono text-xl font-bold">
                  {amountFormatted}{" "}
                  <span className="text-sm font-medium text-muted-foreground">{tokenSymbol}</span>
                </p>
              </div>
              <div className="space-y-1 pl-4">
                <p className="text-xs uppercase text-muted-foreground/60 font-semibold">
                  Recipients
                </p>
                <p className="font-mono text-xl font-bold">
                  {recipientCount}
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mt-4 pt-4 border-t border-border/40 text-left">
              <p className="text-xs uppercase text-muted-foreground/60 font-semibold mb-3">
                Successfully Distributed
              </p>
              <div className="flex flex-col gap-2">
                {Object.entries(sessionTotalDistributed).map(([token, amount]) => {
                  if (amount === 0n) return null;
                  return (
                    <div key={token} className="flex justify-between items-center bg-background/50 rounded-xl px-3 py-2 border border-border/30">
                      <span className="font-mono text-lg font-bold">
                        {formatTokenAmount(amount, decimals, 2)}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">{token}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {approvalTxHash ? (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-3 py-2.5 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                    Approval Tx
                  </p>
                  <span className="font-mono text-muted-foreground/70 text-xs">
                    {formatCompactAddress(approvalTxHash)}
                  </span>
                </div>
                {isExplorerHash(approvalTxHash) ? (
                  <a
                    href={`${EXPLORER_BASE_URL}/tx/${approvalTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
                  >
                    Explorer <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {submissionHashes.length > 0 ? (
              <div className="mt-5 flex flex-col gap-2 rounded-xl border border-border/30 bg-background/50 px-3 py-3 text-sm text-left">
                <p className="text-xs uppercase text-muted-foreground/60 font-semibold">
                  {submissionHashes.length > 1 ? "Batch Transactions" : "Transaction"}
                </p>
                <div className="flex flex-col gap-2">
                  {submissionHashes.map((hash, index) => (
                    <div
                      key={`${hash}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-border/25 bg-background/45 px-3 py-2"
                    >
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                          {submissionHashes.length > 1 ? `Batch ${index + 1}` : "Final Tx"}
                        </p>
                        <span className="font-mono text-muted-foreground/70 text-xs">
                          {formatCompactAddress(hash)}
                        </span>
                      </div>
                      {isExplorerHash(hash) ? (
                        <a
                          href={`${EXPLORER_BASE_URL}/tx/${hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
                        >
                          Explorer <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isMultiBatch ? (
              <div className="mt-5 flex flex-col gap-2 rounded-xl border border-border/30 bg-background/50 px-3 py-3 text-sm text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/70 uppercase font-semibold">Reference ID</span>
                  <span className="font-mono font-bold text-emerald-400">{referenceId.replace(/-\d+$/, "")}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Each batch hash is shown above and the full recipient breakdown remains in History.
                </p>
              </div>
            ) : txHash && submissionHashes.length === 0 ? (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-3 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground/70 text-xs">
                  {formatCompactAddress(txHash)}
                </span>
                {isExplorerHash(txHash) ? (
                  <a
                    href={`${EXPLORER_BASE_URL}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
                  >
                    Explorer <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-xs font-semibold text-emerald-300/85">
                    Circle Settlement Reference
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3">
            <Button
              className="w-full gap-2 bg-[#1DA1F2] text-white hover:bg-[#1A8CD8] shadow-lg shadow-[#1DA1F2]/20"
              asChild
            >
              <a href={xShareUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                Share to X (Twitter)
              </a>
            </Button>
            <Button
              variant="outline"
              className="w-full bg-background/40 border-border/40 hover:border-primary/20"
              onClick={onClose}
            >
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
