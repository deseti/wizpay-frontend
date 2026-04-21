"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { WIZPAY_BATCH_PAYMENT_ROUTED_EVENT } from "@/constants/abi";
import {
  WIZPAY_HISTORY_ADDRESSES,
  WIZPAY_HISTORY_FROM_BLOCK,
} from "@/constants/addresses";
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";

import {
  groupPayrollByMonth,
  computeTokenAllocation,
  getUniqueTokens,
  type PayrollEvent,
} from "@/lib/dashboard-utils";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useEmployeePayments } from "@/hooks/useEmployeePayments";
import { arcTestnet } from "@/lib/wagmi";

interface PayrollEventLog {
  transactionHash: string | null;
  blockNumber: bigint | null;
  args: {
    tokenIn?: Address;
    tokenOut?: Address;
    totalAmountIn?: bigint;
    totalAmountOut?: bigint;
    totalFees?: bigint;
    recipientCount?: bigint | number;
    referenceId?: string;
  };
}

/**
 * Orchestrator hook for the payroll overview dashboard.
 * Combines on-chain event data, token balances, and employee payments
 * into a unified state object for the dashboard page and components.
 */
export function usePayrollData() {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { walletAddress } = useActiveWalletAddress();

  // Token balances
  const {
    balances: tokenBalances,
    isLoading: balancesLoading,
    isError: balancesError,
  } = useTokenBalances();

  // Employee-level payments
  const {
    payments: employeePayments,
    isLoading: paymentsLoading,
    isError: paymentsError,
  } = useEmployeePayments();

  // Fetch batch payroll events (the core data source for stats & charts)
  const eventsQuery = useQuery({
    queryKey: [
      "payroll-overview-events",
      walletAddress ?? "disconnected",
      WIZPAY_HISTORY_ADDRESSES.join(","),
    ],
    enabled: Boolean(publicClient && walletAddress),
    staleTime: 60_000,
    queryFn: async (): Promise<PayrollEvent[]> => {
      const currentBlock = await publicClient!.getBlockNumber();
      const CHUNK_SIZE = 9999n;
      const chunkPromises: Promise<PayrollEventLog[]>[] = [];

      for (const contractAddr of WIZPAY_HISTORY_ADDRESSES) {
        let from = WIZPAY_HISTORY_FROM_BLOCK;
        while (from <= currentBlock) {
          let to = from + CHUNK_SIZE;
          if (to > currentBlock) to = currentBlock;

          chunkPromises.push(
            publicClient!.getLogs({
              address: contractAddr,
              event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
              args: { sender: walletAddress as Address },
              fromBlock: from,
              toBlock: to,
            }) as Promise<PayrollEventLog[]>
          );
          from = to + 1n;
        }
      }

      const allLogs = (await Promise.all(chunkPromises)).flat();

      // Get block timestamps
      const uniqueBlocks = Array.from(
        new Set(
          allLogs
            .map((log) => log.blockNumber?.toString())
            .filter((blockNumber): blockNumber is string => Boolean(blockNumber))
        )
      );

      const blockEntries = await Promise.all(
        uniqueBlocks.map(async (bns) => {
          const bn = BigInt(bns);
          const block = await publicClient!.getBlock({ blockNumber: bn });
          return [bns, Number(block.timestamp) * 1000] as const;
        })
      );
      const blockTs = new Map(blockEntries);

      return allLogs
        .map((log): PayrollEvent | null => {
          if (
            !log.transactionHash ||
            !log.blockNumber ||
            !log.args.tokenIn ||
            !log.args.tokenOut ||
            log.args.totalAmountIn === undefined ||
            log.args.totalAmountOut === undefined ||
            log.args.totalFees === undefined ||
            log.args.recipientCount === undefined ||
            log.args.referenceId === undefined
          ) {
            return null;
          }

          return {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestampMs: blockTs.get(log.blockNumber.toString()) ?? 0,
            tokenIn: log.args.tokenIn,
            tokenOut: log.args.tokenOut,
            totalAmountIn: log.args.totalAmountIn,
            totalAmountOut: log.args.totalAmountOut,
            totalFees: log.args.totalFees,
            recipientCount: Number(log.args.recipientCount),
            referenceId: log.args.referenceId,
          };
        })
        .filter((event): event is PayrollEvent => event !== null)
        .sort((a, b) => Number(b.blockNumber - a.blockNumber));
    },
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // ── Computed stats ──

  const totalPayroll = useMemo(
    () =>
      events.reduce((sum, e) => {
        const decimals =
          TOKEN_BY_ADDRESS.get(e.tokenIn.toLowerCase())?.decimals ?? 6;
        return sum + Number(formatUnits(e.totalAmountIn, decimals));
      }, 0),
    [events]
  );

  const totalRecipientCount = useMemo(
    () => events.reduce((sum, e) => sum + e.recipientCount, 0),
    [events]
  );

  const uniqueEmployees = useMemo(() => {
    const addrs = new Set<string>();
    for (const p of employeePayments) {
      if (p.employee !== "Multiple Recipients") {
        addrs.add(p.employee.toLowerCase());
      }
    }
    // If no individual payments are resolved, use aggregate recipient count
    return addrs.size > 0 ? addrs.size : totalRecipientCount;
  }, [employeePayments, totalRecipientCount]);

  const averagePayment = useMemo(
    () =>
      totalRecipientCount > 0 ? totalPayroll / totalRecipientCount : 0,
    [totalPayroll, totalRecipientCount]
  );

  const tokensDistributed = useMemo(() => getUniqueTokens(events), [events]);

  const monthlyData = useMemo(() => groupPayrollByMonth(events), [events]);

  const tokenAllocation = useMemo(
    () => computeTokenAllocation(events),
    [events]
  );

  const batchCount = events.length;

  // ── Aggregated loading / error state ──
  const isLoading =
    eventsQuery.isLoading || balancesLoading || paymentsLoading;
  const isError = eventsQuery.isError || balancesError || paymentsError;
  const error = eventsQuery.error;
  const hasData = events.length > 0;

  return {
    // Wallet
    walletAddress,

    // Stats
    totalPayroll,
    uniqueEmployees,
    averagePayment,
    tokensDistributed,
    batchCount,

    // Token balances
    tokenBalances,

    // Charts
    monthlyData,
    tokenAllocation,

    // Table data
    employeePayments,

    // Raw events
    events,

    // State
    isLoading,
    isError,
    error,
    hasData,
  };
}
