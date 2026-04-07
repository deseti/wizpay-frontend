import { useMemo } from "react";
import type { WizPayState } from "@/lib/types";

import { useWizPayState } from "./useWizPayState";
import { useWizPayContract } from "./useWizPayContract";
import { useWizPayHistory } from "./useWizPayHistory";

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
    state.approvalState === "signing" ||
    state.approvalState === "confirming" ||
    state.submitState === "simulating" ||
    state.submitState === "wallet" ||
    state.submitState === "confirming";

  const primaryActionText =
    state.submitState === "simulating"
      ? "Simulating..."
      : state.submitState === "wallet"
        ? "Confirm in Wallet..."
        : state.submitState === "confirming"
          ? "Submitting..."
          : state.submitState === "confirmed"
            ? "Batch Sent"
            : "Submit Batch";

  const approvalText =
    state.approvalState === "signing"
      ? "Approve in Wallet..."
      : state.approvalState === "confirming"
        ? "Confirming Approval..."
        : state.approvalState === "confirmed" && !contract.needsApproval
          ? "Approval Confirmed"
          : `Approve ${state.selectedToken}`;

  // 4. Return unified state matching the previous monolithic footprint
  return {
    ...state,
    ...contract,
    ...history,
    batchAmount,
    validRecipientCount,
    isBusy,
    primaryActionText,
    approvalText,
  };
}
