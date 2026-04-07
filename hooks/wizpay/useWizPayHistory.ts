import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";

import {
  WIZPAY_ABI,
  WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
  LIQUIDITY_ADDED_EVENT,
  LIQUIDITY_REMOVED_EVENT,
} from "@/constants/abi";
import {
  WIZPAY_ADDRESS,
  WIZPAY_HISTORY_ADDRESSES,
  WIZPAY_HISTORY_FROM_BLOCK,
  STABLE_FX_ADAPTER_ADDRESS,
} from "@/constants/addresses";
import { sameAddress, type TokenSymbol } from "@/lib/wizpay";
import type { HistoryItem, UnifiedHistoryItem } from "@/lib/types";

export function useWizPayHistory({
  activeToken,
  refetchCb
}: {
  activeToken: { address: Address };
  refetchCb: () => void;
}) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address: walletAddress } = useAccount();

  /* ── history ── */
  const historyQuery = useQuery({
    queryKey: [
      "wizpay-history",
      walletAddress ?? "disconnected",
      WIZPAY_HISTORY_ADDRESSES.join(","),
    ],
    enabled: Boolean(publicClient && walletAddress),
    queryFn: async (): Promise<HistoryItem[]> => {
      const currentBlock = await publicClient!.getBlockNumber();
      const CHUNK_SIZE = 9999n;
      const chunkPromises = [];

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

      const historyLogs = (await Promise.all(chunkPromises)).flat();

      const uniqueBlockNumbers = Array.from(
        new Set(
          historyLogs
            .map((log) => log.blockNumber)
            .filter((bn): bn is bigint => Boolean(bn))
            .map((bn) => bn.toString())
        )
      );

      const blockEntries = await Promise.all(
        uniqueBlockNumbers.map(async (bns) => {
          const bn = BigInt(bns);
          const block = await publicClient!.getBlock({ blockNumber: bn });
          return [bns, Number(block.timestamp) * 1000] as const;
        })
      );

      const blockTimestampMap = new Map(blockEntries);

      return historyLogs
        .map((log) => ({
          contractAddress: log.address,
          tokenIn: log.args.tokenIn as Address,
          tokenOut: log.args.tokenOut as Address,
          totalAmountIn: log.args.totalAmountIn as bigint,
          totalAmountOut: log.args.totalAmountOut as bigint,
          totalFees: log.args.totalFees as bigint,
          recipientCount: Number(log.args.recipientCount),
          referenceId: log.args.referenceId as string,
          txHash: log.transactionHash as Hex,
          blockNumber: log.blockNumber as bigint,
          timestampMs:
            blockTimestampMap.get((log.blockNumber as bigint).toString()) ?? 0,
        }))
        .sort((l, r) => Number(r.blockNumber - l.blockNumber));
    },
  });

  /* ── LP history (LiquidityAdded + LiquidityRemoved from StableFXAdapter) ── */
  /* NOTE: LP events don't have an indexed sender/provider field, so we must
     filter post-fetch by checking each transaction's `from` matches the
     connected wallet. This ensures users only see their own LP activity. */
  const lpHistoryQuery = useQuery({
    queryKey: [
      "lp-history",
      walletAddress ?? "disconnected",
      STABLE_FX_ADAPTER_ADDRESS,
    ],
    enabled: Boolean(publicClient && walletAddress),
    queryFn: async (): Promise<UnifiedHistoryItem[]> => {
      const currentBlock = await publicClient!.getBlockNumber();
      const CHUNK_SIZE = 9999n;
      const addedPromises: Promise<any[]>[] = [];
      const removedPromises: Promise<any[]>[] = [];

      let from = WIZPAY_HISTORY_FROM_BLOCK;
      while (from <= currentBlock) {
        let to = from + CHUNK_SIZE;
        if (to > currentBlock) to = currentBlock;

        addedPromises.push(
          publicClient!.getLogs({
            address: STABLE_FX_ADAPTER_ADDRESS,
            event: LIQUIDITY_ADDED_EVENT,
            fromBlock: from,
            toBlock: to,
          })
        );
        removedPromises.push(
          publicClient!.getLogs({
            address: STABLE_FX_ADAPTER_ADDRESS,
            event: LIQUIDITY_REMOVED_EVENT,
            fromBlock: from,
            toBlock: to,
          })
        );
        from = to + 1n;
      }

      const [addedLogsRaw, removedLogsRaw] = await Promise.all([
        Promise.all(addedPromises).then((r) => r.flat()),
        Promise.all(removedPromises).then((r) => r.flat()),
      ]);

      // Filter by transaction sender — LP events lack an indexed user param
      const userAddr = walletAddress!.toLowerCase();
      const filterByTxSender = async (logs: any[]) => {
        if (logs.length === 0) return [];
        const txHashes = Array.from(new Set(logs.map((l: any) => l.transactionHash as string)));
        const txReceipts = await Promise.all(
          txHashes.map(async (hash) => {
            const receipt = await publicClient!.getTransactionReceipt({ hash: hash as Hex });
            return [hash, receipt.from.toLowerCase()] as const;
          })
        );
        const senderMap = new Map(txReceipts);
        return logs.filter((l: any) => senderMap.get(l.transactionHash as string) === userAddr);
      };

      const [addedLogs, removedLogs] = await Promise.all([
        filterByTxSender(addedLogsRaw),
        filterByTxSender(removedLogsRaw),
      ]);

      const allLogs = [...addedLogs, ...removedLogs];
      if (allLogs.length === 0) return [];

      const uniqueBlocks = Array.from(
        new Set(allLogs.map((l: any) => (l.blockNumber as bigint).toString()))
      );
      const blockEntries = await Promise.all(
        uniqueBlocks.map(async (bns) => {
          const bn = BigInt(bns);
          const block = await publicClient!.getBlock({ blockNumber: bn });
          return [bns, Number(block.timestamp) * 1000] as const;
        })
      );
      const blockTs = new Map(blockEntries);

      const added: UnifiedHistoryItem[] = addedLogs.map((log: any) => ({
        type: "add_lp" as const,
        txHash: log.transactionHash as Hex,
        blockNumber: log.blockNumber as bigint,
        timestampMs: blockTs.get((log.blockNumber as bigint).toString()) ?? 0,
        lpToken: log.args.token as Address,
        lpAmount: log.args.amountIn as bigint,
        lpShares: log.args.sharesMinted as bigint,
      }));

      const removed: UnifiedHistoryItem[] = removedLogs.map((log: any) => ({
        type: "remove_lp" as const,
        txHash: log.transactionHash as Hex,
        blockNumber: log.blockNumber as bigint,
        timestampMs: blockTs.get((log.blockNumber as bigint).toString()) ?? 0,
        lpToken: log.args.token as Address,
        lpAmount: log.args.amountOut as bigint,
        lpShares: log.args.sharesBurned as bigint,
      }));

      return [...added, ...removed].sort(
        (a, b) => Number(b.blockNumber - a.blockNumber)
      );
    },
  });

  /* ── event watcher ── */
  useWatchContractEvent({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    eventName: "BatchPaymentRouted",
    args: walletAddress ? { sender: walletAddress } : undefined,
    enabled: Boolean(walletAddress),
    onLogs: () => {
      queryClient.invalidateQueries({ queryKey: ["wizpay-history"] });
      refetchCb();
    },
  });

  const history = historyQuery.data ?? [];

  // Build unified history combining payroll + LP events
  const unifiedHistory = useMemo<UnifiedHistoryItem[]>(() => {
    const payrollItems: UnifiedHistoryItem[] = history.map((item) => ({
      type: "payroll" as const,
      txHash: item.txHash,
      blockNumber: item.blockNumber,
      timestampMs: item.timestampMs,
      tokenIn: item.tokenIn,
      tokenOut: item.tokenOut,
      totalAmountIn: item.totalAmountIn,
      totalAmountOut: item.totalAmountOut,
      totalFees: item.totalFees,
      recipientCount: item.recipientCount,
      referenceId: item.referenceId,
    }));
    const lpItems = lpHistoryQuery.data ?? [];
    return [...payrollItems, ...lpItems].sort(
      (a, b) => Number(b.blockNumber - a.blockNumber)
    );
  }, [history, lpHistoryQuery.data]);

  const totalRouted = useMemo(
    () =>
      history.reduce((total, item) => {
        if (!sameAddress(item.tokenIn, activeToken.address)) return total;
        return total + item.totalAmountIn;
      }, 0n),
    [activeToken.address, history]
  );

  /* ── Reset all history caches on wallet switch / disconnect ── */
  useEffect(() => {
    queryClient.removeQueries({ queryKey: ["wizpay-history"] });
    queryClient.removeQueries({ queryKey: ["lp-history"] });
  }, [walletAddress, queryClient]);

  return {
    history,
    unifiedHistory,
    totalRouted,
    historyLoading: historyQuery.isLoading || lpHistoryQuery.isLoading,
  };
}
