"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Wallet, Mail, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ConnectWalletCard() {
  const { login } = usePrivy();

  return (
    <Card className="glass-card animate-fade-up overflow-hidden border-border/60">
      <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary ring-1 ring-primary/25">
          <Wallet className="h-9 w-9" />
        </div>
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-gradient">
            Sign in to unlock the live WizPay dashboard
          </h1>
          <p className="text-base text-muted-foreground">
            Connect with Google, X, Email, or your preferred Web3 wallet.
            The dashboard will read your Arc Testnet balance, routed batch
            history, and current StableFX liquidity in real time.
          </p>
        </div>

        {/* Login method hints */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Social Login
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Web3 Wallet
          </span>
        </div>

        <button
          id="privy-connect-btn"
          onClick={login}
          className="group relative inline-flex items-center gap-2.5 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:brightness-110 active:scale-[0.98]"
        >
          <Wallet className="h-5 w-5 transition-transform group-hover:scale-110" />
          Sign In to WizPay
        </button>
      </CardContent>
    </Card>
  );
}
