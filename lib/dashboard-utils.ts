import { formatUnits, type Address } from "viem";

import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import { EXPLORER_BASE_URL } from "@/lib/wizpay";

/* ── Types ── */

export interface PayrollEvent {
  txHash: string;
  blockNumber: bigint;
  timestampMs: number;
  tokenIn: Address;
  tokenOut: Address;
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  totalFees: bigint;
  recipientCount: number;
  referenceId: string;
}

export interface MonthlyPayroll {
  month: string;        // "Aug 23", "Sep 23" etc.
  monthKey: string;     // "2023-08" for sorting
  total: number;        // USD-equivalent (assumes stablecoins)
  byToken: Record<string, number>;
}

export interface TokenAllocationItem {
  name: string;
  value: number;
  color: string;
}

export interface EmployeePayment {
  date: number;         // timestamp ms
  employee: string;     // address
  status: "Confirmed";
  amount: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  txHash: string;
}

/* ── Chart color palette (neon Web3) ── */

export const CHART_COLORS: Record<string, string> = {
  USDC: "#38bdf8",   // cyan-400
  EURC: "#a78bfa",   // violet-400
  ETH:  "#34d399",   // emerald-400
  DAI:  "#fbbf24",   // amber-400
  SOL:  "#2dd4bf",   // teal-400
};

export const DONUT_COLORS = [
  "#38bdf8",  // cyan
  "#a78bfa",  // violet
  "#fbbf24",  // amber
  "#2dd4bf",  // teal
  "#f472b6",  // pink
];

/* ── Utility functions ── */

/** Format a bigint token amount as a currency-style string */
export function formatCurrency(
  amount: bigint,
  decimals: number,
  maximumFractionDigits = 2
): string {
  const num = Number(formatUnits(amount, decimals));
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

/** Format a number as a currency-style string */
export function formatCurrencyNumber(
  num: number,
  maximumFractionDigits = 2
): string {
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

/** Get the current payroll cycle label e.g. "April 2026" */
export function getPayrollCycleLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Get full ArcScan explorer URL for a transaction hash */
export function getExplorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

/** Get short month label e.g. "Jan 24" */
function getMonthLabel(timestampMs: number): string {
  const d = new Date(timestampMs);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const year = d.getFullYear().toString().slice(-2);
  return `${month} ${year}`;
}

/** Get sortable month key e.g. "2024-01" */
function getMonthKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Resolve a token address to its symbol, falling back to "???" */
function resolveTokenSymbol(address: Address): string {
  return TOKEN_BY_ADDRESS.get(address.toLowerCase())?.symbol ?? "???";
}

/** Resolve token decimals, defaulting to 6 for stablecoins */
function resolveTokenDecimals(address: Address): number {
  return TOKEN_BY_ADDRESS.get(address.toLowerCase())?.decimals ?? 6;
}

/**
 * Group payroll events by month for chart visualization.
 * Assumes stablecoin amounts (6 decimals) → treated as USD-equivalent.
 */
export function groupPayrollByMonth(events: PayrollEvent[]): MonthlyPayroll[] {
  const map = new Map<string, MonthlyPayroll>();

  for (const event of events) {
    const monthKey = getMonthKey(event.timestampMs);
    const month = getMonthLabel(event.timestampMs);
    const decimals = resolveTokenDecimals(event.tokenIn);
    const amount = Number(formatUnits(event.totalAmountIn, decimals));
    const tokenSym = resolveTokenSymbol(event.tokenIn);

    let entry = map.get(monthKey);
    if (!entry) {
      entry = { month, monthKey, total: 0, byToken: {} };
      map.set(monthKey, entry);
    }

    entry.total += amount;
    entry.byToken[tokenSym] = (entry.byToken[tokenSym] ?? 0) + amount;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

/**
 * Compute token allocation percentages for the donut chart.
 */
export function computeTokenAllocation(
  events: PayrollEvent[]
): TokenAllocationItem[] {
  const totals = new Map<string, number>();

  for (const event of events) {
    const decimals = resolveTokenDecimals(event.tokenIn);
    const amount = Number(formatUnits(event.totalAmountIn, decimals));
    const tokenSym = resolveTokenSymbol(event.tokenIn);

    totals.set(tokenSym, (totals.get(tokenSym) ?? 0) + amount);
  }

  const grandTotal = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  if (grandTotal === 0) return [];

  return Array.from(totals.entries())
    .map(([name, value], index) => ({
      name,
      value: Math.round((value / grandTotal) * 100),
      color: CHART_COLORS[name] ?? DONUT_COLORS[index % DONUT_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Filter monthly payroll data by time range.
 */
export function filterByTimeRange(
  data: MonthlyPayroll[],
  range: "1M" | "6M" | "All"
): MonthlyPayroll[] {
  if (range === "All" || data.length === 0) return data;

  const now = new Date();
  const months = range === "1M" ? 1 : 6;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;

  return data.filter((d) => d.monthKey >= cutoffKey);
}

/**
 * Get all unique token symbols from events.
 */
export function getUniqueTokens(events: PayrollEvent[]): string[] {
  const tokens = new Set<string>();
  for (const event of events) {
    tokens.add(resolveTokenSymbol(event.tokenIn));
    if (event.tokenOut.toLowerCase() !== event.tokenIn.toLowerCase()) {
      tokens.add(resolveTokenSymbol(event.tokenOut));
    }
  }
  return Array.from(tokens);
}
