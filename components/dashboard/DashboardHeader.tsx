"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  Copy,
  LogOut,
  Mail,
  User,
  Wifi,
} from "lucide-react";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import { WalletModeToggle } from "@/components/wallet/WalletModeToggle";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { arcTestnet } from "@/lib/wagmi";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function DashboardHeader() {
  const { login, logout, loginMethodLabel, userEmail } = useCircleWallet();
  const {
    activeWalletAddress,
    activeWalletChainId,
    activeWalletChainName,
    activeWalletLabel,
    activeWalletShortAddress,
    externalConnectorName,
    isCircleConnected,
    isReady,
    requiresArcSwitch,
    walletMode,
  } = useHybridWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<"wallet" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress("wallet");
      toast({
        title: `${activeWalletLabel} address copied`,
        description:
          walletMode === "circle"
            ? "Use this address for Arc balances, Circle approvals, and WizPay transactions."
            : "Use this address when you want incoming funds to land in your external wallet.",
      });
      window.setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error(error);
    }
  }

  const showNetworkBadge = Boolean(activeWalletAddress);
  const isArcActive =
    walletMode === "circle" || activeWalletChainId === arcTestnet.id;
  const networkBadgeLabel = activeWalletChainName ?? "Arc Testnet";

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-2xl">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25 shadow-lg shadow-primary/10">
            <ArrowRightLeft className="h-4 w-4 icon-glow" />
          </div>
          <div className="hidden min-[380px]:block">
            <p className="text-base font-bold leading-tight tracking-tight neon-text">
              WizPay
            </p>
          </div>
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:justify-center">
          <WalletModeToggle />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <div className="flex lg:hidden">
            <WalletModeToggle className="scale-[0.92] origin-right" />
          </div>

          {showNetworkBadge ? (
            <Badge
              variant="outline"
              className={`hidden sm:flex gap-1.5 text-[10px] px-2.5 py-1 ${
                isArcActive
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/80"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300"
              }`}
            >
              <Wifi className="h-2.5 w-2.5" />
              {requiresArcSwitch ? `Switch to Arc · ${networkBadgeLabel}` : networkBadgeLabel}
            </Badge>
          ) : null}

          {!isReady ? (
            <div className="h-9 w-32 animate-pulse rounded-xl bg-muted/30" />
          ) : walletMode === "circle" ? (
            !isCircleConnected ? (
              <button
                id="circle-sign-in-btn"
                onClick={login}
                className="glow-btn group relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-500 px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.97]"
              >
                <User className="h-4 w-4" />
                Sign In to App Wallet
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-2xl border border-border/40 bg-card/50 p-1 backdrop-blur-md shadow-lg shadow-black/10">
                {activeWalletAddress ? (
                  <button
                    onClick={() => void copyAddress(activeWalletAddress)}
                    className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-mono text-[11px] text-foreground/75 transition-all hover:bg-primary/10 hover:text-primary active:scale-95 sm:text-xs"
                    title="Copy active wallet address"
                  >
                    <span className="hidden min-[400px]:inline">
                      {activeWalletShortAddress}
                    </span>
                    <span className="inline min-[400px]:hidden">
                      {truncateAddress(activeWalletAddress)}
                    </span>
                    {copiedAddress === "wallet" ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ) : null}

                <div className="relative" ref={menuRef}>
                  <button
                    id="circle-account-menu-btn"
                    onClick={() => setMenuOpen((previous) => !previous)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-background/80 transition-all hover:border-primary/20 hover:bg-primary/10 active:scale-95 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-violet-500/20 text-[11px] font-bold text-primary ring-1 ring-primary/20">
                      {loginMethodLabel.charAt(0)}
                    </span>
                    <ChevronDown
                      className={`hidden h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 sm:block ${menuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {menuOpen ? (
                    <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border/40 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-2xl animate-scale-in">
                      <div className="border-b border-border/30 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                          Active Wallet
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {activeWalletLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Logged in via {loginMethodLabel}
                        </p>
                        {userEmail ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/75">
                            <Mail className="h-3.5 w-3.5" />
                            {userEmail}
                          </p>
                        ) : null}
                      </div>

                      {activeWalletAddress ? (
                        <div className="border-b border-border/30 px-3 py-3">
                          <button
                            onClick={() => void copyAddress(activeWalletAddress)}
                            className="flex w-full items-center justify-between rounded-xl border border-border/30 bg-background/40 px-3 py-2 text-left transition-all hover:border-primary/20 hover:bg-primary/10"
                          >
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
                                App Wallet (Circle)
                              </p>
                              <p className="font-mono text-xs text-foreground/80">
                                {truncateAddress(activeWalletAddress)}
                              </p>
                            </div>
                            {copiedAddress === "wallet" ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      ) : null}

                      <button
                        onClick={() => {
                          logout();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 border-t border-border/30 px-4 py-3 text-sm text-red-400 transition-all hover:bg-red-500/10"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          ) : (
            <ConnectButton.Custom>
              {({
                account,
                chain,
                mounted,
                openAccountModal,
                openChainModal,
                openConnectModal,
              }) => {
                const connected = mounted && Boolean(account) && Boolean(chain);

                if (!mounted) {
                  return <div className="h-9 w-32 animate-pulse rounded-xl bg-muted/30" />;
                }

                if (!connected) {
                  return (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="glow-btn group relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-500 px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.97]"
                    >
                      <User className="h-4 w-4" />
                      Connect External Wallet
                    </button>
                  );
                }

                return (
                  <div className="flex items-center gap-1.5 rounded-2xl border border-border/40 bg-card/50 p-1 backdrop-blur-md shadow-lg shadow-black/10">
                    {activeWalletAddress ? (
                      <button
                        onClick={() => void copyAddress(activeWalletAddress)}
                        className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-mono text-[11px] text-foreground/75 transition-all hover:bg-primary/10 hover:text-primary active:scale-95 sm:text-xs"
                        title="Copy active wallet address"
                      >
                        <span className="hidden min-[400px]:inline">
                          {activeWalletShortAddress}
                        </span>
                        <span className="inline min-[400px]:hidden">
                          {truncateAddress(activeWalletAddress)}
                        </span>
                        {copiedAddress === "wallet" ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={chain?.id !== arcTestnet.id ? openChainModal : openAccountModal}
                      className="flex items-center gap-2 rounded-xl border border-transparent bg-background/80 px-3 py-2 transition-all hover:border-primary/20 hover:bg-primary/10 active:scale-95"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-violet-500/20 text-[11px] font-bold text-primary ring-1 ring-primary/20">
                        {(externalConnectorName ?? "E").charAt(0)}
                      </span>
                      <span className="hidden text-left sm:flex sm:flex-col sm:leading-none">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                          External Wallet
                        </span>
                        <span className="text-xs font-mono text-foreground/80">
                          {activeWalletShortAddress ?? account?.displayName}
                        </span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          )}
        </div>
      </div>
    </header>
  );
}
