"use client";

import type { ReactNode } from "react";

import { ConnectWalletCard } from "@/components/dashboard/ConnectWalletCard";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";

interface DashboardAppFrameProps {
  children: ReactNode;
}

export function DashboardAppFrame({ children }: DashboardAppFrameProps) {
  const { isActiveWalletConnected, isReady } = useHybridWallet();

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

      {!isReady || !isActiveWalletConnected ? (
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
              {children}
            </main>
          </div>

          <DashboardBottomNav />
        </>
      )}
    </div>
  );
}