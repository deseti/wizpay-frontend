import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";

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
} from "@/constants/addresses";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { activeFxEngineAddress } from "@/lib/fx-config";
import { arcTestnet } from "@/lib/wagmi";
import { sameAddress } from "@/lib/wizpay";
import type { HistoryItem, UnifiedHistoryItem } from "@/lib/types";

interface BatchHistoryLog {
  address: Address;
  transactionHash: Hex | null;
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

interface LiquidityAddedLog {
  transactionHash: Hex | null;
  blockNumber: bigint | null;
  args: {
    token?: Address;
    amountIn?: bigint;
    sharesMinted?: bigint;
  };
}

interface LiquidityRemovedLog {
  transactionHash: Hex | null;
  blockNumber: bigint | null;
  args: {
    token?: Address;
    amountOut?: bigint;
    sharesBurned?: bigint;
  };
}

export function useWizPayHistory({
  activeToken,
  refetchCb
}: {
  activeToken: { address: Address };
  refetchCb: () => void;
}) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { walletAddress } = useActiveWalletAddress();

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
      const chunkPromises: Promise<BatchHistoryLog[]>[] = [];

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
            }) as Promise<BatchHistoryLog[]>
          );
          from = to + 1n;
        }
      }

      const historyLogs = (await Promise.all(chunkPromises)).flat();

      const uniqueBlockNumbers = Array.from(
        new Set(
          historyLogs
            .map((log) => log.blockNumber)
            .filter((blockNumber): blockNumber is bigint => Boolean(blockNumber))
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
        .map((log): HistoryItem | null => {
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
            contractAddress: log.address,
            tokenIn: log.args.tokenIn,
            tokenOut: log.args.tokenOut,
            totalAmountIn: log.args.totalAmountIn,
            totalAmountOut: log.args.totalAmountOut,
            totalFees: log.args.totalFees,
            recipientCount: Number(log.args.recipientCount),
            referenceId: log.args.referenceId,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestampMs:
              blockTimestampMap.get(log.blockNumber.toString()) ?? 0,
          };
        })
        .filter((item): item is HistoryItem => item !== null)
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
      activeFxEngineAddress, // Uses FxEscrow in stablefx mode, adapter in legacy
    ],
    enabled: Boolean(publicClient && walletAddress),
    queryFn: async (): Promise<UnifiedHistoryItem[]> => {
      const currentBlock = await publicClient!.getBlockNumber();
      const CHUNK_SIZE = 9999n;
      const addedPromises: Promise<LiquidityAddedLog[]>[] = [];
      const removedPromises: Promise<LiquidityRemovedLog[]>[] = [];

      let from = WIZPAY_HISTORY_FROM_BLOCK;
      while (from <= currentBlock) {
        let to = from + CHUNK_SIZE;
        if (to > currentBlock) to = currentBlock;

        addedPromises.push(
          publicClient!.getLogs({
            address: activeFxEngineAddress,
            event: LIQUIDITY_ADDED_EVENT,
            fromBlock: from,
            toBlock: to,
          }) as Promise<LiquidityAddedLog[]>
        );
        removedPromises.push(
          publicClient!.getLogs({
            address: activeFxEngineAddress,
            event: LIQUIDITY_REMOVED_EVENT,
            fromBlock: from,
            toBlock: to,
          }) as Promise<LiquidityRemovedLog[]>
        );
        from = to + 1n;
      }

      const [addedLogsRaw, removedLogsRaw] = await Promise.all([
        Promise.all(addedPromises).then((r) => r.flat()),
        Promise.all(removedPromises).then((r) => r.flat()),
      ]);

      // Filter by transaction sender — LP events lack an indexed user param
      const userAddr = walletAddress!.toLowerCase();
      const filterByTxSender = async <T extends { transactionHash: Hex | null }>(
        logs: T[]
      ): Promise<T[]> => {
        if (logs.length === 0) return [];
        const txHashes = Array.from(
          new Set(
            logs
              .map((log) => log.transactionHash)
              .filter((hash): hash is Hex => Boolean(hash))
          )
        );
        const txReceipts = await Promise.all(
          txHashes.map(async (hash) => {
            const receipt = await publicClient!.getTransactionReceipt({ hash: hash as Hex });
            return [hash, receipt.from.toLowerCase()] as const;
          })
        );
        const senderMap = new Map(txReceipts);
        return logs.filter(
          (log) =>
            Boolean(log.transactionHash) &&
            senderMap.get(log.transactionHash as Hex) === userAddr
        );
      };

      const [addedLogs, removedLogs] = await Promise.all([
        filterByTxSender(addedLogsRaw),
        filterByTxSender(removedLogsRaw),
      ]);

      const allLogs = [...addedLogs, ...removedLogs];
      if (allLogs.length === 0) return [];

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

      const added = addedLogs
        .map((log): UnifiedHistoryItem | null => {
          if (
            !log.transactionHash ||
            !log.blockNumber ||
            !log.args.token ||
            log.args.amountIn === undefined ||
            log.args.sharesMinted === undefined
          ) {
            return null;
          }

          return {
            type: "add_lp",
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestampMs: blockTs.get(log.blockNumber.toString()) ?? 0,
            lpToken: log.args.token,
            lpAmount: log.args.amountIn,
            lpShares: log.args.sharesMinted,
          };
        })
        .filter((item): item is UnifiedHistoryItem => item !== null);

      const removed = removedLogs
        .map((log): UnifiedHistoryItem | null => {
          if (
            !log.transactionHash ||
            !log.blockNumber ||
            !log.args.token ||
            log.args.amountOut === undefined ||
            log.args.sharesBurned === undefined
          ) {
            return null;
          }

          return {
            type: "remove_lp",
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestampMs: blockTs.get(log.blockNumber.toString()) ?? 0,
            lpToken: log.args.token,
            lpAmount: log.args.amountOut,
            lpShares: log.args.sharesBurned,
          };
        })
        .filter((item): item is UnifiedHistoryItem => item !== null);

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

  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const lpHistory = useMemo(
    () => lpHistoryQuery.data ?? [],
    [lpHistoryQuery.data]
  );

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
    return [...payrollItems, ...lpHistory].sort(
      (a, b) => Number(b.blockNumber - a.blockNumber)
    );
  }, [history, lpHistory]);

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
