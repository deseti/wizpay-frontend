"use client";

import { useState, useMemo } from "react";
import { ExternalLink, Search, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
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

const PAGE_SIZE = 10;

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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return unifiedHistory;
    const q = searchTerm.toLowerCase();
    return unifiedHistory.filter((item) => {
      const ref = getReferenceText(item).toLowerCase();
      const hash = item.txHash.toLowerCase();
      const action = ACTION_CONFIG[item.type].label.toLowerCase();
      return ref.includes(q) || hash.includes(q) || action.includes(q);
    });
  }, [unifiedHistory, searchTerm]);

  const isSearching = searchTerm.trim().length > 0;
  const displayItems = isSearching ? filtered : filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <Card className="glass-card border-border/40">
      <CardHeader className="soft-divider border-b border-border/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Clock className="h-3.5 w-3.5" />
              </div>
              Live Transaction History
            </CardTitle>
            <CardDescription>
              All on-chain events: payroll batches, LP deposits &amp; withdrawals.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-primary/20 text-primary/70 bg-primary/5">
            {unifiedHistory.length} events
          </Badge>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search by Reference ID, Tx Hash, or Action..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(0);
            }}
            className="h-10 bg-background/50 pl-9 border-border/40"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-5">
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
              {isSearching ? "No matching transactions found" : "No confirmed transactions yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              {isSearching
                ? "Try a different search term."
                : "Once a transaction is confirmed, it will appear here automatically."}
            </p>
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

            {/* Pagination (only when not searching) */}
            {!isSearching && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground/60">
                  Page {currentPage + 1} of {totalPages} · {filtered.length} total
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="h-8 gap-1 border-border/40 hover:border-primary/20"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage((p) => p + 1)}
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
