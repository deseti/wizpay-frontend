"use client";

import { ShieldCheck } from "lucide-react";

import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { LiquidityScreen } from "@/components/dashboard/LiquidityScreen";
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  activeFxEngineAddress,
  fxProviderLabel,
  isStableFxMode,
} from "@/lib/fx-config";
import { formatCompactAddress } from "@/lib/wizpay";

function LiquidityWorkspace() {
  return (
    <div className="animate-fade-up space-y-6 stagger-children">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">LP Pool</h1>
          <p className="text-sm text-muted-foreground/70">
            Add or remove USDC and EURC liquidity from the StableFX adapter vault.
          </p>
        </div>
      </div>

      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
            {isStableFxMode ? "Adapter LP Vault Available" : "Adapter LP Vault Active"}
          </CardTitle>
          <CardDescription>
            {isStableFxMode
              ? "The LP vault is still available, but payroll routing is currently set to Circle StableFX."
              : `Payroll routing is currently backed by ${fxProviderLabel} liquidity on Arc.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground/75">
          <p>Adapter address: {formatCompactAddress(activeFxEngineAddress)}.</p>
          <p>
            Deposit mints SFX-LP shares. Withdraw burns shares and returns the selected stablecoin.
          </p>
          {isStableFxMode ? (
            <p>
              If you want payroll swaps to use this pool too, keep NEXT_PUBLIC_USE_REAL_STABLEFX set to false.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="rounded-[2rem] border border-border/30 bg-card/15 p-1">
        <LiquidityScreen />
      </div>
    </div>
  );
}

export default function LiquidityPage() {
  const { authenticated, ready } = useCircleWallet();

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="grid-fade absolute inset-0 opacity-25" />
        <div className="absolute left-[-8%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-primary/12 blur-[140px] animate-float" />
        <div
          className="absolute bottom-[-15%] right-[-8%] h-[24rem] w-[24rem] rounded-full bg-violet-500/8 blur-[120px]"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-[40%] left-[50%] h-[16rem] w-[16rem] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[100px]"
          style={{ animationDelay: "4s" }}
        />
      </div>

      {!ready || !authenticated ? (
        <div className="flex h-screen w-full flex-col overflow-y-auto">
          <DashboardHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-8 sm:px-6">
            <ConnectWalletCard />
          </main>
        </div>
      ) : (
        <>
          <DashboardSidebar />

          <div className="flex h-screen w-full flex-1 flex-col overflow-y-auto pb-28 md:pb-6">
            <DashboardHeader />

            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:py-8">
              <LiquidityWorkspace />
            </main>
          </div>

          <DashboardBottomNav />
        </>
      )}
    </div>
  );
}