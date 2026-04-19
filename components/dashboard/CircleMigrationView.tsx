"use client";

import Link from "next/link";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { MigrationNoticeCard } from "@/components/dashboard/MigrationNoticeCard";

export function CircleMigrationView({
  completed,
  description,
  pending,
  title,
}: {
  completed: string[];
  description: string;
  pending: string[];
  title: string;
}) {
  const { authenticated, ready } = useCircleWallet();
  const { walletAddress } = useActiveWalletAddress();

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
          className="absolute left-[50%] top-[40%] h-[16rem] w-[16rem] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[100px]"
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
              <div className="animate-fade-up space-y-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                      {title}
                    </h1>
                    <p className="text-sm text-muted-foreground/70">
                      {description}
                    </p>
                  </div>
                </div>

                <MigrationNoticeCard
                  completed={completed}
                  pending={pending}
                  title="Circle Execution Migration"
                  description="Circle authentication is live. Transaction execution is being moved from the old signer model to Circle Web3 Services challenges."
                />

                <Card className="glass-card overflow-hidden border-border/40">
                  <CardHeader className="border-b border-border/30">
                    <CardTitle>Connected Circle Wallet</CardTitle>
                    <CardDescription>
                      This Arc Testnet wallet is now the source of truth for dashboard reads and upcoming Circle challenge-based actions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 py-6">
                    <div className="rounded-2xl border border-border/40 bg-background/40 px-4 py-3 font-mono text-sm text-foreground/80">
                      {walletAddress ?? "Loading Circle wallet address..."}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button asChild>
                        <Link href="/dashboard">Open Overview</Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <a
                          href="https://faucet.circle.com"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Circle Faucet
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>

          <DashboardBottomNav />
        </>
      )}
    </div>
  );
}