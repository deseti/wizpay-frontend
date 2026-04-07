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
      <div className="glass-card flex items-center justify-around rounded-t-2xl border-x-0 border-b-0 border-t border-border/60 px-2 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="group flex flex-1 flex-col items-center justify-center gap-1.5 transition-all"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                  isActive
                    ? "bg-primary/20 text-primary scale-110 shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "transition-transform duration-300",
                    isActive ? "h-5 w-5" : "h-5 w-5 group-hover:scale-110"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
