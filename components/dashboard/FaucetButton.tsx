"use client";

import { useState } from "react";
import { Droplet, Copy, Check } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function FaucetButton() {
  const { address } = useAccount();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {address && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            1. Copy your address
          </p>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                toast({
                  title: "Address Copied!",
                  description: "Paste this into the Circle Faucet.",
                });
                setTimeout(() => setCopied(false), 2000);
              } catch (e) {
                console.error(e);
              }
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-mono text-foreground/80 transition-colors hover:bg-muted/80 hover:text-foreground active:scale-[0.98]"
          >
            {truncateAddress(address)}
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {address && (
          <p className="px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            2. Request Tokens
          </p>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-background/50 text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all group"
          asChild
        >
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="flex items-center justify-center rounded-lg bg-primary/15 p-1 text-primary group-hover:scale-110 transition-transform">
              <Droplet className="h-4 w-4" />
            </div>
            Get Testnet Tokens ↗
          </a>
        </Button>
      </div>
    </div>
  );
}
