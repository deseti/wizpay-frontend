"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";

import {
  WIZPAY_ABI,
  WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
} from "@/constants/abi";
import {
  WIZPAY_ADDRESS,
  WIZPAY_HISTORY_ADDRESSES,
  WIZPAY_HISTORY_FROM_BLOCK,
} from "@/constants/addresses";
import { ERC20_ABI } from "@/constants/erc20";
import {
  GAS_BUFFER_BPS,
  PREVIEW_SLIPPAGE_BPS,
  SUPPORTED_TOKENS,
  TOKEN_OPTIONS,
  createRecipient,
  formatTokenAmount,
  getFriendlyErrorMessage,
  parseAmountToUnits,
  sameAddress,
  type RecipientDraft,
  type TokenSymbol,
} from "@/lib/wizpay";
import type {
  HistoryItem,
  PreparedRecipient,
  QuoteSummary,
  StepState,
  WizPayState,
} from "@/lib/types";

const EMPTY_HISTORY: HistoryItem[] = [];

function generateReferenceId() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `PAY-${dateStr}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function useWizPay(): WizPayState {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address: walletAddress, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  /* ── local state ── */
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>("USDC");
  const [recipients, setRecipients] = useState<RecipientDraft[]>([
    createRecipient("USDC"),
    createRecipient("EURC"),
  ]);
  const [referenceId, setReferenceId] = useState(generateReferenceId());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [approvalState, setApprovalState] = useState<StepState>("idle");
  const [submitState, setSubmitState] = useState<StepState>("idle");
  const [approveTxHash, setApproveTxHash] = useState<Hex | null>(null);
  const [submitTxHash, setSubmitTxHash] = useState<Hex | null>(null);
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<Hex | null>(null);

  const activeToken = SUPPORTED_TOKENS[selectedToken];

  /* ── derived recipients ── */
  const preparedRecipients = useMemo<PreparedRecipient[]>(
    () =>
      recipients.map((recipient) => ({
        ...recipient,
        validAddress: isAddress(recipient.address),
        amountUnits: parseAmountToUnits(recipient.amount, activeToken.decimals),
      })),
    [activeToken.decimals, recipients]
  );

  const amountKey = useMemo(
    () => preparedRecipients.map((r) => r.amountUnits.toString()),
    [preparedRecipients]
  );

  const batchAmount = useMemo(
    () => preparedRecipients.reduce((t, r) => t + r.amountUnits, 0n),
    [preparedRecipients]
  );

  const validRecipientCount = useMemo(
    () =>
      preparedRecipients.filter((r) => r.validAddress && r.amountUnits > 0n)
        .length,
    [preparedRecipients]
  );

  /* ── contract reads ── */
  const { data: feeBpsData } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    functionName: "feeBps",
  });

  const { data: fxEngineData, refetch: refetchFxEngine } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    functionName: "fxEngine",
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: walletAddress ? [walletAddress, WIZPAY_ADDRESS] : undefined,
    query: { enabled: Boolean(walletAddress) },
  });

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: Boolean(walletAddress) },
  });

  const engineBalanceContracts = useMemo(
    () =>
      fxEngineData
        ? TOKEN_OPTIONS.map((token) => ({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "balanceOf" as const,
            args: [fxEngineData],
          }))
        : [],
    [fxEngineData]
  );

  const { data: engineBalanceData, refetch: refetchEngineBalances } =
    useReadContracts({
      contracts: engineBalanceContracts,
      query: { enabled: Boolean(fxEngineData) },
    });

  /* ── quotes ── */
  const quoteQuery = useQuery({
    queryKey: [
      "batch-quotes",
      WIZPAY_ADDRESS,
      activeToken.address,
      recipients.map((r) => r.targetToken).join(","),
      amountKey.join(","),
      String(feeBpsData ?? 0n),
    ],
    enabled:
      Boolean(publicClient) &&
      preparedRecipients.some((r) => r.amountUnits > 0n),
    queryFn: async (): Promise<QuoteSummary> => {
      const [estimatedAmountsOut, totalEstimatedOut, totalFees] =
        (await publicClient!.readContract({
          address: WIZPAY_ADDRESS,
          abi: WIZPAY_ABI,
          functionName: "getBatchEstimatedOutputs",
          args: [
            activeToken.address,
            recipients.map((r) => SUPPORTED_TOKENS[r.targetToken].address),
            preparedRecipients.map((r) => r.amountUnits),
          ],
        })) as readonly [readonly bigint[], bigint, bigint];

      return {
        estimatedAmountsOut: [...estimatedAmountsOut],
        totalEstimatedOut,
        totalFees,
      };
    },
  });

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

      for (const address of WIZPAY_HISTORY_ADDRESSES) {
        let from = WIZPAY_HISTORY_FROM_BLOCK;
        while (from <= currentBlock) {
          let to = from + CHUNK_SIZE;
          if (to > currentBlock) to = currentBlock;

          chunkPromises.push(
            publicClient!.getLogs({
              address,
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
            .filter(
              (bn): bn is bigint => Boolean(bn)
            )
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

  /* ── derived values ── */
  const currentAllowance = allowanceData ?? 0n;
  const currentBalance = balanceData ?? 0n;
  const feeBps = feeBpsData ?? 0n;
  const quoteSummary = quoteQuery.data ?? {
    estimatedAmountsOut: recipients.map(() => 0n),
    totalEstimatedOut: 0n,
    totalFees: 0n,
  };
  const approvalAmount = batchAmount;

  const engineBalances = useMemo<Record<TokenSymbol, bigint>>(
    () => ({
      USDC:
        (engineBalanceData?.[0]?.status === "success"
          ? (engineBalanceData[0].result as bigint)
          : 0n) ?? 0n,
      EURC:
        (engineBalanceData?.[1]?.status === "success"
          ? (engineBalanceData[1].result as bigint)
          : 0n) ?? 0n,
    }),
    [engineBalanceData]
  );

  const needsApproval = approvalAmount > 0n && currentAllowance < approvalAmount;
  const insufficientBalance =
    approvalAmount > 0n && currentBalance < approvalAmount;

  const rowDiagnostics = useMemo(
    () =>
      preparedRecipients.map((recipient, index) => {
        if (
          recipient.amountUnits === 0n ||
          recipient.targetToken === selectedToken
        ) {
          return null;
        }

        const estimate = quoteSummary.estimatedAmountsOut[index] ?? 0n;

        if (estimate === 0n) {
          return `No ${selectedToken} to ${recipient.targetToken} quote is available on MockFXEngine.`;
        }

        if (engineBalances[recipient.targetToken] < estimate) {
          return `${recipient.targetToken} liquidity on MockFXEngine is too low for this row.`;
        }

        return null;
      }),
    [engineBalances, preparedRecipients, quoteSummary.estimatedAmountsOut, selectedToken]
  );

  const hasRouteIssue = rowDiagnostics.some(Boolean);
  const history = historyQuery.data ?? EMPTY_HISTORY;

  const totalRouted = useMemo(
    () =>
      history.reduce((total, item) => {
        if (!sameAddress(item.tokenIn, activeToken.address)) return total;
        return total + item.totalAmountIn;
      }, 0n),
    [activeToken.address, history]
  );

  const isBusy =
    approvalState === "signing" ||
    approvalState === "confirming" ||
    submitState === "simulating" ||
    submitState === "wallet" ||
    submitState === "confirming";

  /* ── callbacks ── */
  const clearFieldError = useCallback((key: string) => {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const updateRecipient = useCallback(
    (id: string, field: keyof Omit<RecipientDraft, "id">, value: string) => {
      setRecipients((current) =>
        current.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );
      clearFieldError(`${id}-${field}`);
      setErrorMessage(null);
    },
    [clearFieldError]
  );

  const addRecipient = useCallback(() => {
    setRecipients((current) => [...current, createRecipient(selectedToken)]);
  }, [selectedToken]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients((current) => {
      if (current.length === 1) return current;
      return current.filter((r) => r.id !== id);
    });
  }, []);

  const validate = useCallback(() => {
    const nextErrors: Record<string, string> = {};

    if (!referenceId.trim()) {
      nextErrors.referenceId = "Reference ID is required";
    }

    preparedRecipients.forEach((r) => {
      if (!r.address.trim()) {
        nextErrors[`${r.id}-address`] = "Wallet address is required";
      } else if (!r.validAddress) {
        nextErrors[`${r.id}-address`] = "Invalid wallet address";
      }

      if (!r.amount.trim()) {
        nextErrors[`${r.id}-amount`] = "Amount is required";
      } else if (r.amountUnits === 0n) {
        nextErrors[`${r.id}-amount`] = "Enter a valid amount";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [preparedRecipients, referenceId]);

  const resetComposer = useCallback(() => {
    setRecipients([
      createRecipient(selectedToken),
      createRecipient(selectedToken === "USDC" ? "EURC" : "USDC"),
    ]);
    setReferenceId(generateReferenceId());
    setErrors({});
    setApprovalState("idle");
    setSubmitState("idle");
    setApproveTxHash(null);
    setSubmitTxHash(null);
    setEstimatedGas(null);
    setStatusMessage(null);
    setErrorMessage(null);
  }, [selectedToken]);

  const copyHash = useCallback(async (hash: Hex | null) => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    window.setTimeout(() => {
      setCopiedHash((c) => (c === hash ? null : c));
    }, 1600);
  }, []);

  /* ── approve ── */
  const handleApprove = useCallback(async () => {
    if (!walletAddress || !publicClient) return;
    if (!validate()) return;

    if (approvalAmount === 0n) {
      setErrorMessage("Add at least one recipient amount before approving.");
      return;
    }

    try {
      setErrorMessage(null);
      setStatusMessage(
        `Requesting ${selectedToken} approval for the gross batch amount...`
      );
      setApprovalState("signing");

      const hash = await writeContractAsync({
        address: activeToken.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [WIZPAY_ADDRESS, approvalAmount],
      });

      setApproveTxHash(hash);
      setApprovalState("confirming");
      setStatusMessage("Approval submitted. Waiting for blockchain confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Approval transaction reverted.");
      }

      await refetchAllowance();
      setApprovalState("confirmed");
      setStatusMessage("Allowance confirmed on-chain. You can submit the batch now.");
    } catch (error) {
      setApprovalState("idle");
      setStatusMessage(null);
      setErrorMessage(getFriendlyErrorMessage(error));
    }
  }, [
    activeToken.address,
    approvalAmount,
    publicClient,
    refetchAllowance,
    selectedToken,
    validate,
    walletAddress,
    writeContractAsync,
  ]);

  /* ── submit ── */
  const handleSubmit = useCallback(async () => {
    if (!walletAddress || !publicClient) return;
    if (!validate()) return;

    if (needsApproval) {
      setErrorMessage(
        "Insufficient allowance. Confirm the approval transaction first."
      );
      return;
    }

    if (insufficientBalance) {
      setErrorMessage(`Insufficient ${selectedToken} balance for this batch.`);
      return;
    }

    if (hasRouteIssue) {
      setErrorMessage(
        "At least one recipient route is unavailable or lacks liquidity."
      );
      return;
    }

    const recipientsPayload = preparedRecipients.map((r) => r.address as Address);
    const tokenOutPayload = recipients.map(
      (r) => SUPPORTED_TOKENS[r.targetToken].address
    );
    const amountsPayload = preparedRecipients.map((r) => r.amountUnits);
    const minAmountsOutPayload = quoteSummary.estimatedAmountsOut.map((est) =>
      est > 0n ? est - (est * PREVIEW_SLIPPAGE_BPS) / 10000n : 0n
    );

    try {
      setErrorMessage(null);
      setEstimatedGas(null);
      setSubmitState("simulating");
      setStatusMessage("Running contract simulation and gas estimation...");

      const simulation = await publicClient.simulateContract({
        account: walletAddress,
        address: WIZPAY_ADDRESS,
        abi: WIZPAY_ABI,
        functionName: "batchRouteAndPay",
        args: [
          activeToken.address,
          tokenOutPayload,
          recipientsPayload,
          amountsPayload,
          minAmountsOutPayload,
          referenceId.trim(),
        ],
      });

      const gas = await publicClient.estimateContractGas(simulation.request);
      const gasWithBuffer = gas + (gas * GAS_BUFFER_BPS) / 10000n;

      setEstimatedGas(gasWithBuffer);
      setSubmitState("wallet");
      setStatusMessage(
        "Simulation passed. Confirm the batch transaction in your wallet."
      );

      const hash = await writeContractAsync({
        ...simulation.request,
        gas: gasWithBuffer,
      });

      setSubmitTxHash(hash);
      setSubmitState("confirming");
      setStatusMessage("Batch submitted. Waiting for on-chain confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== "success") {
        throw new Error("Batch transaction reverted.");
      }

      await Promise.all([
        refetchAllowance(),
        refetchBalance(),
        refetchEngineBalances(),
        refetchFxEngine(),
        historyQuery.refetch(),
        quoteQuery.refetch(),
      ]);

      setSubmitState("confirmed");
      setStatusMessage("Batch routed successfully on Arc Testnet.");
    } catch (error) {
      setSubmitState("idle");
      setEstimatedGas(null);
      setStatusMessage(null);
      setErrorMessage(getFriendlyErrorMessage(error));
    }
  }, [
    activeToken.address,
    hasRouteIssue,
    historyQuery,
    insufficientBalance,
    needsApproval,
    preparedRecipients,
    publicClient,
    quoteQuery,
    quoteSummary.estimatedAmountsOut,
    recipients,
    referenceId,
    refetchAllowance,
    refetchBalance,
    refetchEngineBalances,
    refetchFxEngine,
    selectedToken,
    validate,
    walletAddress,
    writeContractAsync,
  ]);

  /* ── event watcher ── */
  useWatchContractEvent({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    eventName: "BatchPaymentRouted",
    args: walletAddress ? { sender: walletAddress } : undefined,
    enabled: Boolean(walletAddress),
    onLogs: () => {
      queryClient.invalidateQueries({ queryKey: ["wizpay-history"] });
      refetchAllowance();
      refetchBalance();
      refetchEngineBalances();
    },
  });

  useEffect(() => {
    if (approvalState === "confirmed" && needsApproval) {
      setApprovalState("idle");
    }
  }, [approvalState, needsApproval]);

  /* ── derived text ── */
  const primaryActionText =
    submitState === "simulating"
      ? "Simulating..."
      : submitState === "wallet"
        ? "Confirm in Wallet..."
        : submitState === "confirming"
          ? "Submitting..."
          : submitState === "confirmed"
            ? "Batch Sent"
            : "Submit Batch";

  const approvalText =
    approvalState === "signing"
      ? "Approve in Wallet..."
      : approvalState === "confirming"
        ? "Confirming Approval..."
        : approvalState === "confirmed" && !needsApproval
          ? "Approval Confirmed"
          : `Approve ${selectedToken}`;

  return {
    selectedToken,
    setSelectedToken,
    activeToken,
    recipients,
    preparedRecipients,
    addRecipient,
    removeRecipient,
    updateRecipient,
    referenceId,
    setReferenceId,
    errors,
    clearFieldError,
    batchAmount,
    validRecipientCount,
    currentAllowance,
    currentBalance,
    feeBps,
    fxEngineData,
    engineBalances,
    quoteSummary,
    rowDiagnostics,
    hasRouteIssue,
    needsApproval,
    insufficientBalance,
    history,
    historyLoading: historyQuery.isLoading,
    totalRouted,
    approvalState,
    submitState,
    approveTxHash,
    submitTxHash,
    estimatedGas,
    statusMessage,
    errorMessage,
    isBusy,
    handleApprove,
    handleSubmit,
    resetComposer,
    dismissSuccessModal: () => setSubmitState("idle"),
    setStatusMessage,
    setErrorMessage,
    copiedHash,
    copyHash,
    primaryActionText,
    approvalText,
  };
}
