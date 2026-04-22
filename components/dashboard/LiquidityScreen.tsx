"use client";

import { useState, useCallback } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Info,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { usePublicClient } from "wagmi";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { useLiquidity } from "@/lib/use-liquidity";
import {
  TOKEN_OPTIONS,
  formatCompactAddress,
  formatTokenAmount,
  getExplorerTxUrl,
  isTransactionHash,
  type TokenSymbol,
} from "@/lib/wizpay";
import { USDC_ADDRESS, EURC_ADDRESS } from "@/constants/addresses";

const TOKEN_ADDRESSES: Record<TokenSymbol, `0x${string}`> = {
  USDC: USDC_ADDRESS,
  EURC: EURC_ADDRESS,
};

type LPStep = "idle" | "approving" | "executing" | "success" | "error";

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const shortMessage = Reflect.get(error, "shortMessage");
    if (typeof shortMessage === "string") {
      return shortMessage;
    }

    const message = Reflect.get(error, "message");
    if (typeof message === "string") {
      return message;
    }
  }

  return "Transaction rejected or failed.";
}

export function LiquidityScreen() {
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>("USDC");
  const [amountStr, setAmountStr] = useState("");
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [step, setStep] = useState<LPStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const publicClient = usePublicClient();
  const tokenRecord = TOKEN_OPTIONS.find((t) => t.symbol === selectedToken);
  const tokenAddress = TOKEN_ADDRESSES[selectedToken];

  const {
    lpBalance,
    allowance,
    tokenBalance,
    isLpBalanceLoading,
    isTokenBalanceLoading,
    approveToken,
    approveLpToken,
    addLiquidity,
    removeLiquidity,
    refetchAll,
  } = useLiquidity(tokenAddress);

  const decimals = tokenRecord?.decimals || 6;
  const amountBn = amountStr ? parseUnits(amountStr, activeTab === "deposit" ? decimals : 6) : 0n;
  const needsDepositApproval = activeTab === "deposit" && amountBn > allowance;
  const needsWithdrawApproval = false;

  const resetState = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setErrorMsg(null);
    setAmountStr("");
  }, []);

  const waitForTx = async (hash: string) => {
    if (publicClient && isTransactionHash(hash)) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
  };

  const handleDeposit = async () => {
    try {
      if (needsDepositApproval) {
        setStep("approving");
        const approveHash = await approveToken(amountBn);
        await waitForTx(approveHash);
        await refetchAll();
      }
      setStep("executing");
      const hash = await addLiquidity(amountBn);
      setTxHash(hash);
      await waitForTx(hash);
      await refetchAll();
      setStep("success");
    } catch (error) {
      console.error("Deposit failed:", error);
      setErrorMsg(getErrorMessage(error));
      setStep("error");
    }
  };

  const handleWithdraw = async () => {
    try {
      if (needsWithdrawApproval) {
        setStep("approving");
        const approveHash = await approveLpToken(amountBn);
        await waitForTx(approveHash);
        await refetchAll();
      }
      setStep("executing");
      const hash = await removeLiquidity(amountBn);
      setTxHash(hash);
      await waitForTx(hash);
      await refetchAll();
      setStep("success");
    } catch (error) {
      console.error("Withdraw failed:", error);
      setErrorMsg(getErrorMessage(error));
      setStep("error");
    }
  };

  const handleAction = () => {
    setErrorMsg(null);
    setTxHash(null);
    if (activeTab === "deposit") {
      void handleDeposit();
    } else {
      void handleWithdraw();
    }
  };

  const actionWord = activeTab === "deposit" ? "deposited" : "withdrew";
  const explorerUrl = getExplorerTxUrl(txHash);
  const shareText = `Just ${actionWord} ${amountStr} ${selectedToken} as liquidity into the WizPay StableFX Vault on Arc Testnet! 💧🚀${
    explorerUrl
      ? `\n\nVerify on-chain: ${explorerUrl}`
      : txHash
        ? `\n\nCircle reference: ${txHash}`
        : ""
  }`;
  const xShareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  if (step === "success") {
    return (
      <div className="mx-auto max-w-md mt-8">
        <Card className="glass-card border-emerald-500/25 shadow-2xl shadow-emerald-500/8 animate-scale-in">
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-40 rounded-full bg-emerald-500/10 blur-[50px]" />

          <CardContent className="flex flex-col items-center gap-5 pb-8 pt-10 text-center relative">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/10" />
              <CheckCircle2 className="h-10 w-10 text-emerald-400 relative z-10" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight neon-text">
                {activeTab === "deposit" ? "Deposit Successful!" : "Withdrawal Successful!"}
              </h2>
              <p className="text-sm text-muted-foreground/80">
                {activeTab === "deposit"
                  ? "Your liquidity is live. SFX-LP shares have been minted."
                  : `${selectedToken} tokens returned to your wallet.`}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-border/40 bg-background/35 p-4">
              <div className="grid grid-cols-2 gap-4 divide-x divide-border/40">
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground/60 font-semibold">Amount</p>
                  <p className="font-mono text-lg font-bold">
                    {amountStr} <span className="text-sm font-medium text-muted-foreground">{activeTab === "deposit" ? selectedToken : "SFX-LP"}</span>
                  </p>
                </div>
                <div className="space-y-1 pl-4">
                  <p className="text-xs uppercase text-muted-foreground/60 font-semibold">Action</p>
                  <p className="font-mono text-lg font-bold capitalize">
                    {activeTab}
                  </p>
                </div>
              </div>
              {txHash && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-border/30 bg-background/50 px-3 py-2.5 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                      {explorerUrl ? "Transaction" : "Circle Reference"}
                    </p>
                    <span className="font-mono text-muted-foreground/70 text-xs">
                    {formatCompactAddress(txHash)}
                    </span>
                  </div>
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Explorer <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-300/85">
                      Explorer link unavailable
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button className="w-full gap-2 bg-[#1DA1F2] text-white hover:bg-[#1A8CD8] shadow-lg shadow-[#1DA1F2]/20" asChild>
                <a href={xShareUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Share to X (Twitter)
                </a>
              </Button>
              <Button
                variant="outline"
                className="w-full bg-background/40 border-border/40 hover:border-primary/20"
                onClick={resetState}
              >
                Manage More Liquidity
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="mx-auto max-w-md mt-8">
        <Card className="glass-card border-red-500/30 shadow-2xl shadow-red-500/8 animate-scale-in">
          <CardContent className="flex flex-col items-center gap-5 pb-8 pt-10 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
              <XCircle className="h-10 w-10 text-red-400" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">
                Transaction Failed
              </h2>
              <p className="text-sm text-muted-foreground/80 max-w-xs break-words">
                {errorMsg}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button className="w-full glow-btn" onClick={resetState}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isActionDisabled = step !== "idle" || !amountStr || parseFloat(amountStr) <= 0;

  const getButtonLabel = () => {
    if (step === "approving") return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>;
    if (step === "executing") return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...</>;

    if (activeTab === "deposit") {
      return needsDepositApproval ? "Approve & Deposit" : "Deposit Liquidity";
    } else {
      return needsWithdrawApproval ? "Approve & Withdraw" : "Withdraw Liquidity";
    }
  };

  return (
    <div className="mx-auto max-w-lg mt-6 mb-24">
      <Card className="glass-card border-border/40 shadow-xl animate-fade-up">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4 icon-glow" />
            </div>
            DeFi Liquidity Vault
          </CardTitle>
          <CardDescription>
            Provide liquidity to the WizPay routing engine and earn cross-swap
            fees (SFX-LP shares).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(val: string) => {
              setActiveTab(val as "deposit" | "withdraw");
              setAmountStr("");
              setStep("idle");
              setErrorMsg(null);
              setTxHash(null);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="deposit">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
            </TabsList>

            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label>{activeTab === "deposit" ? "Deposit Token" : "Withdraw as"}</Label>
                <Select
                  value={selectedToken}
                  onValueChange={(val) => {
                    setSelectedToken(val as TokenSymbol);
                    setAmountStr("");
                  }}
                >
                  <SelectTrigger className="h-12 bg-background/40 border-border/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USDC">USDC (Base Asset)</SelectItem>
                    <SelectItem value="EURC">EURC (Foreign Asset)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label>
                    {activeTab === "deposit" ? "Amount" : "SFX-LP Shares"}
                  </Label>
                  <span className="text-xs text-muted-foreground/60 font-mono">
                    {activeTab === "deposit"
                      ? isTokenBalanceLoading
                        ? "Bal: Loading..."
                        : `Bal: ${formatTokenAmount(tokenBalance, decimals, 4)} ${selectedToken}`
                      : isLpBalanceLoading
                        ? "SFX-LP: Loading..."
                        : `SFX-LP: ${formatTokenAmount(lpBalance, 6, 4)}`}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    disabled={step !== "idle"}
                    className="h-12 text-lg font-mono bg-background/40 border-border/40"
                  />
                  <Button
                    variant="secondary"
                    className="h-12 px-6"
                    disabled={
                      step !== "idle" ||
                      (activeTab === "deposit"
                        ? isTokenBalanceLoading
                        : isLpBalanceLoading)
                    }
                    onClick={() =>
                      setAmountStr(
                        activeTab === "deposit"
                          ? formatUnits(tokenBalance, decimals)
                          : formatUnits(lpBalance, 6)
                      )
                    }
                  >
                    Max
                  </Button>
                </div>
              </div>

              <div className="rounded-xl bg-primary/8 border border-primary/15 p-4 flex text-sm text-primary/80 mt-2">
                <Info className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  {activeTab === "deposit"
                    ? "Depositing grants you SFX-LP tokens. Your share grows as swap fees accumulate."
                    : "Enter SFX-LP shares to burn. You'll receive the selected token proportional to pool TVL."}
                </span>
              </div>

              <Button
                className="glow-btn w-full h-12 text-lg bg-gradient-to-r from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.97]"
                size="lg"
                disabled={isActionDisabled}
                onClick={handleAction}
              >
                {getButtonLabel()}
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
