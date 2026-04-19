import { useCallback, useMemo } from "react";
import type { WizPayState } from "@/lib/types";

import { useWizPayState } from "./useWizPayState";
import { useWizPayContract } from "./useWizPayContract";
import { useWizPayHistory } from "./useWizPayHistory";
import { useBatchPayroll } from "./useBatchPayroll";
import { isStableFxMode } from "@/lib/fx-config";

export function useWizPay(): WizPayState {
  // 1. Initialize UI / Local State
  const state = useWizPayState();

  // 1a. Derived Batch values
  const batchAmount = useMemo(
    () =>
      state.preparedRecipients.reduce((sum, r) => sum + r.amountUnits, 0n),
    [state.preparedRecipients]
  );
  const validRecipientCount = useMemo(
    () => state.preparedRecipients.filter((r) => r.validAddress).length,
    [state.preparedRecipients]
  );

  // 2. Initialize Contract Interactions
  const contract = useWizPayContract({
    state,
    batchAmount,
    validRecipientCount,
  });

  const batchPayroll = useBatchPayroll({
    activeToken: contract.activeToken,
    approvalAmount: contract.approvalAmount,
    approveBatchAmount: contract.requestApproval,
    currentAllowance: contract.currentAllowance,
    currentBatchNumber: state.currentBatchNumber,
    loadNextBatch: state.loadNextBatch,
    recipients: state.recipients,
    pendingBatches: state.pendingBatches,
    refetchAllowance: contract.refetchAllowance,
    setStatusMessage: state.setStatusMessage,
    setErrorMessage: state.setErrorMessage,
    submitCurrentBatch: contract.handleSubmit,
    totalBatches: state.totalBatches,
  });

  // 3. Initialize History
  const history = useWizPayHistory({
    activeToken: contract.activeToken,
    refetchCb: () => {
      contract.refetchAllowance();
      contract.refetchBalance();
      contract.refetchEngineBalances();
    },
  });

  const isBusy =
    batchPayroll.isRunning ||
    state.approvalState === "signing" ||
    state.approvalState === "confirming" ||
    state.submitState === "simulating" ||
    state.submitState === "wallet" ||
    state.submitState === "confirming";

  const smartBatchButtonText = batchPayroll.isRunning
    ? batchPayroll.progress.label ?? "Sending..."
    : "Send";
  const estimatedSmartBatchConfirmations =
    state.totalBatches + (contract.needsApproval ? 1 : 0);
  const smartBatchHelperText = batchPayroll.isSupported
    ? state.totalBatches > 1
      ? `Click Send once to automatically run ${state.totalBatches} payroll batch settlements for ${batchPayroll.totalRecipients} recipients. Circle may still ask for up to ${estimatedSmartBatchConfirmations} confirmation${estimatedSmartBatchConfirmations === 1 ? "" : "s"}${contract.needsApproval ? `: 1 approval plus ${state.totalBatches} batch transactions.` : ` for ${state.totalBatches} batch transactions.`} WizPay is capped at 50 recipients per transaction, so larger drafts still settle as multiple on-chain batches.`
      : contract.needsApproval
        ? "Click Send once to automatically run the approval and the current payroll batch. Circle may still ask for 2 confirmations: 1 approval plus 1 batch settlement."
        : "Click Send once to automatically run the current payroll batch. Circle may still ask for 1 confirmation for settlement."
    : null;

  const resetComposer = useCallback(() => {
    batchPayroll.reset();
    state.resetComposer();
  }, [batchPayroll, state]);

  const dismissSuccessModal = useCallback(() => {
    batchPayroll.reset();
    state.dismissSuccessModal();
  }, [batchPayroll, state]);

  const primaryActionText =
    state.submitState === "simulating"
      ? isStableFxMode
        ? "Preparing Circle Trade..."
        : "Preparing Circle Challenge..."
      : state.submitState === "wallet"
        ? isStableFxMode
          ? "Sign Circle Permit..."
          : "Confirm in Circle..."
        : state.submitState === "confirming"
          ? isStableFxMode
            ? "Settling with Circle..."
            : "Waiting for Circle..."
          : state.submitState === "confirmed"
            ? isStableFxMode
              ? "Trades Settled"
              : "Batch Sent"
            : isStableFxMode
              ? "Settle with Circle"
              : "Send";

  const approvalText =
    state.approvalState === "signing"
      ? isStableFxMode
        ? "Approve in Wallet..."
        : "Approve in Circle..."
      : state.approvalState === "confirming"
        ? "Confirming Approval..."
        : state.approvalState === "confirmed" && !contract.needsApproval
          ? isStableFxMode
            ? "Permit2 Approved"
            : "Approval Confirmed"
          : isStableFxMode
            ? `Approve ${state.selectedToken} via Permit2`
            : `Approve ${state.selectedToken} via Circle`;

  // 4. Return unified state matching the previous monolithic footprint
  return {
    ...state,
    ...contract,
    ...history,
    batchAmount,
    validRecipientCount,
    isBusy,
    resetComposer,
    dismissSuccessModal,
    primaryActionText,
    approvalText,
    smartBatchAvailable: batchPayroll.isSupported,
    smartBatchRunning: batchPayroll.isRunning,
    smartBatchReason: batchPayroll.availabilityReason,
    smartBatchButtonText,
    smartBatchHelperText,
    smartBatchSubmissionHashes: batchPayroll.submissionHashes,
    handleSmartBatchSubmit: batchPayroll.execute,
  };
}
