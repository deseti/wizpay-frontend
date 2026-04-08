"use client";

import { ArrowRightLeft, History, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavTab = "send" | "history" | "liquidity";

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: "send" as const, label: "Send", icon: ArrowRightLeft },
    { id: "history" as const, label: "History", icon: History },
    { id: "liquidity" as const, label: "Liquidity", icon: Coins },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 block md:hidden pb-safe">
      <div className="relative mx-2 mb-2 flex items-center justify-around rounded-2xl border border-border/30 bg-card/60 backdrop-blur-2xl px-2 py-2.5 shadow-[0_-12px_50px_rgba(0,0,0,0.4)]">
        {/* Top glow line */}
        <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="group flex flex-1 flex-col items-center justify-center gap-1 transition-all active:scale-90"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                  isActive
                    ? "bg-primary/18 text-primary scale-110 shadow-lg shadow-primary/15"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "transition-all duration-300",
                    isActive ? "h-5 w-5 icon-glow" : "h-5 w-5 group-hover:scale-110"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold transition-all duration-300",
                  isActive ? "text-primary" : "text-muted-foreground/70"
                )}
              >
                {label}
              </span>

              {/* Active dot indicator */}
              {isActive && (
                <div className="h-1 w-1 rounded-full bg-primary shadow-sm shadow-primary/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
