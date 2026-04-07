"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ArrowRightLeft, LogOut, Key, ChevronDown, User, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function DashboardHeader() {
  const { login, logout, authenticated, ready, user, exportWallet } =
    usePrivy();
  const { address } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        {/* Brand (Mobile Only) */}
        <div className="flex md:hidden items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 shadow-inner">
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </div>
          <div className="hidden min-[380px]:block">
            <p className="text-sm font-semibold tracking-tight text-gradient leading-tight">WizPay</p>
          </div>
        </div>
        
        {/* Desktop Spacer */}
        <div className="hidden md:block flex-1" />

        {/* Action & Auth Area */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Faucet Shortcut (Mobile Only) */}
          {authenticated && (
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex md:hidden h-9 w-9 items-center justify-center rounded-md text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              title="Get Testnet Tokens"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-droplet"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>
            </a>
          )}

          {!ready ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/40" />
          ) : !authenticated ? (
            <button
              id="privy-sign-in-btn"
              onClick={login}
              className="group relative flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <User className="h-4 w-4" />
              Sign In
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-card/60 backdrop-blur-sm p-1 rounded-xl border border-border/60">
              {/* Universal Header Copy Address Pill */}
              {address && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(address);
                      setCopied(true);
                      toast({
                        title: "Address copied to clipboard!",
                        description: "Paste this into the Circle Faucet.",
                      });
                      setTimeout(() => setCopied(false), 2000);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[11px] sm:text-xs text-foreground/80 hover:bg-muted/80 transition-colors"
                  title="Copy Wallet Address"
                >
                  <span className="hidden min-[400px]:inline">{truncateAddress(address)}</span>
                  <span className="inline min-[400px]:hidden">{address.slice(0,4)}…{address.slice(-4)}</span>
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
              )}

              {/* Profile Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  id="privy-account-menu-btn"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex h-8 w-8 sm:h-auto sm:w-auto items-center justify-center sm:px-3 sm:py-1.5 gap-1.5 rounded-lg bg-background hover:bg-muted/80 transition-colors border border-transparent hover:border-border/60"
                >
                  <span className="flex h-5 w-5 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] sm:text-[10px] font-bold">
                    {loginLabel.charAt(0)}
                  </span>
                  <ChevronDown
                    className={`hidden sm:block h-3.5 w-3.5 text-muted-foreground transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 sm:w-56 overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-fade-up">
                    <div className="border-b border-border/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Logged in via{" "}
                        <span className="text-foreground font-medium">
                          {loginLabel}
                        </span>
                      </p>
                    </div>

                    {hasEmbeddedWallet && (
                      <button
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

                    <button
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
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
