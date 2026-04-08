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
  txHash: Hex | null;
  totalAmount: bigint;
  tokenSymbol: TokenSymbol;
  decimals: number;
  recipientCount: number;
}

export function SuccessModal({
  isOpen,
  onClose,
  txHash,
  totalAmount,
  tokenSymbol,
  decimals,
  recipientCount,
}: SuccessModalProps) {
  if (!isOpen) return null;

  const amountFormatted = formatTokenAmount(totalAmount, decimals, 2);
  const shareText = `Just routed a cross-token payroll of ${amountFormatted} ${tokenSymbol} to ${recipientCount} recipients in a single tx via WizPay on Arc Testnet! 🚀\n\nVerify it on-chain: ${EXPLORER_BASE_URL}/tx/${txHash}`;
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
              Batch Sent Successfully!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your payroll route is confirmed on the Arc Testnet.
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
            {txHash && (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-3 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground/70 text-xs">
                  {formatCompactAddress(txHash)}
                </span>
                <a
                  href={`${EXPLORER_BASE_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
                >
                  Explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
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
