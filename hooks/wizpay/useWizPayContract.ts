import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { type Address, type Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";

import { useToast } from "@/hooks/use-toast";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useTransactionExecutor } from "@/hooks/useTransactionExecutor";

import { WIZPAY_ABI, WIZPAY_BATCH_PAYMENT_ROUTED_EVENT } from "@/constants/abi";
import { WIZPAY_ADDRESS } from "@/constants/addresses";
import { ERC20_ABI } from "@/constants/erc20";
import {
  GAS_BUFFER_BPS,
  PREVIEW_SLIPPAGE_BPS,
  SUPPORTED_TOKENS,
  getFriendlyErrorMessage,
  parseAmountToUnits,
  sameAddress,
  type TokenSymbol,
} from "@/lib/wizpay";
import type { QuoteSummary, TransactionActionResult } from "@/lib/types";
import type { useWizPayState } from "./useWizPayState";
import {
  isStableFxMode,
  activeFxEngineAddress,
  fxProviderLabel,
  permit2Address,
} from "@/lib/fx-config";
import { executeFxTrade, getFxTradeStatus, getQuote } from "@/lib/fx-service";
import { arcTestnet } from "@/lib/wagmi";

type BaseState = ReturnType<typeof useWizPayState>;
type BatchSettlementLog = {
  transactionHash: Hex | null;
  args: {
    referenceId?: string;
  };
};

const POLL_INTERVAL_MS = 1500;
const MAX_CONFIRMATION_POLLS = 20;
const EMPTY_QUOTE_SUMMARY: QuoteSummary = {
  estimatedAmountsOut: [],
  totalEstimatedOut: 0n,
  totalFees: 0n,
};
const EMPTY_STABLEFX_PREVIEW = {
  quoteSummary: EMPTY_QUOTE_SUMMARY,
  diagnostics: [] as (string | null)[],
};

type StableFxPreviewData = typeof EMPTY_STABLEFX_PREVIEW;

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isStableFxAuthorizationError(error: unknown): boolean {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const message = rawMessage.toLowerCase();

  return (
    message.includes("stablefx api key") ||
    message.includes("not permitted to use stablefx") ||
    message.includes("missing_api_key") ||
    message.includes("401 unauthorized")
  );
}

export function useWizPayContract({
  state,
  batchAmount,
  validRecipientCount,
}: {
  state: BaseState;
  batchAmount: bigint;
  validRecipientCount: number;
}) {
  const { walletAddress } = useActiveWalletAddress();
  const { executeTransaction, signTypedData } = useTransactionExecutor();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { toast } = useToast();

  const activeToken = SUPPORTED_TOKENS[state.selectedToken];
  const allowanceSpender = isStableFxMode ? permit2Address : WIZPAY_ADDRESS;
  const deferredRecipients = useDeferredValue(state.preparedRecipients);
  const rawQuoteEnabled = Boolean(
    walletAddress &&
      state.preparedRecipients.length > 0 &&
      batchAmount > 0n &&
      state.preparedRecipients.every((r) => r.amountUnits > 0n)
  );

  const {
    data: currentAllowanceData,
    refetch: refetchAllowance,
    isLoading: allowanceQueryLoading,
  } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "allowance",
    args: walletAddress ? [walletAddress, allowanceSpender] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
  });

  const {
    data: currentBalanceData,
    refetch: refetchBalance,
    isLoading: balanceQueryLoading,
  } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
  });

  const { data: feeBpsData, isLoading: feeQueryLoading } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    chainId: arcTestnet.id,
    functionName: "feeBps",
    query: {
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  });

  useEffect(() => {
    refetchAllowance();
  }, [state.currentBatchNumber, refetchAllowance]);

  const { data: fxEngineData, isLoading: fxEngineQueryLoading } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    chainId: arcTestnet.id,
    functionName: "fxEngine",
    query: {
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  });

  // Batch Estimation
  const {
    data: rawQuoteData,
    isLoading: rawQuoteLoading,
    isFetching: rawQuoteFetching,
  } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    chainId: arcTestnet.id,
    functionName: "getBatchEstimatedOutputs",
    args: [
      activeToken.address,
      state.preparedRecipients.map((r) => SUPPORTED_TOKENS[r.targetToken].address),
      state.preparedRecipients.map((r) => r.amountUnits),
    ],
    query: {
      enabled: rawQuoteEnabled,
      refetchInterval: 12_000,
      staleTime: 12_000,
      placeholderData: keepPreviousData,
    },
  });

  // Liquidity Engine Balances
  // In StableFX mode, read balances from the FxEscrow contract directly.
  // In legacy mode, read from the on-chain fxEngine address.
  const USDC_A = SUPPORTED_TOKENS["USDC"].address;
  const EURC_A = SUPPORTED_TOKENS["EURC"].address;
  const engineAddressForBalances = isStableFxMode
    ? activeFxEngineAddress
    : (fxEngineData as Address | undefined);
  const {
    data: lBalancesData,
    refetch: refetchEngineBalances,
    isLoading: engineBalancesQueryLoading,
  } = useReadContracts({
    contracts: [
      {
        address: USDC_A,
        abi: ERC20_ABI,
        chainId: arcTestnet.id,
        functionName: "balanceOf",
        args: engineAddressForBalances ? [engineAddressForBalances] : undefined,
      },
      {
        address: EURC_A,
        abi: ERC20_ABI,
        chainId: arcTestnet.id,
        functionName: "balanceOf",
        args: engineAddressForBalances ? [engineAddressForBalances] : undefined,
      },
    ],
    query: {
      enabled: !!engineAddressForBalances,
      refetchInterval: 15_000,
      staleTime: 15_000,
      placeholderData: keepPreviousData,
    },
  });

  const currentAllowance = currentAllowanceData ?? 0n;
  const currentBalance = currentBalanceData ?? 0n;
  const approvalAmount = useMemo(() => {
    if (!isStableFxMode) {
      return batchAmount;
    }

    return state.preparedRecipients.reduce((totalAmount, recipient) => {
      const targetToken = SUPPORTED_TOKENS[recipient.targetToken];

      if (sameAddress(activeToken.address, targetToken.address)) {
        return totalAmount;
      }

      return totalAmount + recipient.amountUnits;
    }, 0n);
  }, [activeToken.address, batchAmount, state.preparedRecipients]);
  const stableFxPreviewQuery = useQuery({
    queryKey: [
      "wizpay",
      "stablefx-preview",
      activeToken.symbol,
      deferredRecipients.map((recipient) => ({
        address: recipient.address,
        amount: recipient.amount,
        targetToken: recipient.targetToken,
        validAddress: recipient.validAddress,
        amountUnits: recipient.amountUnits.toString(),
      })),
    ],
    enabled: isStableFxMode && deferredRecipients.length > 0,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StableFxPreviewData> => {
      const results = await Promise.all(
        deferredRecipients.map(async (recipient, index) => {
          const tokenOut = SUPPORTED_TOKENS[recipient.targetToken];

          if (!recipient.validAddress || recipient.amountUnits === 0n) {
            return {
              amountOut: 0n,
              feeAmount: 0n,
              diagnostic: null as string | null,
            };
          }

          if (sameAddress(activeToken.address, tokenOut.address)) {
            return {
              amountOut: recipient.amountUnits,
              feeAmount: 0n,
              diagnostic: null as string | null,
            };
          }

          try {
            const quote = await getQuote({
              sourceCurrency: activeToken.symbol,
              targetCurrency: recipient.targetToken,
              sourceAmount: recipient.amount,
            });

            if (!quote) {
              return {
                amountOut: 0n,
                feeAmount: 0n,
                diagnostic: `Circle quote is unavailable for row ${index + 1}.`,
              };
            }

            return {
              amountOut: parseAmountToUnits(quote.targetAmount, tokenOut.decimals),
              feeAmount: parseAmountToUnits(quote.feeAmount, tokenOut.decimals),
              diagnostic: null as string | null,
            };
          } catch (error) {
            const friendlyMessage = getFriendlyErrorMessage(error);

            return {
              amountOut: 0n,
              feeAmount: 0n,
              diagnostic: isStableFxAuthorizationError(error)
                ? friendlyMessage
                : `Circle quote failed for row ${index + 1}: ${friendlyMessage}`,
            };
          }
        })
      );

      return {
        quoteSummary: {
          estimatedAmountsOut: results.map((result) => result.amountOut),
          totalEstimatedOut: results.reduce(
            (total, result) => total + result.amountOut,
            0n
          ),
          totalFees: results.reduce(
            (total, result) => total + result.feeAmount,
            0n
          ),
        },
        diagnostics: results.map((result) => result.diagnostic),
      };
    },
  });

  const stableFxPreviewData =
    deferredRecipients.length === 0
      ? EMPTY_STABLEFX_PREVIEW
      : stableFxPreviewQuery.data ?? EMPTY_STABLEFX_PREVIEW;

  const engineBalances = useMemo<Record<TokenSymbol, bigint>>(() => {
    return {
      USDC: (lBalancesData?.[0].result as bigint | undefined) ?? 0n,
      EURC: (lBalancesData?.[1].result as bigint | undefined) ?? 0n,
    };
  }, [lBalancesData]);

  const quoteSummary = useMemo<QuoteSummary>(() => {
    if (isStableFxMode) {
      return {
        estimatedAmountsOut: state.preparedRecipients.map(
          (_, index) =>
            stableFxPreviewData.quoteSummary.estimatedAmountsOut[index] ?? 0n
        ),
        totalEstimatedOut: stableFxPreviewData.quoteSummary.totalEstimatedOut,
        totalFees: stableFxPreviewData.quoteSummary.totalFees,
      };
    }

    if (!rawQuoteData) {
      return EMPTY_QUOTE_SUMMARY;
    }
    return {
      estimatedAmountsOut: [...rawQuoteData[0]],
      totalEstimatedOut: rawQuoteData[1],
      totalFees: rawQuoteData[2],
    };
  }, [rawQuoteData, stableFxPreviewData, state.preparedRecipients]);

  const allowanceLoading = Boolean(walletAddress) && allowanceQueryLoading;
  const balanceLoading = Boolean(walletAddress) && balanceQueryLoading;
  const feeLoading = !isStableFxMode && feeQueryLoading;
  const engineLoading =
    Boolean(engineAddressForBalances) &&
    (engineBalancesQueryLoading || (!isStableFxMode && fxEngineQueryLoading));
  const quoteLoading = isStableFxMode
    ? deferredRecipients.length > 0 && stableFxPreviewQuery.isLoading
    : rawQuoteEnabled && rawQuoteLoading;
  const quoteRefreshing = isStableFxMode
    ? Boolean(stableFxPreviewQuery.isFetching && stableFxPreviewQuery.data)
    : Boolean(rawQuoteFetching && rawQuoteData);

  const feeBps = useMemo(() => {
    if (!isStableFxMode) {
      return feeBpsData ?? 0n;
    }

    if (batchAmount === 0n || quoteSummary.totalFees === 0n) {
      return 0n;
    }

    return (quoteSummary.totalFees * 10000n) / batchAmount;
  }, [batchAmount, feeBpsData, quoteSummary.totalFees]);

  const rowDiagnostics = useMemo<(string | null)[]>(() => {
    if (isStableFxMode) {
      return state.preparedRecipients.map(
        (_, index) => stableFxPreviewData.diagnostics[index] ?? null
      );
    }

    return state.preparedRecipients.map((recipient, i) => {
      const isCross = !sameAddress(
        SUPPORTED_TOKENS[state.selectedToken].address,
        SUPPORTED_TOKENS[recipient.targetToken].address
      );
      if (!isCross) return null;

      const estimatedOut = quoteSummary.estimatedAmountsOut[i] ?? 0n;
      const availableLiq = engineBalances[recipient.targetToken];

      if (estimatedOut > 0n && availableLiq < estimatedOut) {
        return `${recipient.targetToken} liquidity on StableFX is too low for this row.`;
      }
      return null;
    });
  }, [engineBalances, stableFxPreviewData.diagnostics, state.preparedRecipients, quoteSummary.estimatedAmountsOut, state.selectedToken]);

  const hasRouteIssue = rowDiagnostics.some(Boolean);
  const needsApproval = approvalAmount > 0n && currentAllowance < approvalAmount;
  const insufficientBalance = currentBalance < batchAmount;

  // Track gas for simulation manually
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);

  const waitForAllowanceUpdate = async ({
    txHash,
    targetAmount,
  }: {
    txHash: Hex | null;
    targetAmount: bigint;
  }) => {
    if (!publicClient) {
      throw new Error("Arc public client is not ready yet.");
    }

    if (txHash) {
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });
    }

    for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
      const result = await refetchAllowance();
      const nextAllowance = result.data ?? 0n;

      if (nextAllowance >= targetAmount) {
        return;
      }

      if (attempt < MAX_CONFIRMATION_POLLS - 1) {
        await waitFor(POLL_INTERVAL_MS);
      }
    }

    throw new Error(
      "Circle approval completed, but the token allowance did not update before the timeout window ended."
    );
  };

  const waitForBatchSettlement = async ({
    startBlock,
    txHash,
  }: {
    startBlock: bigint;
    txHash: Hex | null;
  }) => {
    if (!publicClient) {
      throw new Error("Arc public client is not ready yet.");
    }

    if (txHash) {
      try {
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
        });
        return txHash;
      } catch {
        // Fall through to the event watcher path when Circle does not expose a final tx hash consistently.
      }
    }

    for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
      const logsWithSender = walletAddress
        ? ((await publicClient.getLogs({
            address: WIZPAY_ADDRESS,
            event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
            args: { sender: walletAddress },
            fromBlock: startBlock,
          })) as BatchSettlementLog[])
        : [];
      const logsWithoutSender = (await publicClient.getLogs({
        address: WIZPAY_ADDRESS,
        event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
        fromBlock: startBlock,
      })) as BatchSettlementLog[];
      const candidateLogs =
        logsWithSender.length > 0 ? logsWithSender : logsWithoutSender;

      const matchedLog = candidateLogs.find(
        (log) =>
          Boolean(log.transactionHash) &&
          log.args.referenceId === state.referenceId.trim()
      );

      if (matchedLog?.transactionHash) {
        return matchedLog.transactionHash;
      }

      if (attempt < MAX_CONFIRMATION_POLLS - 1) {
        await waitFor(POLL_INTERVAL_MS);
      }
    }

    if (txHash) {
      return txHash;
    }

    throw new Error(
      "Circle reported the batch challenge complete, but no BatchPaymentRouted event was found before the timeout window ended."
    );
  };

  const requestApproval = async (
    approvalTarget: bigint
  ): Promise<TransactionActionResult> => {
    if (approvalTarget <= 0n) {
      return { ok: true, hash: null };
    }

    state.setApproveTxHash(null);
    state.setApprovalState("signing");
    state.setErrorMessage(null);
    state.setStatusMessage(
      isStableFxMode
        ? "Requesting Permit2 approval for Circle settlement..."
        : "Requesting token approval..."
    );

    if (!publicClient) {
      state.setApprovalState("idle");
      state.setErrorMessage("Arc public client is not ready yet.");
      state.setStatusMessage(null);
      return { ok: false, hash: null };
    }

    if (!walletAddress) {
      state.setApprovalState("idle");
      state.setErrorMessage(
        "Connect the active wallet before requesting approval."
      );
      state.setStatusMessage(null);
      return { ok: false, hash: null };
    }

    const referenceBase = state.referenceId.trim() || "WIZPAY";

    try {
      state.setStatusMessage("Submitting approval transaction...");

      const approvalResult = await executeTransaction({
        abi: ERC20_ABI,
        args: [allowanceSpender, approvalTarget],
        chainId: arcTestnet.id,
        contractAddress: activeToken.address,
        functionName: "approve",
        refId: `${referenceBase}-approve`,
      });

      if (approvalResult.txHash) {
        state.setApproveTxHash(approvalResult.txHash);
      }

      state.setApprovalState("confirming");
      state.setStatusMessage(
        approvalResult.txHash
          ? "Waiting for approval confirmation on Arc..."
          : "Waiting for approval allowance to update..."
      );

      await waitForAllowanceUpdate({
        txHash: approvalResult.txHash,
        targetAmount: approvalTarget,
      });

      state.setApprovalState("confirmed");
      state.setStatusMessage(
        "Approval confirmed! You can now submit the batch."
      );

      window.setTimeout(() => state.setStatusMessage(null), 3000);

      return {
        ok: true,
        hash: approvalResult.hash,
      };
    } catch (e: unknown) {
      state.setApprovalState("idle");
      state.setErrorMessage(getFriendlyErrorMessage(e));
      state.setStatusMessage(null);
      return { ok: false, hash: null };
    }
  };

  const handleApprove = async () => requestApproval(approvalAmount);

  const handleSubmit = async (): Promise<TransactionActionResult> => {
    if (!state.validate() || hasRouteIssue) {
      return { ok: false, hash: null };
    }
    if (batchAmount > currentBalance) {
      state.setErrorMessage("Insufficient token balance for this batch.");
      return { ok: false, hash: null };
    }

    state.setSubmitTxHash(null);

    if (isStableFxMode) {
      if (!publicClient) {
        state.setErrorMessage("Arc public client is not ready yet.");
        return { ok: false, hash: null };
      }

      if (!walletAddress) {
        state.setErrorMessage(
          "Connect the active wallet before settling through StableFX."
        );
        return { ok: false, hash: null };
      }

      state.setSubmitState("simulating");
      state.setErrorMessage(null);
      state.setStatusMessage("Preparing StableFX settlements...");
      setEstimatedGas(null);

      try {
        const totalDistributed: Record<TokenSymbol, bigint> = {
          USDC: 0n,
          EURC: 0n,
        };
        let settledRecipients = 0;
        let finalHash: string | null = null;

        for (let index = 0; index < state.preparedRecipients.length; index += 1) {
          const recipient = state.preparedRecipients[index];
          const targetToken = SUPPORTED_TOKENS[recipient.targetToken];

          if (sameAddress(activeToken.address, targetToken.address)) {
            state.setSubmitState("wallet");
            state.setStatusMessage(
              `Confirm transfer ${index + 1} of ${state.preparedRecipients.length}...`
            );

            const transferResult = await executeTransaction({
              abi: ERC20_ABI,
              args: [recipient.address as Address, recipient.amountUnits],
              chainId: arcTestnet.id,
              contractAddress: activeToken.address,
              functionName: "transfer",
              refId: `${state.referenceId.trim()}-${index + 1}-direct`,
            });

            state.setSubmitState("confirming");
            state.setSubmitTxHash(transferResult.hash);
            state.setStatusMessage(
              transferResult.txHash
                ? `Waiting for transfer ${index + 1} of ${state.preparedRecipients.length}...`
                : `Finalizing transfer ${index + 1} of ${state.preparedRecipients.length}...`
            );

            if (transferResult.txHash) {
              await publicClient.waitForTransactionReceipt({
                hash: transferResult.txHash,
                confirmations: 1,
              });
            }

            totalDistributed[recipient.targetToken] += recipient.amountUnits;
            settledRecipients += 1;
            finalHash = transferResult.hash;
            continue;
          }

          state.setStatusMessage(
            `Requesting Circle quote ${index + 1} of ${state.preparedRecipients.length}...`
          );

          const quote = await getQuote({
            sourceCurrency: activeToken.symbol,
            targetCurrency: recipient.targetToken,
            sourceAmount: recipient.amount,
            recipientAddress: recipient.address,
          });

          if (!quote?.typedData) {
            throw new Error(
              `Circle did not return tradable typed data for recipient ${index + 1}.`
            );
          }

          state.setSubmitState("wallet");
          state.setStatusMessage(
            `Sign permit ${index + 1} of ${state.preparedRecipients.length} in your wallet...`
          );

          const signature = await signTypedData({
            chainId: arcTestnet.id,
            memo: `${state.referenceId.trim()}-${index + 1}`,
            typedData: quote.typedData as unknown as Record<string, unknown>,
          });

          state.setSubmitState("confirming");
          state.setStatusMessage(
            `Submitting trade ${index + 1} of ${state.preparedRecipients.length}...`
          );

          const initialTrade = await executeFxTrade({
            quoteId: quote.quoteId,
            senderAddress: walletAddress!,
            signature,
            referenceId: `${state.referenceId.trim()}-${index + 1}`,
          });

          state.setSubmitTxHash(initialTrade.tradeId);
          finalHash = initialTrade.tradeId;

          let latestTrade = initialTrade;
          for (let attempt = 0; attempt < 20; attempt += 1) {
            if (latestTrade.status === "settled") break;
            if (latestTrade.status === "failed") {
              throw new Error(`Circle trade ${latestTrade.tradeId} failed.`);
            }

            state.setStatusMessage(
              `Waiting for Circle settlement ${index + 1} of ${state.preparedRecipients.length}...`
            );

            await new Promise((resolve) => window.setTimeout(resolve, 1500));
            latestTrade = await getFxTradeStatus(initialTrade.tradeId);
            finalHash = latestTrade.tradeId;
          }

          if (latestTrade.status !== "settled") {
            throw new Error(
              `Circle trade ${latestTrade.tradeId} did not settle before the timeout window ended.`
            );
          }

          totalDistributed[recipient.targetToken] += parseAmountToUnits(
            latestTrade.targetAmount,
            targetToken.decimals
          );
          settledRecipients += 1;
        }

        state.setSubmitState("confirmed");
        state.setStatusMessage(null);
        state.setSessionTotalAmount((prev) => prev + batchAmount);
        state.setSessionTotalRecipients((prev) => prev + settledRecipients);
        state.setSessionTotalDistributed((prev) => ({
          USDC: prev.USDC + totalDistributed.USDC,
          EURC: prev.EURC + totalDistributed.EURC,
        }));

        if (state.currentBatchNumber < state.totalBatches) {
          toast({
            title: "Circle settlement complete",
            description: `Batch ${state.currentBatchNumber} of ${state.totalBatches} settled through Circle StableFX.`,
          });
        }

        await Promise.all([
          refetchAllowance(),
          refetchBalance(),
          refetchEngineBalances(),
        ]);

        return { ok: true, hash: finalHash };
      } catch (err) {
        console.error(err);
        state.setSubmitState("idle");
        state.setErrorMessage(getFriendlyErrorMessage(err));
        state.setStatusMessage(null);
        setEstimatedGas(null);
        return { ok: false, hash: null };
      }
    }

    if (!publicClient) {
      state.setErrorMessage("Arc public client is not ready yet.");
      return { ok: false, hash: null };
    }

    if (!walletAddress) {
      state.setErrorMessage(
          "Connect the active wallet before submitting payroll."
      );
      return { ok: false, hash: null };
    }

    state.setSubmitState("simulating");
    state.setErrorMessage(null);
    state.setStatusMessage("Building and simulating transaction...");

    const recipientsArray = state.preparedRecipients.map((r) => r.address as Address);
    const amountsInArray = state.preparedRecipients.map((r) => r.amountUnits);
    const tokenOutsArray = state.preparedRecipients.map(
      (r) => SUPPORTED_TOKENS[r.targetToken].address
    );

    const minAmountsOutArray = state.preparedRecipients.map((r, i) => {
      const isCrossCurrency = !sameAddress(activeToken.address, tokenOutsArray[i]);
      if (!isCrossCurrency) {
        // exact match - account for system fee so it doesn't revert
        const feeBps = feeBpsData ?? 0n;
        const feeAmount = (r.amountUnits * feeBps) / 10000n;
        return r.amountUnits - feeAmount;
      }
      const projected = quoteSummary.estimatedAmountsOut[i] ?? 0n;
      // Subtract buffer
      return (projected * (10000n - PREVIEW_SLIPPAGE_BPS)) / 10000n;
    });

    try {
      const gasEstimate = await publicClient!.estimateContractGas({
        address: WIZPAY_ADDRESS,
        abi: WIZPAY_ABI,
        functionName: "batchRouteAndPay",
        account: walletAddress,
        args: [
          activeToken.address,
          tokenOutsArray,
          recipientsArray,
          amountsInArray,
          minAmountsOutArray,
          state.referenceId.trim(),
        ],
      });

      const bufferedGas = (gasEstimate * (10000n + GAS_BUFFER_BPS)) / 10000n;
      setEstimatedGas(bufferedGas);

      const referenceId = state.referenceId.trim();
      state.setSubmitState("wallet");
      state.setStatusMessage("Confirm the batch transaction in your wallet...");

      const executionResult = await executeTransaction({
        abi: WIZPAY_ABI,
        args: [
          activeToken.address,
          tokenOutsArray,
          recipientsArray,
          amountsInArray,
          minAmountsOutArray,
          referenceId,
        ],
        chainId: arcTestnet.id,
        contractAddress: WIZPAY_ADDRESS,
        functionName: "batchRouteAndPay",
        refId: referenceId,
      });

      state.setSubmitState("confirming");
      state.setSubmitTxHash(executionResult.hash);
      state.setStatusMessage(
        executionResult.txHash
          ? "Waiting for Arc confirmation..."
          : "Waiting for the payroll event to confirm on Arc..."
      );

      const confirmedHash = await waitForBatchSettlement({
        startBlock: executionResult.startBlock,
        txHash: executionResult.txHash,
      });

      state.setSubmitState("confirmed");
      state.setStatusMessage(null);
      state.setSubmitTxHash(confirmedHash ?? executionResult.hash);

      state.setSessionTotalAmount((prev) => prev + batchAmount);
      state.setSessionTotalRecipients((prev) => prev + validRecipientCount);
      state.setSessionTotalDistributed((prev) => {
        const next = { ...prev };
        state.preparedRecipients.forEach((r, i) => {
          const out = quoteSummary.estimatedAmountsOut[i] ?? 0n;
          next[r.targetToken] = (next[r.targetToken] || 0n) + out;
        });
        return next;
      });

      if (state.currentBatchNumber < state.totalBatches) {
        toast({
          title: "Batch Successful",
          description: `Batch ${state.currentBatchNumber} of ${state.totalBatches} completed! You can now proceed to the next block.`,
        });
      }
      
      // Auto refetching happens via history watcher generally, but we do one manual push to ensure UI refreshes immediately
      await Promise.all([
        refetchAllowance(),
        refetchBalance(),
        refetchEngineBalances()
      ]);

      return {
        ok: true,
        hash: confirmedHash ?? executionResult.hash,
      };

    } catch (err: unknown) {
      console.error(err);
      state.setSubmitState("idle");
      state.setErrorMessage(getFriendlyErrorMessage(err));
      state.setStatusMessage(null);
      setEstimatedGas(null);
      return { ok: false, hash: null };
    }
  };

  useEffect(() => {
    if (state.approvalState === "confirmed" && needsApproval) {
      state.setApprovalState("idle");
    }
  }, [state.approvalState, needsApproval, state]);

  return {
    activeToken,
    currentAllowance,
    currentBalance,
    feeBps,
    fxEngineData,
    engineBalances,
    quoteSummary,
    allowanceLoading,
    balanceLoading,
    feeLoading,
    engineLoading,
    quoteLoading,
    quoteRefreshing,
    rowDiagnostics,
    hasRouteIssue,
    needsApproval,
    insufficientBalance,
    handleApprove,
    handleSubmit,
    requestApproval,
    approvalAmount,
    estimatedGas,
    refetchAllowance,
    refetchBalance,
    refetchEngineBalances,
    /** Active FX mode metadata for UI display */
    fxMeta: {
      isStableFxMode,
      providerLabel: fxProviderLabel,
      engineAddress: isStableFxMode
        ? activeFxEngineAddress
        : (fxEngineData as Address | undefined),
    },
  };
}
