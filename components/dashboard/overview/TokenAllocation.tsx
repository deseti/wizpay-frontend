"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type TokenAllocationItem, DONUT_COLORS } from "@/lib/dashboard-utils";

interface TokenAllocationProps {
  data: TokenAllocationItem[];
  isLoading: boolean;
}

function CustomTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload as TokenAllocationItem | undefined;
  if (!item) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-sm font-semibold">{item.name}</span>
        <span className="font-mono text-sm text-muted-foreground">
          {item.value}%
        </span>
      </div>
    </div>
  );
}

export function TokenAllocation({
  data,
  isLoading,
}: TokenAllocationProps) {
  const dominantToken = data.length > 0 ? data[0] : null;

  return (
    <Card className="glass-card border-border/40 w-full xl:w-80 shrink-0">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Token Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-44 w-44 rounded-full bg-muted/20" />
            <div className="flex gap-4">
              <Skeleton className="h-4 w-20 bg-muted/20" />
              <Skeleton className="h-4 w-20 bg-muted/20" />
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-border/30 bg-background/20">
            <p className="text-sm text-muted-foreground/50">
              No allocation data
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* Donut chart */}
            <div className="relative h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {data.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color ?? DONUT_COLORS[index % DONUT_COLORS.length]}
                        className="transition-opacity hover:opacity-80"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={(props) => <CustomTooltip {...props} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              {dominantToken && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold tracking-tight">
                    {dominantToken.value}%
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    {dominantToken.name}
                  </span>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {data.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shadow-sm"
                    style={{
                      backgroundColor: item.color,
                      boxShadow: `0 0 6px ${item.color}40`,
                    }}
                  />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-mono font-semibold text-foreground/80">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
