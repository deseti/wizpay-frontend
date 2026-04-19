"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
  ArrowUpRight,
  Coins,
  Repeat,
  Route,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { DashboardAppFrame } from "@/components/dashboard/DashboardAppFrame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SkeletonBalance } from "@/components/ui/skeleton-loaders";
import { EmptyStateView } from "@/components/ui/empty-state";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useWizPay } from "@/hooks/wizpay";
import { formatTokenAmount, TOKEN_OPTIONS } from "@/lib/wizpay";
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import type { UnifiedHistoryItem } from "@/lib/types";

const QUICK_ACTIONS = [
  { href: "/send", label: "Send", icon: ArrowRightLeft, color: "violet" },
  { href: "/swap", label: "Swap", icon: Repeat, color: "cyan" },
  { href: "/bridge", label: "Bridge", icon: Route, color: "emerald" },
  { href: "/liquidity", label: "LP", icon: Coins, color: "amber" },
] as const;

const COLOR_MAP: Record<string, string> = {
  violet: "bg-violet-500/12 text-violet-400 hover:bg-violet-500/20",
  cyan: "bg-cyan-500/12 text-cyan-400 hover:bg-cyan-500/20",
  emerald: "bg-emerald-500/12 text-emerald-400 hover:bg-emerald-500/20",
  amber: "bg-amber-500/12 text-amber-400 hover:bg-amber-500/20",
};

function TotalBalance() {
  const { balances, isLoading } = useTokenBalances();

  if (isLoading) {
    return <SkeletonBalance />;
  }

  const usdcValue = Number(balances.USDC) / 1e6;
  const eurcValue = (Number(balances.EURC) / 1e6) * 1.08;
  const totalUsd = usdcValue + eurcValue;

  return (
    <div>
      <p className="text-xs text-muted-foreground/60 font-medium uppercase tracking-wider mb-1">
        Total Balance
      </p>
      <p className="text-3xl sm:text-4xl font-bold tracking-tight neon-text">
        ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <div className="flex items-center gap-3 mt-2">
        {TOKEN_OPTIONS.map((token) => (
          <span key={token.symbol} className="text-xs text-muted-foreground/70">
            {formatTokenAmount(balances[token.symbol], token.decimals)} {token.symbol}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {QUICK_ACTIONS.map(({ href, label, icon: Icon, color }) => (
        <Link key={href} href={href}>
          <div className={`flex flex-col items-center gap-2 rounded-2xl p-3 sm:p-4 transition-all duration-200 active:scale-95 cursor-pointer ${COLOR_MAP[color]}`}>
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-current/10">
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <span className="text-[11px] sm:text-xs font-semibold">{label}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function TokenList() {
  const { balances, isLoading } = useTokenBalances();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-16 rounded bg-muted/20 animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted/15 animate-pulse" />
            </div>
            <div className="h-4 w-20 rounded bg-muted/20 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {TOKEN_OPTIONS.map((token) => {
        const balance = balances[token.symbol];
        const formattedBalance = formatTokenAmount(balance, token.decimals);
        const isEmpty = balance === 0n;

        return (
          <Link key={token.symbol} href="/assets">
            <div className="flex items-center gap-3 rounded-xl px-3 py-3.5 transition-all hover:bg-muted/20 active:scale-[0.98] cursor-pointer min-h-[52px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm ring-1 ring-primary/20">
                {token.symbol.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{token.symbol}</p>
                <p className="text-xs text-muted-foreground/60">{token.name}</p>
              </div>
              <p className={`text-sm font-mono font-medium ${isEmpty ? "text-muted-foreground/40" : ""}`}>
                {formattedBalance}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  payroll: { label: "Send", color: "text-emerald-400" },
  add_lp: { label: "Add LP", color: "text-blue-400" },
  remove_lp: { label: "Remove LP", color: "text-amber-400" },
};

function RecentActivity({ items }: { items: UnifiedHistoryItem[] }) {
  const recent = items.slice(0, 5);

  if (recent.length === 0) {
    return (
      <EmptyStateView
        icon={<TrendingUp className="h-7 w-7 text-primary/60" />}
        title="No Activity Yet"
        description="Start by sending tokens or swapping. Your transactions will appear here."
        action={
          <Link href="/send">
            <Button
              size="sm"
              className="glow-btn bg-gradient-to-r from-primary to-violet-500 text-primary-foreground"
            >
              Send Tokens
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-1">
      {recent.map((item) => {
        const config = ACTION_LABELS[item.type] ?? ACTION_LABELS.payroll;
        const tokenLabel = item.tokenIn
          ? (TOKEN_BY_ADDRESS.get(item.tokenIn.toLowerCase())?.symbol ?? "Token")
          : "Token";
        const amount = item.totalAmountIn
          ? formatTokenAmount(item.totalAmountIn, 6)
          : item.lpAmount
            ? formatTokenAmount(item.lpAmount, 6)
            : "—";

        return (
          <a
            key={item.txHash}
            href={`https://testnet.arcscan.app/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-3.5 transition-all hover:bg-muted/20 active:scale-[0.98] min-h-[52px]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/30">
              <ArrowUpRight className={`h-4 w-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{config.label}</p>
              <p className="text-xs text-muted-foreground/60 truncate">
                {new Date(item.timestampMs).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <p className="text-sm font-mono font-medium">
              {amount} {tokenLabel}
            </p>
          </a>
        );
      })}
    </div>
  );
}

function HomeContent() {
  const wp = useWizPay();

  return (
    <div className="animate-fade-up space-y-5 stagger-children">
      {/* Balance Card */}
      <Card className="glass-card border-primary/20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <CardContent className="relative pt-6 pb-5 space-y-5">
          <TotalBalance />
          <QuickActions />
        </CardContent>
      </Card>

      {/* Assets Summary */}
      <Card className="glass-card border-border/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Assets
            </CardTitle>
            <Link href="/assets">
              <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary/80">
                See All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <TokenList />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="glass-card border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <RecentActivity items={wp.unifiedHistory} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function HomePage() {
  return (
    <DashboardAppFrame>
      <HomeContent />
    </DashboardAppFrame>
  );
}
