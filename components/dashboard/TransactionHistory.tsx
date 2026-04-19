"use client";

import { ExternalLink, Search, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import type { UnifiedHistoryItem, HistoryActionType } from "@/lib/types";
import {
  EXPLORER_BASE_URL,
  formatTokenAmount,
} from "@/lib/wizpay";
import { useActivityHistory, type ActivityFilter } from "@/hooks/useActivityHistory";

function formatDateTime(timestampMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestampMs);
}

function txLink(hash: string) {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

const ACTION_CONFIG: Record<
  HistoryActionType,
  { label: string; className: string }
> = {
  payroll: {
    label: "Payroll Batch",
    className: "bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25",
  },
  add_lp: {
    label: "Add LP",
    className: "bg-blue-500/12 text-blue-300/90 border-blue-500/25",
  },
  remove_lp: {
    label: "Remove LP",
    className: "bg-amber-500/12 text-amber-300/90 border-amber-500/25",
  },
};

const FILTER_TABS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "payroll", label: "Payroll" },
  { value: "add_lp", label: "Add LP" },
  { value: "remove_lp", label: "Remove LP" },
];

function getDetailText(item: UnifiedHistoryItem): string {
  if (item.type === "payroll") {
    const inToken =
      TOKEN_BY_ADDRESS.get(item.tokenIn?.toLowerCase() ?? "")?.symbol ?? "?";
    return `${item.recipientCount} recipients · ${formatTokenAmount(item.totalAmountIn ?? 0n, 6)} ${inToken}`;
  }
  const tokenSym =
    TOKEN_BY_ADDRESS.get(item.lpToken?.toLowerCase() ?? "")?.symbol ?? "Token";
  const amount = formatTokenAmount(item.lpAmount ?? 0n, 6);
  return `${amount} ${tokenSym}`;
}

function getReferenceText(item: UnifiedHistoryItem): string {
  if (item.type === "payroll" && item.referenceId) return item.referenceId;
  if (item.type === "add_lp") return "Deposit Liquidity";
  return "Withdraw Liquidity";
}

/* ── Skeleton rows ── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={`skel-${i}`}>
          <TableCell>
            <Skeleton className="h-4 w-28 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 bg-muted/20" />
          </TableCell>
          <TableCell>
            <div className="space-y-1">
              <Skeleton className="h-4 w-32 bg-muted/20" />
              <Skeleton className="h-3 w-24 bg-muted/20" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-20 bg-muted/20" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface TransactionHistoryProps {
  unifiedHistory: UnifiedHistoryItem[];
  isLoading: boolean;
}

export function TransactionHistory({
  unifiedHistory,
  isLoading,
}: TransactionHistoryProps) {
  const {
    items: displayItems,
    totalCount,
    currentPage,
    totalPages,
    filter,
    searchTerm,
    setFilter,
    setSearchTerm,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
    resetFilters,
  } = useActivityHistory(unifiedHistory, { pageSize: 10 });

  const isFiltered = filter !== "all" || searchTerm.trim().length > 0;

  return (
    <Card className="glass-card border-border/40">
      <CardHeader className="space-y-3 border-b border-border/30 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Clock className="h-3.5 w-3.5" />
            </div>
            Activity
          </CardTitle>
          <div className="flex items-center gap-2">
            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 gap-1 text-xs text-muted-foreground">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
            <Badge variant="outline" className="border-primary/20 text-primary/70 bg-primary/5 text-xs">
              {totalCount} {filter === "all" ? "events" : ACTION_CONFIG[filter as HistoryActionType]?.label ?? filter}
            </Badge>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                filter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search by ref ID, tx hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 bg-background/50 pl-9 border-border/40 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          /* Skeleton Loading */
          <div className="overflow-hidden rounded-2xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRows />
              </TableBody>
            </Table>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/40 bg-background/30 p-8 text-center">
            <p className="text-sm font-semibold">
              {isFiltered ? "No matching transactions found" : "No confirmed transactions yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              {isFiltered
                ? "Try adjusting your filters or search term."
                : "Once a transaction is confirmed, it will appear here automatically."}
            </p>
            {isFiltered && (
              <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border/40 md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayItems.map((item, idx) => {
                    const cfg = ACTION_CONFIG[item.type];
                    return (
                      <TableRow key={`${item.txHash}-${idx}`} className="border-border/20 hover:bg-primary/3 transition-colors">
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDateTime(item.timestampMs)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cfg.className}
                          >
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="font-semibold text-sm">
                              {getReferenceText(item)}
                            </p>
                            <p className="text-xs text-muted-foreground/60">
                              {getDetailText(item)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {item.type === "payroll"
                            ? `${formatTokenAmount(item.totalAmountIn ?? 0n, 6)} ${TOKEN_BY_ADDRESS.get(item.tokenIn?.toLowerCase() ?? "")?.symbol ?? ""}`
                            : `${formatTokenAmount(item.lpAmount ?? 0n, 6)} ${TOKEN_BY_ADDRESS.get(item.lpToken?.toLowerCase() ?? "")?.symbol ?? ""}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25">
                              Confirmed
                            </Badge>
                            <a
                              href={txLink(item.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
                            >
                              View tx
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {displayItems.map((item, idx) => {
                const cfg = ACTION_CONFIG[item.type];
                return (
                  <Card
                    key={`${item.txHash}-mobile-${idx}`}
                    className="surface-panel border border-border/40"
                  >
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{getReferenceText(item)}</p>
                          <p className="text-xs text-muted-foreground/60">
                            {formatDateTime(item.timestampMs)}
                          </p>
                        </div>
                        <Badge variant="outline" className={cfg.className}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold">
                          {item.type === "payroll" ? "Total Amount" : "LP Amount"}
                        </p>
                        <p className="mt-1 font-mono text-sm font-medium">
                          {getDetailText(item)}
                        </p>
                      </div>
                      <a
                        href={txLink(item.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
                      >
                        Open on ArcScan
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground/60">
                  Page {currentPage + 1} of {totalPages} · {totalCount} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasPrevPage}
                    onClick={prevPage}
                    className="h-8 gap-1 border-border/40 hover:border-primary/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNextPage}
                    onClick={nextPage}
                    className="h-8 gap-1 border-border/40 hover:border-primary/20"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
