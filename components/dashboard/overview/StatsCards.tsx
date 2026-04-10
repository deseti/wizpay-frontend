"use client";

import { DollarSign, Users, Coins, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrencyNumber,
  CHART_COLORS,
} from "@/lib/dashboard-utils";

interface OverviewStatsCardsProps {
  totalPayroll: number;
  uniqueEmployees: number;
  tokensDistributed: string[];
  averagePayment: number;
  batchCount: number;
  isLoading: boolean;
}

const cardConfig = [
  {
    key: "total-payroll",
    icon: DollarSign,
    label: "Total Payroll",
    description: "Total value distributed across all batches",
    accent: "from-cyan-500/12 to-transparent",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
  },
  {
    key: "employees-paid",
    icon: Users,
    label: "Employees Paid",
    description: "Unique recipient addresses across batches",
    accent: "from-emerald-500/12 to-transparent",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
  },
  {
    key: "tokens-distributed",
    icon: Coins,
    label: "Tokens Distributed",
    description: "Unique tokens used in payroll routing",
    accent: "from-violet-500/12 to-transparent",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
  },
  {
    key: "avg-payment",
    icon: TrendingUp,
    label: "Avg. Payment",
    description: "Average amount per individual recipient",
    accent: "from-amber-500/12 to-transparent",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
  },
];

export function OverviewStatsCards({
  totalPayroll,
  uniqueEmployees,
  tokensDistributed,
  averagePayment,
  batchCount,
  isLoading,
}: OverviewStatsCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cardConfig.map((config, index) => (
        <Card
          key={config.key}
          className="glass-card glow-card border-border/40 relative overflow-hidden group"
        >
          <div
            className={`absolute inset-0 bg-gradient-to-br ${config.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          />
          <CardHeader className="relative pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${config.iconBg} ${config.iconColor}`}
              >
                <config.icon className="h-3.5 w-3.5" />
              </div>
              {config.label}
            </CardTitle>
            <CardDescription className="text-xs">
              {config.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-32 bg-muted/20" />
                <Skeleton className="h-4 w-20 bg-muted/20" />
              </div>
            ) : (
              <CardValueDisplay
                index={index}
                totalPayroll={totalPayroll}
                uniqueEmployees={uniqueEmployees}
                tokensDistributed={tokensDistributed}
                averagePayment={averagePayment}
                batchCount={batchCount}
              />
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function CardValueDisplay({
  index,
  totalPayroll,
  uniqueEmployees,
  tokensDistributed,
  averagePayment,
  batchCount,
}: {
  index: number;
  totalPayroll: number;
  uniqueEmployees: number;
  tokensDistributed: string[];
  averagePayment: number;
  batchCount: number;
}) {
  switch (index) {
    case 0:
      return (
        <div className="space-y-1.5">
          <p className="text-3xl font-bold tracking-tight">
            {formatCurrencyNumber(totalPayroll)}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {batchCount} batch{batchCount !== 1 ? "es" : ""} processed
          </p>
        </div>
      );
    case 1:
      return (
        <div className="space-y-1.5">
          <p className="text-3xl font-bold tracking-tight">
            {uniqueEmployees.toLocaleString()}
          </p>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                style={{ width: "100%" }}
              />
            </div>
            <span className="text-xs text-muted-foreground/70">100%</span>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tokensDistributed.length > 0 ? (
              tokensDistributed.map((token) => (
                <Badge
                  key={token}
                  variant="outline"
                  className="text-xs px-2.5 py-0.5 font-mono font-semibold"
                  style={{
                    borderColor: `${CHART_COLORS[token] ?? "#888"}40`,
                    color: CHART_COLORS[token] ?? "#888",
                    backgroundColor: `${CHART_COLORS[token] ?? "#888"}10`,
                  }}
                >
                  {token}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground/50">
                No tokens yet
              </span>
            )}
          </div>
        </div>
      );
    case 3:
      return (
        <div className="space-y-1.5">
          <p className="text-3xl font-bold tracking-tight">
            {formatCurrencyNumber(averagePayment)}
          </p>
          <p className="text-xs text-muted-foreground/70">per recipient</p>
        </div>
      );
    default:
      return null;
  }
}
