"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { parseUnits, isAddress, formatUnits, maxUint256 } from "viem";
import {
  Plus,
  Trash2,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Users,
  FileText,
  DollarSign,
  ExternalLink,
  Copy,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Coins,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { WIZPAY_ABI } from "@/constants/abi";
import { WIZPAY_ADDRESS, USDC_ADDRESS, EURC_ADDRESS } from "@/constants/addresses";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const EXPLORER_BASE = "https://testnet.arcscan.app";

/* ------------------------------------------------------------------ */
/*  Token Configuration                                                */
/* ------------------------------------------------------------------ */

type TokenSymbol = "USDC" | "EURC";

interface TokenConfig {
  symbol: TokenSymbol;
  name: string;
  address: `0x${string}`;
  decimals: number;
}

const SUPPORTED_TOKENS: Record<TokenSymbol, TokenConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: USDC_ADDRESS as `0x${string}`,
    decimals: 6,
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: EURC_ADDRESS as `0x${string}`,
    decimals: 6,
  },
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Recipient {
  id: string;
  address: string;
  amount: string;
}

type FlowStep = "idle" | "approving" | "approved" | "sending" | "confirmed";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyRecipient(): Recipient {
  return { id: uid(), address: "", amount: "" };
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  /* ---- wallet ---------------------------------------------------- */
  const { isConnected, address: walletAddress } = useAccount();

  /* ---- token selection ------------------------------------------- */
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>("USDC");
  const activeToken = SUPPORTED_TOKENS[selectedToken];

  /* ---- recipients state ------------------------------------------ */
  const [recipients, setRecipients] = useState<Recipient[]>([
    emptyRecipient(),
  ]);
  const [referenceId, setReferenceId] = useState("");

  /* ---- validation ------------------------------------------------ */
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ---- flow state ------------------------------------------------ */
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");

  /* ---- ERC20 approve --------------------------------------------- */
  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: isApproveSigning,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const {
    isLoading: isApproveConfirming,
    isSuccess: isApproveConfirmed,
  } = useWaitForTransactionReceipt({ hash: approveTxHash });

  /* ---- batch payment --------------------------------------------- */
  const {
    data: txHash,
    writeContract,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  /* ---- read allowance & balance ---------------------------------- */
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: walletAddress
      ? [walletAddress, WIZPAY_ADDRESS as `0x${string}`]
      : undefined,
    query: { enabled: !!walletAddress },
  });

  const { data: balanceData } = useReadContract({
    address: activeToken.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  });

  const currentAllowance = allowanceData ?? BigInt(0);
  const currentBalance = balanceData ?? BigInt(0);

  /* ---- derived amounts ------------------------------------------- */
  const totalAmount = useMemo(() => {
    return recipients.reduce((sum, r) => {
      const n = parseFloat(r.amount);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [recipients]);

  const totalAmountBN = useMemo(() => {
    try {
      return parseUnits(totalAmount.toFixed(activeToken.decimals), activeToken.decimals);
    } catch {
      return BigInt(0);
    }
  }, [totalAmount, activeToken.decimals]);

  /* ---- read estimated output ------------------------------------ */
  const { data: estimatedOutData } = useReadContract({
    address: WIZPAY_ADDRESS as `0x${string}`,
    abi: WIZPAY_ABI,
    functionName: "getEstimatedOutput",
    args: totalAmountBN > 0 ? [activeToken.address, EURC_ADDRESS as `0x${string}`, totalAmountBN] : undefined,
    query: { enabled: totalAmountBN > 0 },
  });

  const estimatedOut = estimatedOutData ?? BigInt(0);

  const needsApproval = totalAmountBN > BigInt(0) && currentAllowance < totalAmountBN;
  const insufficientBalance = totalAmountBN > BigInt(0) && currentBalance < totalAmountBN;

  const validRecipientCount = useMemo(() => {
    return recipients.filter(
      (r) => isAddress(r.address) && parseFloat(r.amount) > 0
    ).length;
  }, [recipients]);

  /* ---- auto-advance flow when approve confirms ------------------- */
  useEffect(() => {
    if (isApproveConfirmed && flowStep === "approving") {
      setFlowStep("approved");
      refetchAllowance();
    }
  }, [isApproveConfirmed, flowStep, refetchAllowance]);

  useEffect(() => {
    if (isConfirmed && flowStep === "sending") {
      setFlowStep("confirmed");
    }
  }, [isConfirmed, flowStep]);

  /* ---- refetch balance/allowance when token changes -------------- */
  useEffect(() => {
    refetchAllowance();
  }, [selectedToken, refetchAllowance]);

  /* ---- actions --------------------------------------------------- */
  const addRow = useCallback(() => {
    setRecipients((prev) => [...prev, emptyRecipient()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRecipients((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const updateRow = useCallback(
    (id: string, field: "address" | "amount", value: string) => {
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`${id}-${field}`];
        return next;
      });
    },
    []
  );

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!referenceId.trim()) {
      newErrors["referenceId"] = "Reference ID is required";
    }

    recipients.forEach((r) => {
      if (!r.address.trim()) {
        newErrors[`${r.id}-address`] = "Required";
      } else if (!isAddress(r.address)) {
        newErrors[`${r.id}-address`] = "Invalid address";
      }

      if (!r.amount.trim()) {
        newErrors[`${r.id}-amount`] = "Required";
      } else if (isNaN(parseFloat(r.amount)) || parseFloat(r.amount) <= 0) {
        newErrors[`${r.id}-amount`] = "Must be > 0";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [recipients, referenceId]);

  const handleApprove = useCallback(() => {
    if (!validate()) return;

    setFlowStep("approving");
    writeApprove({
      address: activeToken.address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [WIZPAY_ADDRESS as `0x${string}`, maxUint256],
    });
  }, [validate, writeApprove, activeToken.address]);

  const submitBatch = useCallback(() => {
    if (!validate()) return;

    setFlowStep("sending");

    const addresses = recipients.map((r) => r.address as `0x${string}`);
    const amountsIn = recipients.map((r) => parseUnits(r.amount, activeToken.decimals));
    const minAmountsOut = amountsIn.map(() => BigInt(0));

    writeContract({
      address: WIZPAY_ADDRESS as `0x${string}`,
      abi: WIZPAY_ABI,
      functionName: "batchRouteAndPay",
      args: [
        activeToken.address,  // tokenIn — dynamic based on selection
        EURC_ADDRESS as `0x${string}`,  // tokenOut
        addresses,
        amountsIn,
        minAmountsOut,
        referenceId,
      ],
    });
  }, [recipients, referenceId, validate, writeContract, activeToken]);

  const resetForm = useCallback(() => {
    setRecipients([emptyRecipient()]);
    setReferenceId("");
    setErrors({});
    setFlowStep("idle");
    resetWrite();
    resetApprove();
    refetchAllowance();
  }, [resetWrite, resetApprove, refetchAllowance]);

  const [copiedTx, setCopiedTx] = useState(false);
  const copyTxHash = useCallback(() => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  }, [txHash]);

  /* ---- tx status ------------------------------------------------- */
  const isBusy =
    isApproveSigning || isApproveConfirming || isSigning || isConfirming;
  const txError = approveError || writeError || receiptError;

  /* ---- render ---------------------------------------------------- */
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* ─── Ambient glow background ─── */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full bg-violet-500/8 blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-400/6 blur-[100px]" />
      </div>

      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold leading-tight tracking-tight">
                WizPay
              </h1>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Autonomous Enterprise Payroll · Arc Testnet
              </p>
            </div>
          </div>

          {/* Wallet connect */}
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
          />
        </div>
      </header>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        {/* ─── Not connected prompt ─── */}
        {!isConnected && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 ring-1 ring-indigo-500/20">
              <Wallet className="h-10 w-10 text-indigo-400" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold tracking-tight">
              Connect Your Wallet
            </h2>
            <p className="mb-8 max-w-md text-muted-foreground">
              Connect your wallet to access the WizPay Dashboard and start
              processing batch payroll on Arc Testnet.
            </p>
            <ConnectButton />
          </div>
        )}

        {/* ─── Connected dashboard ─── */}
        {isConnected && (
          <div className="space-y-6">
            {/* ── Stat cards row ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {/* Token Selector Card */}
              <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-amber-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardContent className="relative flex items-center gap-4 pt-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Input Token
                    </p>
                    <Select
                      value={selectedToken}
                      onValueChange={(v) => {
                        setSelectedToken(v as TokenSymbol);
                        // Reset approval flow when changing tokens
                        if (flowStep === "approved" || flowStep === "approving") {
                          setFlowStep("idle");
                          resetApprove();
                        }
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger id="token-selector" className="h-8 text-sm font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USDC">USDC — USD Coin</SelectItem>
                        <SelectItem value="EURC">EURC — Euro Coin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-indigo-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardContent className="relative flex items-center gap-4 pt-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Recipients
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                      {validRecipientCount}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        / {recipients.length}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-emerald-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardContent className="relative flex items-center gap-4 pt-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Total Payout
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                      {totalAmount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        {activeToken.symbol}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <CardContent className="relative flex items-center gap-4 pt-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {activeToken.symbol} Balance
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                      {Number(formatUnits(currentBalance, activeToken.decimals)).toLocaleString(
                        "en-US",
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                      )}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        {activeToken.symbol}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Payroll table card ── */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Cross-Border Batch Payroll</CardTitle>
                    <CardDescription>
                      Add employee wallet addresses and {activeToken.symbol} amounts below. All
                      payments are routed through the WizPay contract and
                      auto-converted to EURC for the recipients in a single transaction.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="w-fit whitespace-nowrap text-[10px] font-mono"
                    >
                      {(WIZPAY_ADDRESS as string).slice(0, 6)}…
                      {(WIZPAY_ADDRESS as string).slice(-4)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 pt-5">
                {/* Reference ID */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="referenceId"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Reference ID / Memo
                  </label>
                  <Input
                    id="referenceId"
                    placeholder="e.g. PAYROLL-2026-04-A"
                    value={referenceId}
                    onChange={(e) => {
                      setReferenceId(e.target.value);
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next["referenceId"];
                        return next;
                      });
                    }}
                    aria-invalid={!!errors["referenceId"]}
                    className="max-w-md"
                    disabled={isBusy}
                  />
                  {errors["referenceId"] && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errors["referenceId"]}
                    </p>
                  )}
                </div>

                {/* Recipient table */}
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Wallet Address</TableHead>
                        <TableHead className="w-44">You send ({activeToken.symbol})</TableHead>
                        <TableHead className="w-32 text-center">They receive (EURC)</TableHead>
                        <TableHead className="w-16 text-center">
                          <span className="sr-only">Remove</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map((r, idx) => {
                        const parsedAmt = parseFloat(r.amount) || 0;
                        const pct = totalAmount > 0 ? (parsedAmt / totalAmount) : 0;
                        const expectedEurcObj = BigInt(Math.floor(Number(estimatedOut) * pct));
                        
                        return (
                        <TableRow key={r.id} className="group/row">
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                id={`address-${r.id}`}
                                placeholder="0x..."
                                value={r.address}
                                onChange={(e) =>
                                  updateRow(r.id, "address", e.target.value)
                                }
                                aria-invalid={!!errors[`${r.id}-address`]}
                                className="font-mono text-xs"
                                disabled={isBusy}
                              />
                              {errors[`${r.id}-address`] && (
                                <p className="flex items-center gap-1 text-[11px] text-destructive">
                                  <AlertCircle className="h-3 w-3 shrink-0" />
                                  {errors[`${r.id}-address`]}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                id={`amount-${r.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={r.amount}
                                onChange={(e) =>
                                  updateRow(r.id, "amount", e.target.value)
                                }
                                aria-invalid={!!errors[`${r.id}-amount`]}
                                className="tabular-nums"
                                disabled={isBusy}
                              />
                              {errors[`${r.id}-amount`] && (
                                <p className="flex items-center gap-1 text-[11px] text-destructive">
                                  <AlertCircle className="h-3 w-3 shrink-0" />
                                  {errors[`${r.id}-amount`]}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-blue-500/80">
                            ~ {parsedAmt > 0 ? Number(formatUnits(expectedEurcObj, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "0.00"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeRow(r.id)}
                              disabled={recipients.length <= 1 || isBusy}
                              className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                              aria-label={`Remove recipient ${idx + 1}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Add row button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  disabled={recipients.length >= 50 || isBusy}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add Recipient
                  {recipients.length >= 50 && (
                    <span className="text-muted-foreground">(max 50)</span>
                  )}
                </Button>

                {/* Insufficient balance warning */}
                {insufficientBalance && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Insufficient {activeToken.symbol} balance. You have{" "}
                      <strong>
                        {Number(formatUnits(currentBalance, activeToken.decimals)).toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 2 }
                        )}
                      </strong>{" "}
                      {activeToken.symbol} but need{" "}
                      <strong>
                        {totalAmount.toLocaleString("en-US", {
                          maximumFractionDigits: 6,
                        })}
                      </strong>{" "}
                      {activeToken.symbol}.
                    </span>
                  </div>
                )}
              </CardContent>

              {/* ── Footer with submit ── */}
              <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {totalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}{" "}
                    {activeToken.symbol}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {validRecipientCount} valid recipient
                    {validRecipientCount !== 1 && "s"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {(txHash || approveTxHash || txError) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                      disabled={isBusy}
                    >
                      Reset
                    </Button>
                  )}

                  {/* Step 1: Approve (if needed) */}
                  {needsApproval && flowStep !== "confirmed" && (
                    <Button
                      size="lg"
                      onClick={handleApprove}
                      disabled={
                        isBusy || insufficientBalance || flowStep === "approved"
                      }
                      className="min-w-[180px] gap-2 border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-lg shadow-amber-500/10 hover:bg-amber-500/20 transition-all"
                    >
                      {isApproveSigning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Approve in Wallet…
                        </>
                      ) : isApproveConfirming ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Approving…
                        </>
                      ) : isApproveConfirmed || flowStep === "approved" ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Approved!
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          Approve {activeToken.symbol}
                        </>
                      )}
                    </Button>
                  )}

                  {/* Arrow between steps */}
                  {needsApproval &&
                    flowStep !== "confirmed" &&
                    !needsApproval && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    )}

                  {/* Step 2: Send batch payment */}
                  <Button
                    size="lg"
                    onClick={submitBatch}
                    disabled={
                      isBusy ||
                      isConfirmed ||
                      needsApproval ||
                      insufficientBalance
                    }
                    className="min-w-[180px] gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/30 transition-all disabled:opacity-40"
                  >
                    {isSigning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Confirm in Wallet…
                      </>
                    ) : isConfirming ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Confirming…
                      </>
                    ) : isConfirmed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Payment Sent!
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Batch Payment
                      </>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>

            {/* ── Approval notice ── */}
            {needsApproval && flowStep === "idle" && (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="flex items-start gap-3 pt-1">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">
                      Token Approval Required
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Before sending batch payments, you need to approve the
                      WizPay contract to spend your {activeToken.symbol}. This is a one-time
                      on-chain approval.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Transaction result banner ── */}
            {txHash && (
              <Card
                className={
                  isConfirmed
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-indigo-500/30 bg-indigo-500/5"
                }
              >
                <CardContent className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {isConfirmed ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-indigo-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {isConfirmed
                          ? "Transaction Confirmed"
                          : "Transaction Submitted"}
                      </p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {txHash}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      className="gap-1 font-mono text-xs"
                      onClick={copyTxHash}
                    >
                      <Copy className="h-3 w-3" />
                      {copiedTx ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="gap-1 text-xs"
                      asChild
                    >
                      <a
                        href={`${EXPLORER_BASE}/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Explorer
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Error banner ── */}
            {txError && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="flex items-start gap-3 pt-1">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-destructive">
                      Transaction Failed
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {(txError as Error).message?.slice(0, 300) ??
                        "Unknown error"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* ═══════════════════════ FOOTER ═══════════════════════ */}
      <footer className="mt-auto border-t border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground sm:px-6">
          <p>
            © {new Date().getFullYear()} WizPay · Built on{" "}
            <a
              href="https://arc.network"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Arc Network
            </a>
          </p>
          <p className="hidden font-mono sm:block">
            {walletAddress
              ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
              : "—"}
          </p>
        </div>
      </footer>
    </div>
  );
}
