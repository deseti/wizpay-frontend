"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ArrowRightLeft, LogOut, Key, ChevronDown, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function DashboardHeader() {
  const { login, logout, authenticated, ready, user, exportWallet } =
    usePrivy();
  const { address } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Determine login method label
  const loginMethod = user?.linkedAccounts?.[0]?.type;
  const loginLabel =
    loginMethod === "google_oauth"
      ? "Google"
      : loginMethod === "twitter_oauth"
        ? "X"
        : loginMethod === "email"
          ? "Email"
          : loginMethod === "wallet"
            ? "Wallet"
            : "Connected";

  // Check if user has an embedded wallet (from Web2 login)
  const hasEmbeddedWallet = user?.linkedAccounts?.some(
    (a) => a.type === "wallet" && (a as any).walletClientType === "privy"
  );

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold tracking-tight">WizPay</p>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 text-emerald-300"
              >
                <span className="status-dot" />
                Live Arc Testnet
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Mixed-token payroll routing with real-time chain telemetry
            </p>
          </div>
        </div>

        {/* Auth Area */}
        <div className="flex items-center gap-3">
          {!ready ? (
            <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/40" />
          ) : !authenticated ? (
            <button
              id="privy-sign-in-btn"
              onClick={login}
              className="group relative inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/35 hover:brightness-110 active:scale-[0.98]"
            >
              <User className="h-4 w-4" />
              Sign In
            </button>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                id="privy-account-menu-btn"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 text-sm font-medium backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-card/80"
              >
                {/* Login method icon */}
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                  {loginLabel.charAt(0)}
                </span>
                <span className="hidden sm:inline font-mono text-foreground">
                  {address ? truncateAddress(address) : "No wallet"}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-up">
                  {/* User info */}
                  <div className="border-b border-border/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      Logged in via{" "}
                      <span className="text-foreground font-medium">
                        {loginLabel}
                      </span>
                    </p>
                    {address && (
                      <p className="mt-1 font-mono text-xs text-foreground/80">
                        {truncateAddress(address)}
                      </p>
                    )}
                  </div>

                  {/* Export Private Key — only for embedded-wallet (Web2) users */}
                  {hasEmbeddedWallet && (
                    <button
                      id="privy-export-key-btn"
                      onClick={() => {
                        exportWallet();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground/90 transition-colors hover:bg-primary/10"
                    >
                      <Key className="h-4 w-4 text-amber-400" />
                      Export Private Key
                    </button>
                  )}

                  {/* Logout */}
                  <button
                    id="privy-logout-btn"
                    onClick={() => {
                      logout();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 border-t border-border/40 px-4 py-3 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
