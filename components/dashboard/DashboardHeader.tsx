"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold tracking-tight">WizPay</p>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 text-emerald-300"
              >
                <span className="status-dot" />
                Live Arc Testnet
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Mixed-token payroll routing with real-time chain telemetry
            </p>
          </div>
        </div>
        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        />
      </div>
    </header>
  );
}
