"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isStableFxMode } from "@/lib/fx-config";

import {
  getFriendlyErrorMessage,
  parseAmountToUnits,
  type RecipientDraft,
  type TokenSymbol,
} from "@/lib/wizpay";
import type { TransactionActionResult } from "@/lib/types";

type BatchPayrollStage =
  | "idle"
  | "preparing"
  | "executing"
  | "success"
  | "error";

interface UseBatchPayrollOptions {
  activeToken: {
    symbol: TokenSymbol;
    decimals: number;
  };
  approvalAmount: bigint;
  approveBatchAmount: (amount: bigint) => Promise<TransactionActionResult>;
  currentAllowance: bigint;
  currentBatchNumber: number;
  recipients: RecipientDraft[];
  pendingBatches: RecipientDraft[][];
  loadNextBatch: () => void;
  refetchAllowance: () => Promise<unknown>;
  setStatusMessage: (message: string | null) => void;
  setErrorMessage: (message: string | null) => void;
  submitCurrentBatch: () => Promise<TransactionActionResult>;
  totalBatches: number;
}

interface BatchPayrollTotals {
  totalAmount: bigint;
  totalRecipients: number;
  totalDistributed: Record<TokenSymbol, bigint>;
}

interface BatchPayrollProgress {
  stage: BatchPayrollStage;
  label: string | null;
  currentBatch: number;
  totalBatches: number;
}

interface BatchPayrollResult extends BatchPayrollTotals {
  isSupported: boolean;
  availabilityReason: string | null;
  isRunning: boolean;
  isSuccess: boolean;
  progress: BatchPayrollProgress;
  approvalHash: string | null;
  lastHash: string | null;
  hashes: string[];
  submissionHashes: string[];
  execute: () => Promise<void>;
  reset: () => void;
}

const NEXT_BATCH_TIMEOUT_MS = 4000;
const NEXT_BATCH_POLL_MS = 50;

function normalizeBatches(
  currentRecipients: RecipientDraft[],
  pendingBatches: RecipientDraft[][]
) {
  return [currentRecipients, ...pendingBatches].filter(
    (batch) => batch.length > 0
  );
}

function calculateTotals(
  batches: RecipientDraft[][],
  decimals: number
): BatchPayrollTotals {
  const totalDistributed: Record<TokenSymbol, bigint> = {
    USDC: 0n,
    EURC: 0n,
  };
  let totalAmount = 0n;
  let totalRecipients = 0;

  for (const batch of batches) {
    for (const recipient of batch) {
      const amountUnits = parseAmountToUnits(recipient.amount, decimals);
      totalAmount += amountUnits;
      totalRecipients += 1;
      totalDistributed[recipient.targetToken] += amountUnits;
    }
  }

  return {
    totalAmount,
    totalRecipients,
    totalDistributed,
  };
}

function calculateApprovalRequirementForBatch(
  batch: RecipientDraft[],
  activeToken: UseBatchPayrollOptions["activeToken"]
) {
  if (isStableFxMode) {
    return batch.reduce((batchTotal, recipient) => {
      if (recipient.targetToken === activeToken.symbol) {
        return batchTotal;
      }

      return batchTotal + parseAmountToUnits(recipient.amount, activeToken.decimals);
    }, 0n);
  }

  return batch.reduce((batchTotal, recipient) => {
    return batchTotal + parseAmountToUnits(recipient.amount, activeToken.decimals);
  }, 0n);
}

function createIdleProgress(totalBatches: number): BatchPayrollProgress {
  return {
    stage: "idle",
    label: null,
    currentBatch: 0,
    totalBatches,
  };
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, NEXT_BATCH_POLL_MS);
    });
  }

  return false;
}

function getAllowanceFromRefetchResult(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    typeof result.data === "bigint"
  ) {
    return result.data;
  }

  return null;
}

export function useBatchPayroll({
  activeToken,
  approvalAmount,
  approveBatchAmount,
  currentAllowance,
  currentBatchNumber,
  loadNextBatch,
  recipients,
  pendingBatches,
  refetchAllowance,
  setStatusMessage,
  setErrorMessage,
  submitCurrentBatch,
  totalBatches,
}: UseBatchPayrollOptions): BatchPayrollResult {
  const batches = useMemo(
    () => normalizeBatches(recipients, pendingBatches),
    [pendingBatches, recipients]
  );
  const totals = useMemo(
    () => calculateTotals(batches, activeToken.decimals),
    [activeToken.decimals, batches]
  );
  const totalApprovalAmount = useMemo(() => {
    if (isStableFxMode) {
      return batches.reduce((totalAmount, batch) => {
        return (
          totalAmount +
          batch.reduce((batchTotal, recipient) => {
            if (recipient.targetToken === activeToken.symbol) {
              return batchTotal;
            }

            return (
              batchTotal +
              parseAmountToUnits(recipient.amount, activeToken.decimals)
            );
          }, 0n)
        );
      }, 0n)
    }

    return totals.totalAmount;
  }, [activeToken.decimals, activeToken.symbol, batches, totals.totalAmount]);
  const batchApprovalRequirements = useMemo(
    () => batches.map((batch) => calculateApprovalRequirementForBatch(batch, activeToken)),
    [activeToken, batches]
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState<BatchPayrollProgress>(() =>
    createIdleProgress(totalBatches)
  );
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [hashes, setHashes] = useState<string[]>([]);
  const [submissionHashes, setSubmissionHashes] = useState<string[]>([]);
  const latestStateRef = useRef({
    approvalAmount,
    approveBatchAmount,
    currentAllowance,
    currentBatchNumber,
    errorMessage: null as string | null,
    loadNextBatch,
    refetchAllowance,
    submitCurrentBatch,
    totalApprovalAmount,
    totalBatches,
  });

  useEffect(() => {
    latestStateRef.current = {
      approvalAmount,
      approveBatchAmount,
      currentAllowance,
      currentBatchNumber,
      errorMessage: null,
      loadNextBatch,
      refetchAllowance,
      submitCurrentBatch,
      totalApprovalAmount,
      totalBatches,
    };
  }, [
    approvalAmount,
    approveBatchAmount,
    currentAllowance,
    currentBatchNumber,
    loadNextBatch,
    refetchAllowance,
    submitCurrentBatch,
    totalApprovalAmount,
    totalBatches,
  ]);

  useEffect(() => {
    if (!isRunning && !isSuccess) {
      setProgress(createIdleProgress(totalBatches));
    }
  }, [isRunning, isSuccess, totalBatches]);

  const execute = useCallback(async () => {
    setIsRunning(true);
    setIsSuccess(false);
    setApprovalHash(null);
    setLastHash(null);
    setHashes([]);
    setSubmissionHashes([]);
    setStatusMessage(null);
    setErrorMessage(null);
    setProgress({
      stage: "preparing",
      label: "Preparing payroll...",
      currentBatch: latestStateRef.current.currentBatchNumber,
      totalBatches: latestStateRef.current.totalBatches,
    });

    try {
      const nextHashes: string[] = [];
      const nextSubmissionHashes: string[] = [];
      let trackedAllowance = latestStateRef.current.currentAllowance;
      let batchIndex = 0;
      const getRemainingApprovalRequirement = (startIndex: number) => {
        return batchApprovalRequirements
          .slice(startIndex)
          .reduce((totalAmount, amount) => totalAmount + amount, 0n);
      };
      const needsInitialApproval =
        latestStateRef.current.totalApprovalAmount > 0n &&
        trackedAllowance < latestStateRef.current.totalApprovalAmount;

      if (needsInitialApproval) {
        setProgress({
          stage: "preparing",
          label: "Approving payroll budget in Circle...",
          currentBatch: latestStateRef.current.currentBatchNumber,
          totalBatches: latestStateRef.current.totalBatches,
        });

        const approvalResult = await latestStateRef.current.approveBatchAmount(
          latestStateRef.current.totalApprovalAmount
        );

        if (!approvalResult.ok) {
          setProgress({
            stage: "error",
            label: "Approval did not complete.",
            currentBatch: latestStateRef.current.currentBatchNumber,
            totalBatches: latestStateRef.current.totalBatches,
          });
          return;
        }

        if (approvalResult.hash) {
          setApprovalHash((current) => current ?? approvalResult.hash);
          setLastHash(approvalResult.hash);
          nextHashes.push(approvalResult.hash);
        }

        const refreshedAllowance = await latestStateRef.current.refetchAllowance();
        trackedAllowance =
          getAllowanceFromRefetchResult(refreshedAllowance) ??
          latestStateRef.current.totalApprovalAmount;
      }

      while (true) {
        const activeBatchNumber = latestStateRef.current.currentBatchNumber;
        const activeTotalBatches = latestStateRef.current.totalBatches;
        const activeBatchApprovalRequirement =
          batchApprovalRequirements[batchIndex] ?? 0n;

        setProgress({
          stage: "executing",
          label: `Settling batch ${activeBatchNumber} of ${activeTotalBatches}...`,
          currentBatch: activeBatchNumber,
          totalBatches: activeTotalBatches,
        });

        const submitResult = await latestStateRef.current.submitCurrentBatch();

        if (!submitResult.ok) {
          setProgress({
            stage: "error",
            label: `Batch ${activeBatchNumber} did not complete.`,
            currentBatch: activeBatchNumber,
            totalBatches: activeTotalBatches,
          });
          return;
        }

        if (submitResult.hash) {
          setLastHash(submitResult.hash);
          nextHashes.push(submitResult.hash);
          nextSubmissionHashes.push(submitResult.hash);
        }

        trackedAllowance =
          trackedAllowance > activeBatchApprovalRequirement
            ? trackedAllowance - activeBatchApprovalRequirement
            : 0n;

        if (activeBatchNumber >= activeTotalBatches) {
          break;
        }

        latestStateRef.current.loadNextBatch();

        const didAdvance = await waitForCondition(
          () => latestStateRef.current.currentBatchNumber === activeBatchNumber + 1,
          NEXT_BATCH_TIMEOUT_MS
        );

        if (!didAdvance) {
          throw new Error(
            "The next payroll batch did not load before the timeout window ended."
          );
        }

        batchIndex += 1;

        const refreshedAllowance = await latestStateRef.current.refetchAllowance();
        trackedAllowance =
          getAllowanceFromRefetchResult(refreshedAllowance) ?? trackedAllowance;

        const remainingApprovalRequirement = getRemainingApprovalRequirement(batchIndex);

        const needsNextApproval =
          remainingApprovalRequirement > 0n &&
          trackedAllowance < remainingApprovalRequirement;

        if (needsNextApproval) {
          setProgress({
            stage: "preparing",
            label: `Refreshing approval for batch ${latestStateRef.current.currentBatchNumber}...`,
            currentBatch: latestStateRef.current.currentBatchNumber,
            totalBatches: latestStateRef.current.totalBatches,
          });

          const approvalResult = await latestStateRef.current.approveBatchAmount(
            remainingApprovalRequirement
          );

          if (!approvalResult.ok) {
            setProgress({
              stage: "error",
              label: `Approval for batch ${latestStateRef.current.currentBatchNumber} did not complete.`,
              currentBatch: latestStateRef.current.currentBatchNumber,
              totalBatches: latestStateRef.current.totalBatches,
            });
            return;
          }

          if (approvalResult.hash) {
            setApprovalHash((current) => current ?? approvalResult.hash);
            setLastHash(approvalResult.hash);
            nextHashes.push(approvalResult.hash);
          }

          const nextAllowance = await latestStateRef.current.refetchAllowance();
          trackedAllowance =
            getAllowanceFromRefetchResult(nextAllowance) ??
            remainingApprovalRequirement;
        }
      }

      setHashes(nextHashes);
      setSubmissionHashes(nextSubmissionHashes);
      setProgress({
        stage: "success",
        label:
          latestStateRef.current.totalBatches > 1
            ? "All payroll batches settled."
            : "Payroll batch settled.",
        currentBatch: latestStateRef.current.totalBatches,
        totalBatches: latestStateRef.current.totalBatches,
      });
      setStatusMessage(
        latestStateRef.current.totalBatches > 1
          ? "Payroll completed across every prepared batch."
          : "Payroll completed successfully."
      );
      setIsSuccess(true);
    } catch (error) {
      setProgress({
        stage: "error",
        label: "Payroll stopped before completion.",
        currentBatch: latestStateRef.current.currentBatchNumber,
        totalBatches: latestStateRef.current.totalBatches,
      });

      if (!latestStateRef.current.errorMessage) {
        setErrorMessage(getFriendlyErrorMessage(error));
      }
    } finally {
      setIsRunning(false);
    }
  }, [batchApprovalRequirements, setErrorMessage, setStatusMessage]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setIsSuccess(false);
    setApprovalHash(null);
    setLastHash(null);
    setHashes([]);
    setSubmissionHashes([]);
    setProgress(createIdleProgress(latestStateRef.current.totalBatches));
  }, []);

  return {
    ...totals,
    isSupported: true,
    availabilityReason: null,
    isRunning,
    isSuccess,
    progress,
    approvalHash,
    lastHash,
    hashes,
    submissionHashes,
    execute,
    reset,
  };
}
