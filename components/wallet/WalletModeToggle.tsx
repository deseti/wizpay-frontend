"use client";

import { Globe2, ShieldCheck } from "lucide-react";

import { useHybridWallet } from "@/components/providers/HybridWalletProvider";

export function WalletModeToggle({ className = "" }: { className?: string }) {
  const { setWalletMode, walletMode } = useHybridWallet();

  return (
    <div
      className={`inline-flex items-center rounded-2xl border border-border/40 bg-card/50 p-1 shadow-lg shadow-black/10 ${className}`.trim()}
      role="tablist"
      aria-label="Wallet mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={walletMode === "circle"}
        onClick={() => setWalletMode("circle")}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
          walletMode === "circle"
            ? "bg-primary/15 text-primary ring-1 ring-primary/20"
            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
        }`}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        App Wallet
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={walletMode === "external"}
        onClick={() => setWalletMode("external")}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
          walletMode === "external"
            ? "bg-primary/15 text-primary ring-1 ring-primary/20"
            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
        }`}
      >
        <Globe2 className="h-3.5 w-3.5" />
        External Wallet
      </button>
    </div>
  );
}
