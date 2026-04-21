"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";

import {
  WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
} from "@/constants/abi";
import {
  WIZPAY_HISTORY_ADDRESSES,
  WIZPAY_HISTORY_FROM_BLOCK,
} from "@/constants/addresses";
import { TOKEN_BY_ADDRESS } from "@/constants/erc20";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import type { EmployeePayment } from "@/lib/dashboard-utils";
import { arcTestnet } from "@/lib/wagmi";

/**
 * Fetches BatchPaymentRouted events, then inspects Transfer events in each
 * batch transaction to identify individual employee-level payments.
 *
 * Falls back to distributing batch totals evenly if individual transfers
 * cannot be resolved (e.g. if the RPC doesn't return receipt logs easily).
 */
export function useEmployeePayments() {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { walletAddress } = useActiveWalletAddress();

  const query = useQuery({
    queryKey: [
      "employee-payments",
      walletAddress ?? "disconnected",
      WIZPAY_HISTORY_ADDRESSES.join(","),
    ],
    enabled: Boolean(publicClient && walletAddress),
    staleTime: 60_000,
    queryFn: async (): Promise<EmployeePayment[]> => {
      const currentBlock = await publicClient!.getBlockNumber();
      const CHUNK_SIZE = 9999n;
      const payments: EmployeePayment[] = [];

      // Fetch all BatchPaymentRouted logs for the connected wallet
      for (const contractAddr of WIZPAY_HISTORY_ADDRESSES) {
        let from = WIZPAY_HISTORY_FROM_BLOCK;
        while (from <= currentBlock) {
          let to = from + CHUNK_SIZE;
          if (to > currentBlock) to = currentBlock;

          const logs = await publicClient!.getLogs({
            address: contractAddr,
            event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
            args: { sender: walletAddress as Address },
            fromBlock: from,
            toBlock: to,
          });

          // For each batch event, get the transaction receipt and parse Transfer events
          for (const log of logs) {
            const txHash = log.transactionHash as Hex;
            const blockNumber = log.blockNumber as bigint;

            // Get block timestamp
            let timestampMs = 0;
            try {
              const block = await publicClient!.getBlock({ blockNumber });
              timestampMs = Number(block.timestamp) * 1000;
            } catch {
              timestampMs = Date.now();
            }

            // Try to extract individual Transfer events from the receipt
            try {
              const receipt = await publicClient!.getTransactionReceipt({
                hash: txHash,
              });

              // The ERC-20 Transfer event topic
              const transferTopic =
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

              // Parse Transfer events that represent payments to recipients
              // (from the WizPay contract to individual addresses)
              const contractAddrPadded = `0x000000000000000000000000${contractAddr.slice(2).toLowerCase()}`;

              for (const tl of receipt.logs) {
                if (tl.topics[0] !== transferTopic) continue;
                // Transfer FROM the contract TO a recipient
                if (tl.topics[1]?.toLowerCase() !== contractAddrPadded) continue;

                const recipientPadded = tl.topics[2];
                if (!recipientPadded) continue;

                const employee = `0x${recipientPadded.slice(-40)}` as Address;
                const amount = BigInt(tl.data);
                const tokenAddress = tl.address.toLowerCase();
                const token = TOKEN_BY_ADDRESS.get(tokenAddress);

                payments.push({
                  date: timestampMs,
                  employee,
                  status: "Confirmed",
                  amount,
                  tokenSymbol: token?.symbol ?? "???",
                  tokenDecimals: token?.decimals ?? 6,
                  txHash,
                });
              }
            } catch {
              // Fallback: create a single aggregate entry from the batch event
              const tokenIn = log.args.tokenIn as Address;
              const token = TOKEN_BY_ADDRESS.get(tokenIn.toLowerCase());

              payments.push({
                date: timestampMs,
                employee: "Multiple Recipients",
                status: "Confirmed",
                amount: log.args.totalAmountOut as bigint,
                tokenSymbol: token?.symbol ?? "???",
                tokenDecimals: token?.decimals ?? 6,
                txHash,
              });
            }
          }

          from = to + 1n;
        }
      }

      // Sort by date descending
      return payments.sort((a, b) => b.date - a.date);
    },
  });

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
