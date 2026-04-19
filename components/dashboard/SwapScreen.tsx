"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Hex } from "viem";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { usePublicClient, useReadContract } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { WIZPAY_ABI, WIZPAY_BATCH_PAYMENT_ROUTED_EVENT } from "@/constants/abi";
import { WIZPAY_ADDRESS } from "@/constants/addresses";
import { ERC20_ABI } from "@/constants/erc20";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useToast } from "@/hooks/use-toast";
import {
  EXPLORER_BASE_URL,
  GAS_BUFFER_BPS,
  PREVIEW_SLIPPAGE_BPS,
  SUPPORTED_TOKENS,
  formatTokenAmount,
  getFriendlyErrorMessage,
  parseAmountToUnits,
  type TokenSymbol,
} from "@/lib/wizpay";
import { arcTestnet } from "@/lib/wagmi";

const CIRCLE_FEE_LEVEL = "MEDIUM";
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

function shortenAddress(address: string | undefined) {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedString(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    const record = asRecord(current);

    if (!record || typeof record[key] === "undefined") {
      return null;
    }

    current = record[key];
  }

  return typeof current === "string" && current ? current : null;
}

function extractCircleTxHash(value: unknown): Hex | null {
  const candidate =
    getNestedString(value, ["data", "txHash"]) ??
    getNestedString(value, ["data", "transactionHash"]) ??
    getNestedString(value, ["txHash"]) ??
    getNestedString(value, ["transactionHash"]);

  return isExplorerHash(candidate) ? candidate : null;
}

function extractCircleReference(value: unknown): string | null {
  return (
    getNestedString(value, ["data", "id"]) ??
    getNestedString(value, ["data", "transactionId"]) ??
    getNestedString(value, ["id"]) ??
    getNestedString(value, ["transactionId"]) ??
    getNestedString(value, ["challengeId"]) ??
    getNestedString(value, ["challenge", "id"]) ??
    null
  );
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function SwapScreen() {
  const { walletAddress } = useActiveWalletAddress();
  const { arcWallet, createContractExecutionChallenge, executeChallenge } =
    useCircleWallet();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { toast } = useToast();

  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("EURC");
  const [amountIn, setAmountIn] = useState("");
  const [estimatedGas, setEstimatedGas] = useState<bigint | null>(null);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const [swapHash, setSwapHash] = useState<string | null>(null);
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
      functionName: "allowance",
      args: walletAddress ? [walletAddress, WIZPAY_ADDRESS] : undefined,
      query: { enabled: Boolean(walletAddress) },
    });

  const { data: currentBalanceData, refetch: refetchBalance } = useReadContract({
    address: tokenInConfig.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: Boolean(walletAddress) },
  });

  const { data: estimatedOutputData, refetch: refetchQuote } = useReadContract({
    address: WIZPAY_ADDRESS,
    abi: WIZPAY_ABI,
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
    Boolean(arcWallet?.id) &&
    tokenIn !== tokenOut &&
    amountInUnits > 0n &&
    !insufficientBalance;

  useEffect(() => {
    setEstimatedGas(null);
    setApprovalHash(null);
    setSwapHash(null);
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
      setErrorMessage("Connect your Circle Arc wallet and enter a valid swap amount first.");
      return;
    }

    if (!publicClient) {
      setErrorMessage("Arc public client is not ready yet.");
      return;
    }

    if (!walletAddress || !arcWallet?.id) {
      setErrorMessage("Circle Arc wallet metadata is missing. Refresh and try again.");
      return;
    }

    setIsApproving(true);
    setErrorMessage(null);

    try {
      const callData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [WIZPAY_ADDRESS, amountInUnits],
      });

      const challenge = await createContractExecutionChallenge({
        walletId: arcWallet.id,
        contractAddress: tokenInConfig.address,
        callData,
        feeLevel: CIRCLE_FEE_LEVEL,
        refId: `SWAP-APPROVE-${Date.now()}`,
      });

      const challengeResult = await executeChallenge(challenge.challengeId);
      const txHash =
        extractCircleTxHash(challengeResult) ??
        extractCircleTxHash(challenge.raw);

      if (txHash) {
        setApprovalHash(txHash);
      }

      await waitForAllowanceUpdate(txHash);

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

  async function handleSwap() {
    if (!canSubmit) {
      setErrorMessage("Connect your Circle Arc wallet and enter a valid swap amount first.");
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

    if (!walletAddress || !arcWallet?.id) {
      setErrorMessage("Circle Arc wallet metadata is missing. Refresh and try again.");
      return;
    }

    setIsSwapping(true);
    setErrorMessage(null);

    try {
      const referenceId = `SWAP-${Date.now()}`;
      const tokenOuts = [tokenOutConfig.address];
      const recipients = [walletAddress];
      const amountsIn = [amountInUnits];
      const minAmountsOut = [minimumOut];

      const gasEstimate = await publicClient.estimateContractGas({
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

      const bufferedGas = (gasEstimate * (10000n + GAS_BUFFER_BPS)) / 10000n;
      setEstimatedGas(bufferedGas);

      const callData = encodeFunctionData({
        abi: WIZPAY_ABI,
        functionName: "batchRouteAndPay",
        args: [
          tokenInConfig.address,
          tokenOuts,
          recipients,
          amountsIn,
          minAmountsOut,
          referenceId,
        ],
      });
      const startBlock = await publicClient.getBlockNumber();

      const challenge = await createContractExecutionChallenge({
        walletId: arcWallet.id,
        contractAddress: WIZPAY_ADDRESS,
        callData,
        feeLevel: CIRCLE_FEE_LEVEL,
        refId: referenceId,
      });

      const challengeResult = await executeChallenge(challenge.challengeId);
      const txHash =
        extractCircleTxHash(challengeResult) ??
        extractCircleTxHash(challenge.raw);
      const fallbackReference =
        extractCircleReference(challengeResult) ??
        extractCircleReference(challenge.raw) ??
        challenge.challengeId;

      const confirmedHash = await waitForSwapSettlement({
        startBlock,
        txHash,
        referenceId,
      });
      const finalHash = confirmedHash ?? txHash ?? fallbackReference;

      setSwapHash(finalHash);
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
      <div className="animate-fade-up space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Swap
            </h1>
            <p className="text-sm text-muted-foreground/70">
              Real Arc self-swap flow using Circle challenges and the live WizPay routing contract.
            </p>
          </div>
        </div>

        <Card className="glass-card overflow-hidden border-border/40">
          <CardHeader className="relative overflow-hidden border-b border-border/30 pb-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <ArrowRightLeft className="h-4.5 w-4.5" />
              </div>
              Instant Self-Swap
            </CardTitle>
            <CardDescription>
              Approve the input token once, then route a single-recipient `batchRouteAndPay` call back to your own Circle Arc wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    From token
                  </label>
                  <Select value={tokenIn} onValueChange={(value) => setTokenIn(value as TokenSymbol)}>
                    <SelectTrigger className="h-11 border-border/40 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SUPPORTED_TOKENS).map((token) => (
                        <SelectItem key={`token-in-${token.symbol}`} value={token.symbol}>
                          {token.symbol} - {token.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    To token
                  </label>
                  <Select value={tokenOut} onValueChange={(value) => setTokenOut(value as TokenSymbol)}>
                    <SelectTrigger className="h-11 border-border/40 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SUPPORTED_TOKENS).map((token) => (
                        <SelectItem key={`token-out-${token.symbol}`} value={token.symbol}>
                          {token.symbol} - {token.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Amount in
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.000001"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(event) => setAmountIn(event.target.value)}
                  className="h-11 border-border/40 bg-background/50"
                />
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleApprove}
                  disabled={!canSubmit || !needsApproval || isApproving || isSwapping}
                  className="h-11 px-5"
                >
                  {isApproving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {needsApproval ? `Approve ${tokenIn}` : `${tokenIn} Approved`}
                </Button>
                <Button
                  onClick={handleSwap}
                  disabled={!canSubmit || needsApproval || isSwapping || isApproving}
                  className="h-11 px-5"
                >
                  {isSwapping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                  Swap now
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Wallet context
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium">{shortenAddress(walletAddress)}</p>
                    <p className="text-xs text-muted-foreground/65">Arc Testnet destination is your own Circle wallet</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Live quote
                </p>
                {amountInUnits > 0n && tokenIn !== tokenOut ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Estimated out</span>
                      <span className="font-mono text-sm font-medium">
                        {formatTokenAmount(estimatedOutput, tokenOutConfig.decimals, 6)} {tokenOut}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Minimum out</span>
                      <span className="font-mono text-sm font-medium">
                        {formatTokenAmount(minimumOut, tokenOutConfig.decimals, 6)} {tokenOut}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Routing fee</span>
                      <span className="font-mono text-sm font-medium">
                        {formatTokenAmount(estimatedFee, tokenInConfig.decimals, 6)} {tokenIn}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Est. gas</span>
                      <span className="font-mono text-sm font-medium">
                        {estimatedGas ? estimatedGas.toLocaleString("en-US") : "Run swap"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground/70">
                    Enter an amount and choose a different token pair to preview the on-chain swap output.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Execution status
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Balance</span>
                    <span className="font-mono text-sm font-medium">
                      {formatTokenAmount(currentBalance, tokenInConfig.decimals, 6)} {tokenIn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Allowance</span>
                    <span className="font-mono text-sm font-medium">
                      {formatTokenAmount(currentAllowance, tokenInConfig.decimals, 6)} {tokenIn}
                    </span>
                  </div>
                  {approvalHash ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Approval</span>
                      <span className="font-mono text-sm font-medium">{shortenHash(approvalHash)}</span>
                    </div>
                  ) : null}
                  {swapHash ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Swap tx</span>
                      <span className="font-mono text-sm font-medium">{shortenHash(swapHash)}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground/70">
                      No swap submitted yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="glass-card border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                What This Uses
              </CardTitle>
              <CardDescription>
                This screen runs on the same Circle executor stack as payroll.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground/80">
              <p>Approval is created as a Circle contract-execution challenge against the input token.</p>
              <p>Swap submission routes one `batchRouteAndPay` call back to your own Arc wallet address.</p>
              <p>The quote preview comes from on-chain `getEstimatedOutput`, so it stays aligned with the active WizPay engine.</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Constraints
              </CardTitle>
              <CardDescription>
                Narrow by design to stay consistent with the deployed contracts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground/80">
              <p>Only Arc Testnet USDC and EURC are exposed here.</p>
              <p>This screen performs self-swaps for the active Circle Arc wallet only.</p>
              <p>If you need multi-recipient routing, stay on the payroll screen.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
        <DialogContent className="glass-card max-w-md overflow-hidden border-border/40 bg-background/95 p-0">
          <div className="relative overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl">Swap submitted successfully</DialogTitle>
              <DialogDescription>
                Circle accepted your self-swap on Arc Testnet.
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