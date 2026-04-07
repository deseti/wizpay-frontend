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
  X,
} from "lucide-react";
import { usePublicClient } from "wagmi";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

import { useLiquidity } from "@/lib/use-liquidity";
import {
  formatTokenAmount,
  formatCompactAddress,
  EXPLORER_BASE_URL,
  TOKEN_OPTIONS,
  type TokenSymbol,
} from "@/lib/wizpay";
import { USDC_ADDRESS, EURC_ADDRESS } from "@/constants/addresses";

const TOKEN_ADDRESSES: Record<TokenSymbol, `0x${string}`> = {
  USDC: USDC_ADDRESS,
  EURC: EURC_ADDRESS,
};

type LPStep = "idle" | "approving" | "executing" | "success" | "error";

export function LiquidityManagerModal({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
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
    lpAllowance,
    tokenBalance,
    approveToken,
    approveLpToken,
    addLiquidity,
    removeLiquidity,
    refetchAll,
  } = useLiquidity(tokenAddress);

  const decimals = tokenRecord?.decimals || 6;
  const amountBn = amountStr ? parseUnits(amountStr, activeTab === "deposit" ? decimals : 6) : 0n;
  const needsDepositApproval = activeTab === "deposit" && amountBn > allowance;
  const needsWithdrawApproval = activeTab === "withdraw" && amountBn > lpAllowance;

  const resetState = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setErrorMsg(null);
    setAmountStr("");
  }, []);

  const waitForTx = async (hash: string) => {
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
    }
  };

  const handleDeposit = async () => {
    try {
      if (needsDepositApproval) {
        setStep("approving");
        const approveHash = await approveToken(amountBn);
        await waitForTx(approveHash);
        refetchAll();
        // After approve, now do deposit
      }

      setStep("executing");
      const hash = await addLiquidity(amountBn);
      setTxHash(hash);
      await waitForTx(hash);
      refetchAll();
      setStep("success");
    } catch (err: any) {
      console.error("Deposit failed:", err);
      setErrorMsg(err?.shortMessage || err?.message || "Transaction rejected or failed.");
      setStep("error");
    }
  };

  const handleWithdraw = async () => {
    try {
      if (needsWithdrawApproval) {
        setStep("approving");
        const approveHash = await approveLpToken(amountBn);
        await waitForTx(approveHash);
        refetchAll();
      }

      setStep("executing");
      const hash = await removeLiquidity(amountBn);
      setTxHash(hash);
      await waitForTx(hash);
      refetchAll();
      setStep("success");
    } catch (err: any) {
      console.error("Withdraw failed:", err);
      setErrorMsg(err?.shortMessage || err?.message || "Transaction rejected or failed.");
      setStep("error");
    }
  };

  const handleAction = () => {
    setErrorMsg(null);
    setTxHash(null);
    if (activeTab === "deposit") {
      handleDeposit();
    } else {
      handleWithdraw();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      refetchAll();
      resetState();
    }
    setIsOpen(open);
  };

  /* ── Share content ── */
  const actionWord = activeTab === "deposit" ? "deposited" : "withdrew";
  const shareText = `Just ${actionWord} ${amountStr} ${selectedToken} as liquidity into the WizPay StableFX Vault on Arc Testnet! 💧🚀\n\nVerify on-chain: ${EXPLORER_BASE_URL}/tx/${txHash}`;
  const xShareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  /* ── Result Overlays ── */
  if (step === "success") {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-[450px] p-0 border-primary/40">
          <Card className="glass-card border-0 shadow-2xl shadow-primary/20">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground hover:bg-background/50 hover:text-foreground z-10"
              onClick={() => { resetState(); setIsOpen(false); }}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardContent className="flex flex-col items-center gap-5 pb-8 pt-10 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/10" />
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">
                  {activeTab === "deposit" ? "Deposit Successful!" : "Withdrawal Successful!"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "deposit"
                    ? "Your liquidity is live. SFX-LP shares have been minted to your wallet."
                    : `${selectedToken} tokens have been returned to your wallet.`}
                </p>
              </div>

              <div className="w-full rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="grid grid-cols-2 gap-4 divide-x divide-border/60">
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-muted-foreground">Amount</p>
                    <p className="font-mono text-lg font-medium">
                      {amountStr} <span className="text-sm">{activeTab === "deposit" ? selectedToken : "SFX-LP"}</span>
                    </p>
                  </div>
                  <div className="space-y-1 pl-4">
                    <p className="text-xs uppercase text-muted-foreground">Action</p>
                    <p className="font-mono text-lg font-medium capitalize">
                      {activeTab}
                    </p>
                  </div>
                </div>
                {txHash && (
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-border/40 bg-background/70 px-3 py-2 text-sm">
                    <span className="font-mono text-muted-foreground">
                      {formatCompactAddress(txHash)}
                    </span>
                    <a
                      href={`${EXPLORER_BASE_URL}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      Explorer <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col gap-3">
                <Button className="w-full gap-2 bg-[#1DA1F2] text-white hover:bg-[#1A8CD8]" asChild>
                  <a href={xShareUrl} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Share to X (Twitter)
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="w-full bg-background/50"
                  onClick={() => { resetState(); setIsOpen(false); }}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    );
  }

  if (step === "error") {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-[450px] p-0 border-red-500/40">
          <Card className="glass-card border-0 shadow-2xl shadow-red-500/20">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground hover:bg-background/50 hover:text-foreground z-10"
              onClick={() => { resetState(); }}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardContent className="flex flex-col items-center gap-5 pb-8 pt-10 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
                <XCircle className="h-10 w-10 text-red-400" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">
                  Transaction Failed
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs break-words">
                  {errorMsg}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3">
                <Button className="w-full" onClick={resetState}>
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="w-full bg-background/50"
                  onClick={() => { resetState(); setIsOpen(false); }}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
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
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>DeFi Liquidity Vault</DialogTitle>
          <DialogDescription>
            Provide liquidity to the WizPay routing engine and earn cross-swap
            fees (SFX-LP shares).
          </DialogDescription>
        </DialogHeader>

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

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>{activeTab === "deposit" ? "Deposit Token" : "Withdraw as"}</Label>
              <Select
                value={selectedToken}
                onValueChange={(val) => {
                  setSelectedToken(val as TokenSymbol);
                  setAmountStr("");
                  refetchAll();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC (Base Asset)</SelectItem>
                  <SelectItem value="EURC">EURC (Foreign Asset)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>
                  {activeTab === "deposit" ? "Amount" : "SFX-LP Shares"}
                </Label>
                <Badge variant="outline" className="text-xs">
                  {activeTab === "deposit"
                    ? `Bal: ${formatTokenAmount(tokenBalance, decimals, 4)} ${selectedToken}`
                    : `SFX-LP: ${formatTokenAmount(lpBalance, 6, 4)}`}
                </Badge>
              </div>
              <div className="flex space-x-2">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  disabled={step !== "idle"}
                />
                <Button
                  variant="secondary"
                  disabled={step !== "idle"}
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

            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 flex text-sm text-primary">
              <Info className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
              <span>
                {activeTab === "deposit"
                  ? "Depositing grants you SFX-LP tokens. Your share grows as swap fees accumulate."
                  : "Enter SFX-LP shares to burn. You'll receive the selected token proportional to pool TVL."}
              </span>
            </div>

            <Button
              className="w-full h-11"
              size="lg"
              disabled={isActionDisabled}
              onClick={handleAction}
            >
              {getButtonLabel()}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
