"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRightLeft, LogOut, ChevronDown, User, Copy, Check, Wifi, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSmartWalletAddress } from "@/hooks/useSmartWalletAddress";
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function DashboardHeader() {
  const { login, logout, authenticated, ready, loginMethodLabel, userEmail } =
    useCircleWallet();
  const { smartWalletAddress, isLoadingSmartWalletAddress } =
    useSmartWalletAddress();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<"wallet" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
        title: "Circle wallet address copied",
        description:
          "Use this address for Arc balances, transaction history, and upcoming Circle challenge-based actions.",
      });
      window.setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-2xl">
      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        {/* Brand (Mobile Only) */}
        <div className="flex md:hidden items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25 shadow-lg shadow-primary/10">
            <ArrowRightLeft className="h-4 w-4 icon-glow" />
          </div>
          <div className="hidden min-[380px]:block">
            <p className="text-base font-bold tracking-tight neon-text leading-tight">WizPay</p>
          </div>
        </div>

        {/* Desktop Spacer */}
        <div className="hidden md:block flex-1" />

        {/* Action & Auth Area */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Network Badge (Desktop) */}
          {authenticated && (
            <Badge
              variant="outline"
              className="hidden sm:flex gap-1.5 border-emerald-500/20 text-emerald-300/80 text-[10px] px-2.5 py-1 bg-emerald-500/5"
            >
              <Wifi className="h-2.5 w-2.5" />
              Arc Testnet
            </Badge>
          )}

          {/* Faucet Shortcut (Mobile Only) */}
          {authenticated && (
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex md:hidden h-9 w-9 items-center justify-center rounded-xl text-primary bg-primary/10 hover:bg-primary/20 transition-all hover:shadow-lg hover:shadow-primary/10 active:scale-95"
              title="Get Testnet Tokens"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-droplet"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
            </a>
          )}

          {!ready ? (
            <div className="h-9 w-24 animate-pulse rounded-xl bg-muted/30" />
          ) : !authenticated ? (
            <button
              id="circle-sign-in-btn"
              onClick={login}
              className="glow-btn group relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-500 px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.97]"
            >
              <User className="h-4 w-4" />
              Sign In
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-card/50 backdrop-blur-md p-1 rounded-2xl border border-border/40 shadow-lg shadow-black/10">
              {/* Universal Header Copy Address Pill */}
              {isLoadingSmartWalletAddress ? (
                <div className="hidden h-9 w-28 rounded-xl bg-muted/25 animate-pulse sm:block" />
              ) : null}

              {smartWalletAddress && (
                <button
                  onClick={() => void copyAddress(smartWalletAddress)}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-mono text-[11px] sm:text-xs text-foreground/75 hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                  title="Copy Circle Wallet Address"
                >
                  <span className="hidden min-[400px]:inline">{truncateAddress(smartWalletAddress)}</span>
                  <span className="inline min-[400px]:hidden">{smartWalletAddress.slice(0,4)}…{smartWalletAddress.slice(-4)}</span>
                  {copiedAddress === "wallet" ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              )}

              {/* Profile Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  id="circle-account-menu-btn"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex h-9 w-9 sm:h-auto sm:w-auto items-center justify-center sm:px-3 sm:py-2 gap-1.5 rounded-xl bg-background/80 hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20 active:scale-95"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-violet-500/20 text-primary text-[11px] font-bold ring-1 ring-primary/20">
                    {loginMethodLabel.charAt(0)}
                  </span>
                  <ChevronDown
                    className={`hidden sm:block h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-border/40 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-2xl animate-scale-in">
                    <div className="border-b border-border/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Logged in via{" "}
                        <span className="text-foreground font-semibold">
                          {loginMethodLabel}
                        </span>
                      </p>
                      {userEmail ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                          <Mail className="h-3.5 w-3.5" />
                          {userEmail}
                        </p>
                      ) : null}
                    </div>

                    {smartWalletAddress && (
                      <div className="border-b border-border/30 px-3 py-3 space-y-2">
                        <button
                          onClick={() => void copyAddress(smartWalletAddress)}
                          className="flex w-full items-center justify-between rounded-xl border border-border/30 bg-background/40 px-3 py-2 text-left transition-all hover:border-primary/20 hover:bg-primary/10"
                        >
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
                              Circle Wallet
                            </p>
                            <p className="font-mono text-xs text-foreground/80">
                              {truncateAddress(smartWalletAddress)}
                            </p>
                          </div>
                          {copiedAddress === "wallet" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    )}

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
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
