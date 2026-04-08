import { useEffect, useMemo, useState } from "react";
import { type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";

import { useToast } from "@/hooks/use-toast";

import { WIZPAY_ABI } from "@/constants/abi";
import { WIZPAY_ADDRESS } from "@/constants/addresses";
import { ERC20_ABI } from "@/constants/erc20";
import {
  GAS_BUFFER_BPS,
  PREVIEW_SLIPPAGE_BPS,
  SUPPORTED_TOKENS,
  getFriendlyErrorMessage,
  sameAddress,
  type TokenSymbol,
} from "@/lib/wizpay";
import type { PreparedRecipient, QuoteSummary, WizPayState } from "@/lib/types";
import type { useWizPayState } from "./useWizPayState";

type BaseState = ReturnType<typeof useWizPayState>;

export function useWizPayContract({
  state,
  batchAmount,
  validRecipientCount,
}: {
  state: BaseState;
  batchAmount: bigint;
  validRecipientCount: number;
}) {
  const { address: walletAddress } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const activeToken = SUPPORTED_TOKENS[state.selectedToken];

  const { data: currentAllowanceData, refetch: refetchAllowance } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: walletAddress ? [walletAddress, WIZPAY_ADDRESS] : undefined,
    query: { enabled: !!walletAddress },
  });

  const { data: currentBalanceData, refetch: refetchBalance } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  });

  const { data: feeBpsData } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    functionName: "feeBps",
  });

  useEffect(() => {
    refetchAllowance();
  }, [state.currentBatchNumber, refetchAllowance]);

  const { data: fxEngineData } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    functionName: "fxEngine",
  });

  // Batch Estimation
  const { data: rawQuoteData } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    functionName: "getBatchEstimatedOutputs",
    args: [
      activeToken.address,
      state.preparedRecipients.map((r) => SUPPORTED_TOKENS[r.targetToken].address),
      state.preparedRecipients.map((r) => r.amountUnits),
    ],
    query: {
      enabled: Boolean(
        walletAddress &&
          state.preparedRecipients.length > 0 &&
          batchAmount > 0n &&
          state.preparedRecipients.every((r) => r.amountUnits > 0n)
      ),
      refetchInterval: 12000,
    },
  });

  // Liquidity Engine Balances
  const USDC_A = SUPPORTED_TOKENS["USDC"].address;
  const EURC_A = SUPPORTED_TOKENS["EURC"].address;
  const { data: lBalancesData, refetch: refetchEngineBalances } = useReadContracts({
    contracts: [
      {
        address: USDC_A,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: fxEngineData ? [fxEngineData as Address] : undefined,
      },
      {
        address: EURC_A,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: fxEngineData ? [fxEngineData as Address] : undefined,
      },
    ],
    query: { enabled: !!fxEngineData, refetchInterval: 15000 },
  });

  const currentAllowance = currentAllowanceData ?? 0n;
  const currentBalance = currentBalanceData ?? 0n;
  const feeBps = feeBpsData ?? 0n;

  const engineBalances = useMemo<Record<TokenSymbol, bigint>>(() => {
    return {
      USDC: (lBalancesData?.[0].result as bigint | undefined) ?? 0n,
      EURC: (lBalancesData?.[1].result as bigint | undefined) ?? 0n,
    };
  }, [lBalancesData]);

  const quoteSummary = useMemo<QuoteSummary>(() => {
    if (!rawQuoteData) {
      return {
        estimatedAmountsOut: state.preparedRecipients.map(() => 0n),
        totalEstimatedOut: 0n,
        totalFees: 0n,
      };
    }
    return {
      estimatedAmountsOut: [...rawQuoteData[0]],
      totalEstimatedOut: rawQuoteData[1],
      totalFees: rawQuoteData[2],
    };
  }, [rawQuoteData, state.preparedRecipients]);

  const rowDiagnostics = useMemo<(string | null)[]>(() => {
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
  }, [engineBalances, state.preparedRecipients, quoteSummary.estimatedAmountsOut, state.selectedToken]);

  const hasRouteIssue = rowDiagnostics.some(Boolean);
  const needsApproval = currentAllowance < batchAmount;
  const insufficientBalance = currentBalance < batchAmount;

  // Track gas for simulation manually
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);

  const handleApprove = async () => {
    if (batchAmount <= 0n) return;

    state.setApprovalState("signing");
    state.setErrorMessage(null);
    state.setStatusMessage("Requesting token approval...");

    try {
      const hash = await writeContractAsync({
        address: activeToken.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [WIZPAY_ADDRESS, batchAmount],
      });

      state.setApprovalState("confirming");
      state.setApproveTxHash(hash);
      state.setStatusMessage("Waiting for approval confirmation...");

      await publicClient!.waitForTransactionReceipt({ hash, confirmations: 1 });
      await refetchAllowance();

      state.setApprovalState("confirmed");
      state.setStatusMessage("Approval confirmed! You can now submit the batch.");
      
      // Auto-clear success message eventually
      setTimeout(() => state.setStatusMessage(null), 3000);
    } catch (e: any) {
      state.setApprovalState("idle");
      state.setErrorMessage(getFriendlyErrorMessage(e));
      state.setStatusMessage(null);
    }
  };

  const handleSubmit = async () => {
    if (!state.validate() || hasRouteIssue) return;
    if (batchAmount > currentBalance) {
      state.setErrorMessage("Insufficient token balance for this batch.");
      return;
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

      state.setSubmitState("wallet");
      state.setStatusMessage("Please confirm the batch transaction in your wallet.");

      const hash = await writeContractAsync({
        address: WIZPAY_ADDRESS,
        abi: WIZPAY_ABI,
        functionName: "batchRouteAndPay",
        args: [
          activeToken.address,
          tokenOutsArray,
          recipientsArray,
          amountsInArray,
          minAmountsOutArray,
          state.referenceId.trim(),
        ],
        gas: bufferedGas,
      });

      state.setSubmitState("confirming");
      state.setSubmitTxHash(hash);
      state.setStatusMessage("Waiting for block confirmation...");

      await publicClient!.waitForTransactionReceipt({ hash, confirmations: 1 });

      state.setSubmitState("confirmed");
      state.setStatusMessage(null);

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

    } catch (err: any) {
      console.error(err);
      state.setSubmitState("idle");
      state.setErrorMessage(getFriendlyErrorMessage(err));
      state.setStatusMessage(null);
      setEstimatedGas(null);
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
    rowDiagnostics,
    hasRouteIssue,
    needsApproval,
    insufficientBalance,
    handleApprove,
    handleSubmit,
    estimatedGas,
    refetchAllowance,
    refetchBalance,
    refetchEngineBalances
  };
}
