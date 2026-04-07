"use client";

import { CheckCircle2, ExternalLink, MessageCircle, X } from "lucide-react";
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-background/80 px-4 backdrop-blur-sm transition-all duration-300">
      <Card className="glass-card relative w-full max-w-md animate-fade-up border-primary/40 shadow-2xl shadow-primary/20">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground hover:bg-background/50 hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
        <CardContent className="flex flex-col items-center gap-6 pb-8 pt-10 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/10" />
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-gradient">
              Batch Sent Successfully!
            </h2>
            <p className="text-base text-muted-foreground">
              Your payroll route is confirmed on the Arc Testnet.
            </p>
          </div>

          <div className="w-full rounded-2xl border border-border/60 bg-background/50 p-4 shadow-inner">
            <div className="grid grid-cols-2 gap-4 divide-x divide-border/60">
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">
                  Amount Routed
                </p>
                <p className="font-mono text-xl font-medium">
                  {amountFormatted}{" "}
                  <span className="text-sm">{tokenSymbol}</span>
                </p>
              </div>
              <div className="space-y-1 pl-4">
                <p className="text-xs uppercase text-muted-foreground">
                  Recipients
                </p>
                <p className="font-mono text-xl font-medium">
                  {recipientCount}
                </p>
              </div>
            </div>
            {txHash && (
              <div className="mt-5 flex items-center justify-between rounded-lg border border-border/40 bg-background/70 px-3 py-2.5 text-sm">
                <span className="font-mono text-muted-foreground">
                  {formatCompactAddress(txHash)}
                </span>
                <a
                  href={`${EXPLORER_BASE_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Explorer <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-3">
            <Button
              className="w-full gap-2 bg-[#1DA1F2] text-white hover:bg-[#1A8CD8]"
              asChild
            >
              <a href={xShareUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                Share to X (Twitter)
              </a>
            </Button>
            <Button
              variant="outline"
              className="w-full bg-background/50"
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
