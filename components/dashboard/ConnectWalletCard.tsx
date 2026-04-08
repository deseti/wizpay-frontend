"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Wallet, Mail, Globe, Shield, Zap, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: Zap, label: "Multi-Token" },
  { icon: ArrowRightLeft, label: "Cross-Swap" },
  { icon: Shield, label: "On-Chain Verified" },
];

export function ConnectWalletCard() {
  const { login } = usePrivy();

  return (
    <Card className="glass-card animate-scale-in overflow-hidden border-border/40 w-full max-w-lg mx-auto relative">
      {/* Decorative glow orbs */}
      <div className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-primary/15 blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-36 w-36 rounded-full bg-violet-500/10 blur-[60px]" />

      <CardContent className="flex flex-col items-center gap-7 py-12 sm:py-16 text-center relative">
        {/* Animated Icon */}
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl animate-glow-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary ring-1 ring-primary/30 shadow-lg shadow-primary/10 animate-float">
            <Wallet className="h-9 w-9 icon-glow" />
          </div>
        </div>

        {/* Heading */}
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight neon-text leading-tight">
            Welcome to WizPay
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Connect with Google, X, Email, or your Web3 wallet to access the payroll dashboard.
          </p>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary"
            >
              <Icon className="h-3 w-3" />
              {label}
            </div>
          ))}
        </div>

        {/* Login CTA */}
        <button
          id="privy-connect-btn"
          onClick={login}
          className="glow-btn group relative inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-primary via-violet-500 to-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/40 hover:brightness-110 active:scale-[0.97] w-full sm:w-auto"
        >
          <Wallet className="h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-[-6deg]" />
          Sign In to WizPay
        </button>

        {/* Login method hints */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Social
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Wallet
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
