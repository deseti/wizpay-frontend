"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ConnectWalletCard() {
  return (
    <Card className="glass-card animate-fade-up overflow-hidden border-border/60">
      <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary ring-1 ring-primary/25">
          <Wallet className="h-9 w-9" />
        </div>
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gradient">
            Connect a wallet to unlock the live WizPay dashboard
          </h1>
          <p className="text-base text-muted-foreground">
            The dashboard will read your Arc Testnet balance, routed batch
            history, and current StableFX liquidity in real time.
          </p>
        </div>
        <ConnectButton />
      </CardContent>
    </Card>
  );
}
