"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Droplet, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSmartWalletAddress } from "@/hooks/useSmartWalletAddress";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface FaucetButtonProps {
  walletActions?: ReactNode;
}

export function FaucetButton({ walletActions }: FaucetButtonProps) {
  const {
    smartWalletAddress,
    isLoadingSmartWalletAddress,
  } = useSmartWalletAddress();
  const { toast } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<"wallet" | null>(null);

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress("wallet");
      toast({
        title: "Circle wallet address copied",
        description:
          "Use this address for Arc Testnet balances and upcoming Circle challenge-based actions.",
      });
      window.setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoadingSmartWalletAddress ? (
        <div className="space-y-1.5">
          <p className="px-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em]">
            Smart Wallet
          </p>
          <div className="h-11 rounded-xl border border-border/40 bg-background/20 animate-pulse" />
        </div>
      ) : null}

      {smartWalletAddress && (
        <div className="space-y-1.5">
          <p className="px-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em]">
            Circle Wallet
          </p>
          <button
            onClick={() => void copyAddress(smartWalletAddress)}
            className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-background/30 px-3 py-2.5 text-sm font-mono text-foreground/75 transition-all hover:bg-primary/8 hover:text-primary hover:border-primary/20 active:scale-[0.98]"
          >
            {truncateAddress(smartWalletAddress)}
            {copiedAddress === "wallet" ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
          <p className="px-1 text-[11px] text-muted-foreground/60 leading-relaxed">
            Fund this Circle user wallet with testnet assets before running payroll,
            swap, or bridge flows as they move to Circle execution.
          </p>
          {walletActions ? <div className="pt-1">{walletActions}</div> : null}
        </div>
      )}

      <div className="space-y-1.5">
        {smartWalletAddress && (
          <p className="px-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em]">
            Circle Faucet
          </p>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-3 border-border/40 bg-background/30 text-muted-foreground shadow-sm hover:border-primary/30 hover:bg-primary/8 hover:text-primary transition-all group"
          asChild
        >
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="flex items-center justify-center rounded-lg bg-primary/15 p-1.5 text-primary group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all">
              <Droplet className="h-4 w-4" />
            </div>
            Get Circle Test Tokens ↗
          </a>
        </Button>
      </div>
    </div>
  );
}
