"use client";

import Link from "next/link";
import { ArrowRightLeft, History, Coins, LayoutDashboard, Repeat, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NavTab } from "./BottomNav";
import { FaucetButton } from "./FaucetButton";

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const navItems = [
    { id: "send" as const, label: "Payroll / Send", icon: ArrowRightLeft },
    { id: "history" as const, label: "History", icon: History },
    { id: "liquidity" as const, label: "StableFX Liquidity", icon: Coins },
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border/30 bg-background/50 backdrop-blur-2xl md:flex rounded-none shadow-2xl shadow-black/20">
      {/* Gradient right edge glow */}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />

      {/* Brand Header */}
      <div className="flex flex-col gap-2 p-6 pb-7 border-b border-border/30">
        <div className="flex items-center gap-3 mb-1">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md animate-glow-pulse" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <ArrowRightLeft className="h-4 w-4 icon-glow" />
            </div>
          </div>
          <p className="text-xl font-bold tracking-tight neon-text">WizPay</p>
        </div>
        <Badge
          variant="outline"
          className="w-fit self-start gap-1.5 border-emerald-500/25 text-emerald-300/85 text-[10px] px-2 py-0.5 bg-emerald-500/5"
        >
          <span className="status-dot w-1.5 h-1.5" />
          Live Arc Testnet
        </Badge>
        <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed font-medium">
          Mixed-token payroll routing & telemetry.
        </p>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        <div className="mb-3 px-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/50 uppercase">Menu</div>

        {/* Overview — route-based link to /dashboard */}
        <Link
          href="/dashboard"
          className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-250 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <div className="flex items-center justify-center rounded-lg p-1.5 transition-all duration-250 text-muted-foreground group-hover:bg-muted/60 group-hover:text-foreground">
            <LayoutDashboard className="h-4 w-4 transition-transform duration-250 group-hover:scale-105" />
          </div>
          Overview
        </Link>

        <Link
          href="/swap"
          className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-250 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <div className="flex items-center justify-center rounded-lg p-1.5 transition-all duration-250 text-muted-foreground group-hover:bg-muted/60 group-hover:text-foreground">
            <Repeat className="h-4 w-4 transition-transform duration-250 group-hover:scale-105" />
          </div>
          Swap Kit
        </Link>

        <Link
          href="/bridge"
          className="group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-250 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <div className="flex items-center justify-center rounded-lg p-1.5 transition-all duration-250 text-muted-foreground group-hover:bg-muted/60 group-hover:text-foreground">
            <Route className="h-4 w-4 transition-transform duration-250 group-hover:scale-105" />
          </div>
          Bridge
        </Link>

        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-250",
                isActive
                  ? "bg-primary/12 text-primary shadow-md shadow-primary/5 ring-1 ring-primary/15"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {/* Active glow bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-primary shadow-lg shadow-primary/40" />
              )}

              <div className={cn(
                "flex items-center justify-center rounded-lg p-1.5 transition-all duration-250",
                isActive
                  ? "bg-primary/20 text-primary shadow-sm shadow-primary/10"
                  : "text-muted-foreground group-hover:bg-muted/60 group-hover:text-foreground"
              )}>
                <Icon className={cn("h-4 w-4 transition-transform duration-250", isActive ? "scale-110" : "group-hover:scale-105")} />
              </div>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="mt-auto p-4 border-t border-border/30 bg-card/15 space-y-4">
        <FaucetButton />
        <p className="text-[10px] text-center text-muted-foreground/40 font-mono">v1.0.0 · Arc Testnet</p>
      </div>
    </aside>
  );
}
