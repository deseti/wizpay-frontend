import { useCallback, useMemo, useState, useEffect } from "react";
import { type Hex } from "viem";
import {
  createRecipient,
  MAX_REFERENCE_ID_LENGTH,
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
  const [referenceId, setReferenceId] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [pendingBatches, setPendingBatches] = useState<RecipientDraft[][]>([]);
  const [currentBatchNumber, setCurrentBatchNumber] = useState<number>(1);
  const [totalBatches, setTotalBatches] = useState<number>(1);

  const [sessionTotalAmount, setSessionTotalAmount] = useState<bigint>(0n);
  const [sessionTotalRecipients, setSessionTotalRecipients] = useState<number>(0);
  const [sessionTotalDistributed, setSessionTotalDistributed] = useState<Record<TokenSymbol, bigint>>({ USDC: 0n, EURC: 0n });

  useEffect(() => {
    setReferenceId(generateReferenceId());
  }, []);
  
  const [approvalState, setApprovalState] = useState<StepState>("idle");
  const [submitState, setSubmitState] = useState<StepState>("idle");
  const [approveTxHash, setApproveTxHash] = useState<Hex | null>(null);
  const [submitTxHash, setSubmitTxHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

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
    setRecipients((current) => {
      if (current.length >= 50) return current;
      return [...current, createRecipient(selectedToken)];
    });
  }, [selectedToken]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients((current) => {
      if (current.length === 1) return current;
      return current.filter((r) => r.id !== id);
    });
  }, []);

  const importRecipients = useCallback((rows: RecipientDraft[]) => {
    if (rows.length > 50) {
      const chunks: RecipientDraft[][] = [];
      for (let i = 0; i < rows.length; i += 50) {
        chunks.push(rows.slice(i, i + 50));
      }
      setRecipients(chunks[0]);
      setPendingBatches(chunks.slice(1));
      setTotalBatches(chunks.length);
      setCurrentBatchNumber(1);
    } else {
      setRecipients(rows);
      setPendingBatches([]);
      setTotalBatches(1);
      setCurrentBatchNumber(1);
    }
    setErrors({});
    setSessionTotalAmount(0n);
    setSessionTotalRecipients(0);
    setSessionTotalDistributed({ USDC: 0n, EURC: 0n });
  }, []);

  const loadNextBatch = useCallback(() => {
    setPendingBatches((current) => {
      if (current.length === 0) return current;
      const [nextBatch, ...rest] = current;
      setRecipients(nextBatch);
      return rest;
    });

    setCurrentBatchNumber((prev) => prev + 1);

    setApprovalState("idle");
    setSubmitState("idle");
    setApproveTxHash(null);
    setSubmitTxHash(null);
    setStatusMessage(null);
    setErrorMessage(null);
    setErrors({});

    setReferenceId((prevId) => {
      if (!prevId) return generateReferenceId();
      const match = prevId.match(/(.*)-(\d+)$/);
      if (match) {
        return `${match[1]}-${parseInt(match[2], 10) + 1}`;
      }
      return `${prevId}-2`;
    });
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
    const trimmedReferenceId = referenceId.trim();

    if (!trimmedReferenceId) {
      nextErrors.referenceId = "Reference ID is required";
    } else if (trimmedReferenceId.length > MAX_REFERENCE_ID_LENGTH) {
      nextErrors.referenceId = `Reference ID must be ${MAX_REFERENCE_ID_LENGTH} characters or less`;
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
    setPendingBatches([]);
    setCurrentBatchNumber(1);
    setTotalBatches(1);
    setApprovalState("idle");
    setSubmitState("idle");
    setApproveTxHash(null);
    setSubmitTxHash(null);
    setStatusMessage(null);
    setErrorMessage(null);
    setSessionTotalAmount(0n);
    setSessionTotalRecipients(0);
    setSessionTotalDistributed({ USDC: 0n, EURC: 0n });
  }, []);

  const dismissSuccessModal = useCallback(() => {
    resetComposer();
  }, [resetComposer]);

  const copyHash = useCallback(async (hash: string | null) => {
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
    pendingBatches,
    currentBatchNumber,
    totalBatches,
    loadNextBatch,
    sessionTotalAmount,
    setSessionTotalAmount,
    sessionTotalRecipients,
    setSessionTotalRecipients,
    sessionTotalDistributed,
    setSessionTotalDistributed,
  };
}
