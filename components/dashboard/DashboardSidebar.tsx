"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft, Coins, Copy, Home, Repeat, Route, Wallet } from "lucide-react";
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FaucetButton } from "./FaucetButton";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/send", label: "Send", icon: ArrowRightLeft },
  { href: "/swap", label: "Swap", icon: Repeat },
  { href: "/bridge", label: "Bridge", icon: Route },
  { href: "/assets", label: "Assets", icon: Wallet },
  { href: "/liquidity", label: "Liquidity", icon: Coins },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { authMethod, authenticated, getDevCredentials, primaryWallet } = useCircleWallet();
  const { activeWalletAddress } = useHybridWallet();
  const { toast } = useToast();
  const showDevCredentialsButton =
    authenticated &&
    authMethod !== "passkey" &&
    Boolean(primaryWallet?.id) &&
    Boolean(activeWalletAddress);

  async function copyDevCredentials() {
    const devCredentials = getDevCredentials();

    if (!devCredentials || !activeWalletAddress) {
      toast({
        title: "No credentials available",
        description:
          "Circle Google or email sessions expose dev credentials after the active wallet is loaded.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify({
          ...devCredentials,
          treasuryAddress: activeWalletAddress,
        })
      );
      toast({ title: "Credentials Copied!" });
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to copy credentials",
        description:
          "Clipboard access was blocked or unavailable in this browser.",
        variant: "destructive",
      });
    }
  }

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
          Cross-token payments &amp; Web3 wallet.
        </p>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        <div className="mb-3 px-2 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/50 uppercase">
          Menu
        </div>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
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

              <div
                className={cn(
                  "flex items-center justify-center rounded-lg p-1.5 transition-all duration-250",
                  isActive
                    ? "bg-primary/20 text-primary shadow-sm shadow-primary/10"
                    : "text-muted-foreground group-hover:bg-muted/60 group-hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-transform duration-250",
                    isActive ? "scale-110" : "group-hover:scale-105"
                  )}
                />
              </div>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="mt-auto p-4 border-t border-border/30 bg-card/15 space-y-4">
        <FaucetButton
          walletActions={
            showDevCredentialsButton ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void copyDevCredentials();
                }}
                className="w-full justify-center gap-1.5 border border-border/30 bg-background/20 text-xs text-muted-foreground hover:border-primary/25 hover:bg-primary/8 hover:text-primary"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Dev Credentials
              </Button>
            ) : null
          }
        />
        <p className="text-[10px] text-center text-muted-foreground/40 font-mono">
          v1.0.0 · Arc Testnet
        </p>
      </div>
    </aside>
  );
}
