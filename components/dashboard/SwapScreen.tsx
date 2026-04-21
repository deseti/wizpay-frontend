"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, type Hex } from "viem";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { usePublicClient, useReadContract } from "wagmi";

import { useActionGuard } from "@/hooks/useActionGuard";
import { Button } from "@/components/ui/button";
import { useTransactionExecutor } from "@/hooks/useTransactionExecutor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WIZPAY_ABI, WIZPAY_BATCH_PAYMENT_ROUTED_EVENT } from "@/constants/abi";
import { WIZPAY_ADDRESS } from "@/constants/addresses";
import { ERC20_ABI } from "@/constants/erc20";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useToast } from "@/hooks/use-toast";
import {
  EXPLORER_BASE_URL,
  PREVIEW_SLIPPAGE_BPS,
  SUPPORTED_TOKENS,
  formatTokenAmount,
  getFriendlyErrorMessage,
  parseAmountToUnits,
  type TokenSymbol,
} from "@/lib/wizpay";
import { arcTestnet } from "@/lib/wagmi";

const MAX_CONFIRMATION_POLLS = 20;
const POLL_INTERVAL_MS = 1500;

type SwapEventLog = {
  transactionHash: Hex | null;
  args: {
    referenceId?: string;
  };
};

interface SwapSuccessState {
  amountIn: string;
  amountOut: string | null;
  explorerUrl?: string;
  tokenIn: TokenSymbol;
  tokenOut: TokenSymbol;
  txHash: string;
}

function shortenHash(hash: string | undefined) {
  if (!hash) {
    return "Pending";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function isExplorerHash(value: string | null | undefined): value is Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? "");
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function SwapScreen() {
  const { walletAddress } = useActiveWalletAddress();
  const { executeTransaction } = useTransactionExecutor();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { toast } = useToast();

  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("EURC");
  const [amountIn, setAmountIn] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [successState, setSuccessState] = useState<SwapSuccessState | null>(null);

  const tokenInConfig = SUPPORTED_TOKENS[tokenIn];
  const tokenOutConfig = SUPPORTED_TOKENS[tokenOut];
  const amountInUnits = useMemo(
    () => parseAmountToUnits(amountIn, tokenInConfig.decimals),
    [amountIn, tokenInConfig.decimals]
  );

  const { data: currentAllowanceData, refetch: refetchAllowance } =
    useReadContract({
      address: tokenInConfig.address,
      abi: ERC20_ABI,
      chainId: arcTestnet.id,
      functionName: "allowance",
      args: walletAddress ? [walletAddress, WIZPAY_ADDRESS] : undefined,
      query: { enabled: Boolean(walletAddress) },
    });

  const { data: currentBalanceData, refetch: refetchBalance } = useReadContract({
    address: tokenInConfig.address,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: Boolean(walletAddress) },
  });

  const { data: estimatedOutputData, refetch: refetchQuote } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    chainId: arcTestnet.id,
    functionName: "getEstimatedOutput",
    args:
      walletAddress && amountInUnits > 0n && tokenIn !== tokenOut
        ? [tokenInConfig.address, tokenOutConfig.address, amountInUnits]
        : undefined,
    query: {
      enabled: Boolean(walletAddress && amountInUnits > 0n && tokenIn !== tokenOut),
      refetchInterval: 12000,
    },
  });

  const { data: feeBpsData } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
    chainId: arcTestnet.id,
    functionName: "feeBps",
  });

  const currentAllowance = currentAllowanceData ?? 0n;
  const currentBalance = currentBalanceData ?? 0n;
  const estimatedOutput = estimatedOutputData ?? 0n;
  const feeBps = feeBpsData ?? 0n;
  const estimatedFee = useMemo(
    () => (amountInUnits * feeBps) / 10000n,
    [amountInUnits, feeBps]
  );
  const minimumOut = useMemo(() => {
    if (estimatedOutput <= 0n) {
      return 0n;
    }

    return (estimatedOutput * (10000n - PREVIEW_SLIPPAGE_BPS)) / 10000n;
  }, [estimatedOutput]);
  const needsApproval = amountInUnits > 0n && currentAllowance < amountInUnits;
  const insufficientBalance = amountInUnits > currentBalance;
  const canSubmit =
    Boolean(walletAddress) &&
    tokenIn !== tokenOut &&
    amountInUnits > 0n &&
    !insufficientBalance;

  useEffect(() => {
    setErrorMessage(null);
    setSuccessState(null);
  }, [amountIn, tokenIn, tokenOut]);

  useEffect(() => {
    if (tokenIn !== tokenOut) {
      return;
    }

    setTokenOut(tokenIn === "USDC" ? "EURC" : "USDC");
  }, [tokenIn, tokenOut]);

  async function waitForAllowanceUpdate(txHash: Hex | null) {
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

      if (nextAllowance >= amountInUnits) {
        return;
      }

      if (attempt < MAX_CONFIRMATION_POLLS - 1) {
        await waitFor(POLL_INTERVAL_MS);
      }
    }

    throw new Error(
      "Swap approval completed, but the allowance did not refresh before the timeout window ended."
    );
  }

  async function waitForSwapSettlement({
    startBlock,
    txHash,
    referenceId,
  }: {
    startBlock: bigint;
    txHash: Hex | null;
    referenceId: string;
  }) {
    if (!publicClient || !walletAddress) {
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
        // Fall through to the event-based confirmation path.
      }
    }

    for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
      const logs = (await publicClient.getLogs({
        address: WIZPAY_ADDRESS,
        event: WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
        args: { sender: walletAddress },
        fromBlock: startBlock,
      })) as SwapEventLog[];

      const matchedLog = logs.find(
        (log) =>
          Boolean(log.transactionHash) && log.args.referenceId === referenceId
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
      "Circle reported the swap challenge complete, but the final settlement event did not appear before the timeout window ended."
    );
  }

  async function handleApprove() {
    if (!canSubmit) {
      setErrorMessage("Connect the active wallet and enter a valid swap amount first.");
      return;
    }

    if (!publicClient) {
      setErrorMessage("Arc public client is not ready yet.");
      return;
    }

    setIsApproving(true);
    setErrorMessage(null);

    try {
      const approvalResult = await executeTransaction({
        abi: ERC20_ABI,
        args: [WIZPAY_ADDRESS, amountInUnits],
        chainId: arcTestnet.id,
        contractAddress: tokenInConfig.address,
        functionName: "approve",
        refId: `SWAP-APPROVE-${Date.now()}`,
      });

      await waitForAllowanceUpdate(approvalResult.txHash);

      toast({
        title: "Swap approval confirmed",
        description: `${tokenIn} is now ready for self-swap through WizPay.`,
      });
    } catch (error) {
      const message = getFriendlyErrorMessage(error);
      setErrorMessage(message);
      toast({
        title: "Approval failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsApproving(false);
    }
  }

  const { isProcessing: isGuarded, guard } = useActionGuard();

  async function handleSwap() {
    if (!canSubmit) {
      setErrorMessage("Connect the active wallet and enter a valid swap amount first.");
      return;
    }

    if (needsApproval) {
      setErrorMessage(`Approve ${tokenIn} before submitting the swap.`);
      return;
    }

    if (!publicClient) {
      setErrorMessage("Arc public client is not ready yet.");
      return;
    }

    if (!walletAddress) {
      setErrorMessage("Connect the active wallet and enter a valid swap amount first.");
      return;
    }

    setIsSwapping(true);
    setErrorMessage(null);

    try {
      const referenceId = `SWAP-${Date.now()}`;
      const tokenOuts = [tokenOutConfig.address];
      const recipients: readonly Address[] = [walletAddress];
      const amountsIn = [amountInUnits];
      const minAmountsOut = [minimumOut];

      await publicClient.estimateContractGas({
        address: WIZPAY_ADDRESS,
        abi: WIZPAY_ABI,
        functionName: "batchRouteAndPay",
        account: walletAddress,
        args: [
          tokenInConfig.address,
          tokenOuts,
          recipients,
          amountsIn,
          minAmountsOut,
          referenceId,
        ],
      });

      const executionResult = await executeTransaction({
        abi: WIZPAY_ABI,
        args: [
          tokenInConfig.address,
          tokenOuts,
          recipients,
          amountsIn,
          minAmountsOut,
          referenceId,
        ],
        chainId: arcTestnet.id,
        contractAddress: WIZPAY_ADDRESS,
        functionName: "batchRouteAndPay",
        refId: referenceId,
      });

      const confirmedHash = await waitForSwapSettlement({
        startBlock: executionResult.startBlock,
        txHash: executionResult.txHash,
        referenceId,
      });
      const finalHash = confirmedHash ?? executionResult.hash;

      setSuccessState({
        amountIn,
        amountOut:
          estimatedOutput > 0n
            ? formatTokenAmount(estimatedOutput, tokenOutConfig.decimals, 6)
            : null,
        explorerUrl: isExplorerHash(finalHash)
          ? `${EXPLORER_BASE_URL}/tx/${finalHash}`
          : undefined,
        tokenIn,
        tokenOut,
        txHash: finalHash,
      });
      setIsSuccessDialogOpen(true);

      await Promise.all([
        refetchAllowance(),
        refetchBalance(),
        refetchQuote(),
      ]);

      toast({
        title: "Swap submitted",
        description: `Self-swap routed through WizPay for ${tokenOut}.`,
      });
    } catch (error) {
      const message = getFriendlyErrorMessage(error);
      setErrorMessage(message);
      toast({
        title: "Swap failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSwapping(false);
    }
  }

  return (
    <>
      <div className="animate-fade-up space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Swap</h1>
          <p className="text-sm text-muted-foreground/70">
            Swap tokens instantly through the WizPay routing engine.
          </p>
        </div>

        {/* Main Swap Card */}
        <Card className="glass-card overflow-hidden border-border/40 mx-auto max-w-lg">
          <CardContent className="space-y-5 py-6">
            {/* From Token */}
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">You pay</span>
                <span className="text-xs text-muted-foreground/50">
                  Balance: {formatTokenAmount(currentBalance, tokenInConfig.decimals)} {tokenIn}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.000001"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(event) => setAmountIn(event.target.value)}
                  className="h-12 border-0 bg-transparent text-2xl font-bold placeholder:text-muted-foreground/30 focus-visible:ring-0 p-0 flex-1"
                />
                <Select value={tokenIn} onValueChange={(value) => setTokenIn(value as TokenSymbol)}>
                  <SelectTrigger className="h-10 w-[110px] border-border/40 bg-background/50 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(SUPPORTED_TOKENS).map((token) => (
                      <SelectItem key={`in-${token.symbol}`} value={token.symbol}>
                        {token.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Swap Direction Icon */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-card/80 text-primary shadow-lg">
                <ArrowRightLeft className="h-4 w-4 rotate-90" />
              </div>
            </div>

            {/* To Token */}
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">You receive</span>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold flex-1 min-w-0">
                  {amountInUnits > 0n && tokenIn !== tokenOut && estimatedOutput > 0n
                    ? formatTokenAmount(estimatedOutput, tokenOutConfig.decimals, 6)
                    : "0.0"
                  }
                </p>
                <Select value={tokenOut} onValueChange={(value) => setTokenOut(value as TokenSymbol)}>
                  <SelectTrigger className="h-10 w-[110px] border-border/40 bg-background/50 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(SUPPORTED_TOKENS).map((token) => (
                      <SelectItem key={`out-${token.symbol}`} value={token.symbol}>
                        {token.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quote Details (collapsed) */}
            {amountInUnits > 0n && tokenIn !== tokenOut && (
              <div className="rounded-xl border border-border/30 bg-background/20 px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground/70">
                  <span>Min. received</span>
                  <span className="font-mono">{formatTokenAmount(minimumOut, tokenOutConfig.decimals, 6)} {tokenOut}</span>
                </div>
                <div className="flex justify-between text-muted-foreground/70">
                  <span>Fee</span>
                  <span className="font-mono">{formatTokenAmount(estimatedFee, tokenInConfig.decimals, 6)} {tokenIn}</span>
                </div>
                <div className="flex justify-between text-muted-foreground/70">
                  <span>Slippage</span>
                  <span className="font-mono">2%</span>
                </div>
              </div>
            )}

            {/* Error */}
            {errorMessage && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-2">
                <span>{errorMessage}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setErrorMessage(null)}
                  className="text-destructive hover:text-destructive/80 shrink-0"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* Insufficient balance warning */}
            {insufficientBalance && amountInUnits > 0n && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                Insufficient {tokenIn} balance
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {needsApproval ? (
                <Button
                  onClick={handleApprove}
                  disabled={!canSubmit || isApproving || isSwapping}
                  className="w-full h-12 text-base glow-btn bg-gradient-to-r from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {isApproving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Approving...
                    </span>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Approve {tokenIn}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => void guard(handleSwap)}
                  disabled={!canSubmit || isSwapping || isApproving || isGuarded}
                  className="w-full h-12 text-base glow-btn bg-gradient-to-r from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {isSwapping ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Swapping...
                    </span>
                  ) : (
                    "Swap"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

          <Card className="glass-card border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Token Pair
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground/80">
              <p>Only Arc Testnet USDC and EURC are available. For batch routing, use the Send page.</p>
            </CardContent>
          </Card>
        </div>

      <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
        <DialogContent className="glass-card max-w-md overflow-hidden border-border/40 bg-background/95 p-0">
          <div className="relative overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl">Swap Successful</DialogTitle>
              <DialogDescription>
                Your swap has been confirmed on Arc Testnet.
              </DialogDescription>
            </DialogHeader>

            {successState ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-border/40 bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Route</span>
                    <span className="font-medium">
                      {successState.tokenIn} to {successState.tokenOut}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Amount in</span>
                    <span className="font-mono font-medium">
                      {successState.amountIn} {successState.tokenIn}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Expected out</span>
                    <span className="font-mono font-medium">
                      {successState.amountOut ?? "Pending"} {successState.tokenOut}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Transaction</span>
                    <span className="font-mono font-medium">{shortenHash(successState.txHash)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {successState.explorerUrl ? (
                    <Button asChild className="flex-1">
                      <a href={successState.explorerUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        View transaction
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsSuccessDialogOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}