"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  ArrowRightLeft,
  Globe,
  Shield,
  Wallet,
  Zap,
} from "lucide-react";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import { WalletModeToggle } from "@/components/wallet/WalletModeToggle";
import { Card, CardContent } from "@/components/ui/card";
import {
  getWalletModeDescription,
  getWalletModeLabel,
} from "@/lib/wallet-mode";

const features = [
  { icon: Zap, label: "Multi-Token" },
  { icon: ArrowRightLeft, label: "Cross-Swap" },
  { icon: Shield, label: "On-Chain Verified" },
];

export function ConnectWalletCard() {
  const { login, ready } = useCircleWallet();
  const { externalConnectError, walletMode } = useHybridWallet();
  const title = getWalletModeLabel(walletMode);
  const description = getWalletModeDescription(walletMode);

  return (
    <Card className="glass-card animate-scale-in relative mx-auto w-full max-w-xl overflow-hidden border-border/40">
      <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-primary/15 blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-36 w-36 rounded-full bg-violet-500/10 blur-[60px]" />

      <CardContent className="relative flex flex-col items-center gap-7 py-12 text-center sm:py-16">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl animate-glow-pulse" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15 text-primary ring-1 ring-primary/30 shadow-lg shadow-primary/10 animate-float">
            <Wallet className="h-9 w-9 icon-glow" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight tracking-tight neon-text sm:text-3xl">
            Welcome to WizPay
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Choose how you want to transact. Keep the built-in Circle app wallet for
            Google or email login, or use an external wallet through RainbowKit.
          </p>
        </div>

        <WalletModeToggle />

        <div className="w-full max-w-md rounded-2xl border border-border/40 bg-background/35 p-5 text-left shadow-lg shadow-black/10">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
              Selected Mode
            </p>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground/75">{description}</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
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

          <div className="mt-6">
            {walletMode === "circle" ? (
              <button
                id="circle-connect-btn"
                onClick={login}
                disabled={!ready}
                className="glow-btn group relative inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-primary via-violet-500 to-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/40 hover:brightness-110 active:scale-[0.97]"
              >
                <Wallet className="h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-[-6deg]" />
                {ready ? "Sign In with Circle" : "Loading Circle Wallet..."}
              </button>
            ) : (
              <ConnectButton.Custom>
                {({ mounted, openConnectModal }) => (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    disabled={!mounted}
                    className="glow-btn group relative inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-primary via-violet-500 to-primary px-8 py-4 text-base font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:shadow-2xl hover:shadow-primary/40 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Globe className="h-5 w-5 transition-transform group-hover:scale-110" />
                    Connect External Wallet
                  </button>
                )}
              </ConnectButton.Custom>
            )}
          </div>

          {walletMode === "external" ? (
            <p className="mt-3 text-xs leading-relaxed text-amber-300/80">
              Injected browser wallets are supported in this build. WalletConnect QR
              modal is currently disabled.
            </p>
          ) : null}

          {walletMode === "external" && externalConnectError ? (
            <p className="mt-3 text-xs leading-relaxed text-red-400/85">
              {externalConnectError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Social
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Circle MPC
          </span>
          <span className="h-3 w-px bg-border/60" />
          <span className="flex items-center gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" /> RainbowKit
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
