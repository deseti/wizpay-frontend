"use client";

import { useState, useMemo } from "react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type MonthlyPayroll,
  filterByTimeRange,
  formatCurrencyNumber,
  CHART_COLORS,
} from "@/lib/dashboard-utils";

interface PayrollChartProps {
  data: MonthlyPayroll[];
  isLoading: boolean;
}

type TimeRange = "1M" | "6M" | "All";

const TIME_RANGES: TimeRange[] = ["6M", "1M", "All"];

function CustomTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <p className="mb-1.5 text-xs font-semibold text-foreground/90">
        {label}
      </p>
      {payload.map((entry) => {
        const dataKey =
          typeof entry.dataKey === "string"
            ? entry.dataKey
            : String(entry.dataKey ?? "value");
        const rawValue = Array.isArray(entry.value)
          ? entry.value[0]
          : entry.value;
        const numericValue =
          typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);

        return (
        <div
          key={dataKey}
          className="flex items-center gap-2 text-sm"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{dataKey}:</span>
          <span className="font-mono font-semibold">
            {formatCurrencyNumber(numericValue)}
          </span>
        </div>
      )})}
    </div>
  );
}

export function PayrollChart({ data, isLoading }: PayrollChartProps) {
  const [range, setRange] = useState<TimeRange>("6M");

  const filteredData = useMemo(
    () => filterByTimeRange(data, range),
    [data, range]
  );

  // Get all unique token keys across the data for area series
  const tokenKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of data) {
      for (const key of Object.keys(entry.byToken)) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }, [data]);

  // Transform data for Recharts (flatten byToken into top-level keys)
  const chartData = useMemo(
    () =>
      filteredData.map((entry) => ({
        month: entry.month,
        ...entry.byToken,
      })),
    [filteredData]
  );

  return (
    <Card className="glass-card border-border/40 flex-1 min-w-0">
      <CardHeader className="relative">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Payroll Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Monthly spending by token
            </CardDescription>
          </div>

          {/* Time range tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-border/30 bg-background/40 p-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  range === r
                    ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[280px] w-full rounded-xl bg-muted/20" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-border/30 bg-background/20">
            <p className="text-sm text-muted-foreground/50">
              No payroll data for this period
            </p>
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  {tokenKeys.map((key) => (
                    <linearGradient
                      key={key}
                      id={`gradient-${key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={CHART_COLORS[key] ?? "#888"}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor={CHART_COLORS[key] ?? "#888"}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.35)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.35)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                  }
                />
                <Tooltip content={(props) => <CustomTooltip {...props} />} />
                {tokenKeys.map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={CHART_COLORS[key] ?? "#888"}
                    strokeWidth={2}
                    fill={`url(#gradient-${key})`}
                    dot={{
                      r: 3,
                      fill: CHART_COLORS[key] ?? "#888",
                      strokeWidth: 0,
                    }}
                    activeDot={{
                      r: 5,
                      fill: CHART_COLORS[key] ?? "#888",
                      stroke: "rgba(255,255,255,0.2)",
                      strokeWidth: 2,
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
