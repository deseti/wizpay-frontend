import { useCallback, useMemo, useState } from "react";
import { type Hex } from "viem";
import {
  createRecipient,
  parseAmountToUnits,
  type RecipientDraft,
  type TokenSymbol,
} from "@/lib/wizpay";
import type { PreparedRecipient, StepState } from "@/lib/types";

function generateReferenceId() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `PAY-${dateStr}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function useWizPayState() {
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>("USDC");
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => [
    createRecipient("USDC"),
  ]);
  const [referenceId, setReferenceId] = useState<string>(generateReferenceId());
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [approvalState, setApprovalState] = useState<StepState>("idle");
  const [submitState, setSubmitState] = useState<StepState>("idle");
  const [approveTxHash, setApproveTxHash] = useState<Hex | null>(null);
  const [submitTxHash, setSubmitTxHash] = useState<Hex | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<Hex | null>(null);

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

  const importRecipients = useCallback((rows: RecipientDraft[]) => {
    setRecipients(rows);
    setErrors({});
  }, []);

  // Compute prepared recipients
  const preparedRecipients = useMemo<PreparedRecipient[]>(() => {
    return recipients.map((r) => {
      let isAddressClean = false;
      let units = 0n;

      if (r.address) {
        isAddressClean = /^0x[a-fA-F0-9]{40}$/.test(r.address.trim());
      }
      if (r.amount) {
        // USDC and EURC both use 6 decimals in our system
        units = parseAmountToUnits(r.amount, 6);
      }

      return {
        ...r,
        address: r.address.trim(),
        validAddress: isAddressClean,
        amountUnits: units,
      };
    });
  }, [recipients]);

  const validate = useCallback(() => {
    const nextErrors: Record<string, string> = {};

    // Auto-populate reference ID if empty instead of blocking submission
    if (!referenceId.trim()) {
      setReferenceId(generateReferenceId());
      // Don't add an error — we just fixed it
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
  }, [referenceId, preparedRecipients]);

  const resetComposer = useCallback(() => {
    setRecipients([createRecipient("USDC")]);
    setReferenceId(generateReferenceId());
    setErrors({});
    setApprovalState("idle");
    setSubmitState("idle");
    setApproveTxHash(null);
    setSubmitTxHash(null);
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const dismissSuccessModal = useCallback(() => {
    resetComposer();
  }, [resetComposer]);

  const copyHash = useCallback(async (hash: Hex | null) => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch (err) {
      console.error("Failed to copy hash:", err);
    }
  }, []);

  return {
    selectedToken,
    setSelectedToken,
    recipients,
    setRecipients, // useful if derived hooks need it
    preparedRecipients,
    referenceId,
    setReferenceId,
    errors,
    setErrors,
    clearFieldError,
    updateRecipient,
    addRecipient,
    removeRecipient,
    importRecipients,
    validate,
    resetComposer,
    dismissSuccessModal,
    approvalState,
    setApprovalState,
    submitState,
    setSubmitState,
    approveTxHash,
    setApproveTxHash,
    submitTxHash,
    setSubmitTxHash,
    statusMessage,
    setStatusMessage,
    errorMessage,
    setErrorMessage,
    copiedHash,
    copyHash,
  };
}
