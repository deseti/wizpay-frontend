"use client";

import { ArrowRightLeft, History, Coins } from "lucide-react";
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
    <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border/50 bg-background/60 backdrop-blur-xl md:flex glass-card border-l-0 border-y-0 rounded-none shadow-xl">
      {/* Brand Header */}
      <div className="flex flex-col gap-2 p-6 pb-8 border-b border-border/40">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30 shadow-inner">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
          <p className="text-xl font-semibold tracking-tight text-gradient">WizPay</p>
        </div>
        <Badge
          variant="outline"
          className="w-fit self-start gap-1.5 border-emerald-500/30 text-emerald-300/90 text-[10px] px-2 py-0.5 bg-emerald-500/5 shadow-sm"
        >
          <span className="status-dot w-1.5 h-1.5" />
          Live Arc Testnet
        </Badge>
        <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed font-medium">
          Mixed-token payroll routing & telemetry.
        </p>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 space-y-1.5 p-4 overflow-y-auto">
        <div className="mb-2 px-2 text-[10px] font-bold tracking-wider text-muted-foreground/60 uppercase">Menu</div>
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                "group flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20 backdrop-blur-md"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center rounded-lg p-1.5 transition-colors",
                isActive ? "bg-primary/20 text-primary" : "text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground"
              )}>
                <Icon className={cn("h-4 w-4 transition-transform", isActive ? "scale-110" : "")} />
              </div>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="mt-auto p-4 border-t border-border/40 bg-card/20 space-y-4">
        <FaucetButton />
      </div>
    </aside>
  );
}
