"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { zeroAddress } from "viem";

import { Badge } from "@/components/ui/badge";
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
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import type { HistoryItem } from "@/lib/types";
import {
  EXPLORER_BASE_URL,
  formatCompactAddress,
  formatTokenAmount,
  SUPPORTED_TOKENS,
} from "@/lib/wizpay";

function formatDateTime(timestampMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestampMs);
}

function txLink(hash: string) {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

interface TransactionHistoryProps {
  history: HistoryItem[];
  isLoading: boolean;
}

export function TransactionHistory({
  history,
  isLoading,
}: TransactionHistoryProps) {
  return (
    <Card className="glass-card border-border/60">
      <CardHeader className="soft-divider border-b border-border/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Live Transaction History</CardTitle>
            <CardDescription>
              Confirmed batches streamed from `BatchPaymentRouted` events.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit">
            {history.length} events
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading on-chain history...
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/45 p-8 text-center">
            <p className="text-sm font-medium">No confirmed batches yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once a batch is confirmed, its memo, total amount, and ArcScan
              link will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border/60 md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => {
                    const inputToken =
                      TOKEN_BY_ADDRESS.get(item.tokenIn.toLowerCase()) ??
                      SUPPORTED_TOKENS.USDC;
                    const tokenOut =
                      item.tokenOut === zeroAddress
                        ? "Mixed route"
                        : TOKEN_BY_ADDRESS.get(item.tokenOut.toLowerCase())
                            ?.symbol ??
                          formatCompactAddress(item.tokenOut);

                    return (
                      <TableRow key={item.txHash}>
                        <TableCell className="text-sm">
                          {formatDateTime(item.timestampMs)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{item.referenceId}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.recipientCount} recipients · {tokenOut}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatTokenAmount(item.totalAmountIn, 6)}{" "}
                          {inputToken.symbol}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500/15 text-emerald-200">
                              Confirmed
                            </Badge>
                            <a
                              href={txLink(item.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
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
              {history.map((item) => {
                const inputToken =
                  TOKEN_BY_ADDRESS.get(item.tokenIn.toLowerCase()) ??
                  SUPPORTED_TOKENS.USDC;

                return (
                  <Card
                    key={`${item.txHash}-mobile`}
                    className="surface-panel border border-border/60"
                    size="sm"
                  >
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.referenceId}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(item.timestampMs)}
                          </p>
                        </div>
                        <Badge className="bg-emerald-500/15 text-emerald-200">
                          Confirmed
                        </Badge>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Total Amount
                        </p>
                        <p className="mt-2 font-mono text-sm">
                          {formatTokenAmount(item.totalAmountIn, 6)}{" "}
                          {inputToken.symbol}
                        </p>
                      </div>
                      <a
                        href={txLink(item.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Open on ArcScan
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
