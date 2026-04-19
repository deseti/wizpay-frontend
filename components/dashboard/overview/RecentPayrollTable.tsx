"use client";

import { useState, useMemo } from "react";
import {
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Check,
} from "lucide-react";

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

import {
  formatCompactAddress,
  formatTokenAmount,
} from "@/lib/wizpay";
import {
  getExplorerTxUrl,
  CHART_COLORS,
  type EmployeePayment,
} from "@/lib/dashboard-utils";

const PAGE_SIZE = 10;

function formatDateShort(timestampMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(timestampMs);
}

/* ── Skeleton rows ── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={`skel-${i}`}>
          <TableCell>
            <Skeleton className="h-4 w-20 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-14 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24 bg-muted/20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16 bg-muted/20" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface RecentPayrollTableProps {
  payments: EmployeePayment[];
  isLoading: boolean;
}

export function RecentPayrollTable({
  payments,
  isLoading,
}: RecentPayrollTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return payments;
    const q = searchTerm.toLowerCase();
    return payments.filter((p) => {
      return (
        p.employee.toLowerCase().includes(q) ||
        p.txHash.toLowerCase().includes(q) ||
        p.tokenSymbol.toLowerCase().includes(q)
      );
    });
  }, [payments, searchTerm]);

  const isSearching = searchTerm.trim().length > 0;
  const displayItems = isSearching
    ? filtered
    : filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function copyToClipboard(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch {
      // noop
    }
  }

  return (
    <Card className="glass-card border-border/40">
      <CardHeader className="soft-divider border-b border-border/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Clock className="h-3.5 w-3.5" />
              </div>
              Recent Payroll History
            </CardTitle>
            <CardDescription>
              Individual payments from confirmed payroll batches.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="w-fit border-primary/20 text-primary/70 bg-primary/5"
          >
            {payments.length} payments
          </Badge>
        </div>

        {/* Search Bar */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search by address, tx hash, or token..."
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
          <div className="overflow-hidden rounded-2xl border border-border/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Tx Hash</TableHead>
                  <TableHead>Explorer</TableHead>
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
              {isSearching
                ? "No matching payments found"
                : "No payroll payments yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              {isSearching
                ? "Try a different search term."
                : "Payments will appear here after your first batch is confirmed."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border/40 md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Tx Hash</TableHead>
                    <TableHead>Explorer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayItems.map((item, idx) => (
                    <TableRow
                      key={`${item.txHash}-${item.employee}-${idx}`}
                      className="border-border/20 hover:bg-primary/3 transition-colors"
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateShort(item.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/15 text-[10px] font-bold text-primary ring-1 ring-primary/15">
                            {item.employee === "Multiple Recipients"
                              ? "M"
                              : item.employee.slice(2, 4).toUpperCase()}
                          </div>
                          <span className="font-mono text-sm">
                            {item.employee === "Multiple Recipients"
                              ? "Multiple"
                              : formatCompactAddress(item.employee)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {formatTokenAmount(item.amount, item.tokenDecimals)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-xs font-mono"
                          style={{
                            borderColor: `${CHART_COLORS[item.tokenSymbol] ?? "#888"}40`,
                            color: CHART_COLORS[item.tokenSymbol] ?? "#888",
                            backgroundColor: `${CHART_COLORS[item.tokenSymbol] ?? "#888"}10`,
                          }}
                        >
                          {item.tokenSymbol}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => copyToClipboard(item.txHash)}
                          className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-primary transition-colors"
                          title="Copy full hash"
                        >
                          {formatCompactAddress(item.txHash)}
                          {copiedHash === item.txHash ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <a
                          href={getExplorerTxUrl(item.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
                        >
                          View
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {displayItems.map((item, idx) => (
                <Card
                  key={`${item.txHash}-mobile-${idx}`}
                  className="surface-panel border border-border/40"
                >
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/15 text-[10px] font-bold text-primary ring-1 ring-primary/15">
                          {item.employee === "Multiple Recipients"
                            ? "M"
                            : item.employee.slice(2, 4).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-mono text-sm font-semibold">
                            {item.employee === "Multiple Recipients"
                              ? "Multiple"
                              : formatCompactAddress(item.employee)}
                          </p>
                          <p className="text-xs text-muted-foreground/60">
                            {formatDateShort(item.date)}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground/60 font-semibold">
                          Amount
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono"
                          style={{
                            borderColor: `${CHART_COLORS[item.tokenSymbol] ?? "#888"}40`,
                            color: CHART_COLORS[item.tokenSymbol] ?? "#888",
                            backgroundColor: `${CHART_COLORS[item.tokenSymbol] ?? "#888"}10`,
                          }}
                        >
                          {item.tokenSymbol}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-sm font-medium">
                        {formatTokenAmount(item.amount, item.tokenDecimals)}{" "}
                        {item.tokenSymbol}
                      </p>
                    </div>
                    <a
                      href={getExplorerTxUrl(item.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline transition-colors"
                    >
                      Open on ArcScan
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {!isSearching && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground/60">
                  Page {currentPage + 1} of {totalPages} · {filtered.length}{" "}
                  total
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
