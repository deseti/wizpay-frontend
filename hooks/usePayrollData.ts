"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address, type Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";

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
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useEmployeePayments } from "@/hooks/useEmployeePayments";

/**
 * Orchestrator hook for the payroll overview dashboard.
 * Combines on-chain event data, token balances, and employee payments
 * into a unified state object for the dashboard page and components.
 */
export function usePayrollData() {
  const publicClient = usePublicClient();
  const { address: walletAddress } = useAccount();

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
      const chunkPromises: Promise<any[]>[] = [];

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
            })
          );
          from = to + 1n;
        }
      }

      const allLogs = (await Promise.all(chunkPromises)).flat();

      // Get block timestamps
      const uniqueBlocks = Array.from(
        new Set(
          allLogs
            .map((l) => (l.blockNumber as bigint).toString())
            .filter(Boolean)
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
        .map((log: any) => ({
          txHash: log.transactionHash as string,
          blockNumber: log.blockNumber as bigint,
          timestampMs:
            blockTs.get((log.blockNumber as bigint).toString()) ?? 0,
          tokenIn: log.args.tokenIn as Address,
          tokenOut: log.args.tokenOut as Address,
          totalAmountIn: log.args.totalAmountIn as bigint,
          totalAmountOut: log.args.totalAmountOut as bigint,
          totalFees: log.args.totalFees as bigint,
          recipientCount: Number(log.args.recipientCount),
          referenceId: log.args.referenceId as string,
        }))
        .sort((a, b) => Number(b.blockNumber - a.blockNumber));
    },
  });

  const events = eventsQuery.data ?? [];

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
