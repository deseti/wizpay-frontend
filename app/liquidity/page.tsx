"use client";

import { Coins } from "lucide-react";

import { LiquidityScreen } from "@/components/dashboard/LiquidityScreen";
import { DashboardAppFrame } from "@/components/dashboard/DashboardAppFrame";

function LiquidityWorkspace() {
  return (
    <div className="animate-fade-up space-y-5 stagger-children">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Liquidity</h1>
        <p className="text-sm text-muted-foreground/70">
          Add or remove USDC and EURC liquidity from the StableFX adapter vault.
        </p>
      </div>

      <div className="rounded-[2rem] border border-border/30 bg-card/15 p-1">
        <LiquidityScreen />
      </div>
    </div>
  );
}

export default function LiquidityPage() {
  return (
    <DashboardAppFrame>
      <LiquidityWorkspace />
    </DashboardAppFrame>
  );
}