"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Droplet,
  ExternalLink,
  RefreshCw,
  Route,
  Wallet,
} from "lucide-react";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
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
import {
  ETHEREUM_SEPOLIA_USDC_ADDRESS,
  USDC_ADDRESS,
} from "@/constants/addresses";
import { useToast } from "@/hooks/use-toast";
import {
  bootstrapCircleTransferWallet,
  createCircleTransfer,
  getCircleTransferWallet,
  TransferApiError,
  type CircleTransfer,
  type CircleTransferBlockchain,
  type CircleTransferWallet,
} from "@/lib/transfer-service";

const TRANSFER_WALLET_STORAGE_KEY = "wizpay-bridge-transfer-wallets";

const DESTINATION_OPTIONS: Array<{
  id: CircleTransferBlockchain;
  label: string;
  explorerBaseUrl: string;
}> = [
  {
    id: "ARC-TESTNET",
    label: "Arc Testnet",
    explorerBaseUrl: "https://testnet.arcscan.app",
  },
  {
    id: "ETH-SEPOLIA",
    label: "Ethereum Sepolia",
    explorerBaseUrl: "https://sepolia.etherscan.io",
  },
];

const APP_TREASURY_WALLET_TITLE = "App Treasury Wallet";
const APP_TREASURY_WALLET_LABEL = "app treasury wallet";
const BRIDGE_ASSET_SYMBOL = "USDC";

const USDC_ADDRESS_BY_CHAIN: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": USDC_ADDRESS,
  "ETH-SEPOLIA": ETHEREUM_SEPOLIA_USDC_ADDRESS,
};

function getSourceBlockchain(
  destinationChain: CircleTransferBlockchain
): CircleTransferBlockchain {
  return destinationChain === "ARC-TESTNET" ? "ETH-SEPOLIA" : "ARC-TESTNET";
}

function isPositiveDecimal(input: string) {
  if (!input.trim()) {
    return false;
  }

  return /^\d+(?:\.\d+)?$/.test(input) && Number(input) > 0;
}

function isValidAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function shortenAddress(address: string | null | undefined) {
  if (!address) {
    return "Unavailable";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getStoredTransferWallet(blockchain: CircleTransferBlockchain) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(TRANSFER_WALLET_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<
      Record<
        CircleTransferBlockchain,
        {
          walletId: string | null;
          walletAddress: string;
          walletSetId: string | null;
        }
      >
    >;

    return parsedValue[blockchain] ?? null;
  } catch {
    return null;
  }
}

function setStoredTransferWallet(
  blockchain: CircleTransferBlockchain,
  wallet: CircleTransferWallet
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const currentWallets = getStoredTransferWallets();
    currentWallets[blockchain] = {
      walletId: wallet.walletId,
      walletAddress: wallet.walletAddress,
      walletSetId: wallet.walletSetId,
    };
    window.localStorage.setItem(
      TRANSFER_WALLET_STORAGE_KEY,
      JSON.stringify(currentWallets)
    );
  } catch {
    // Ignore local storage write failures and continue with in-memory state.
  }
}

function clearStoredTransferWallet(blockchain: CircleTransferBlockchain) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const currentWallets = getStoredTransferWallets();
    delete currentWallets[blockchain];
    window.localStorage.setItem(
      TRANSFER_WALLET_STORAGE_KEY,
      JSON.stringify(currentWallets)
    );
  } catch {
    // Ignore local storage write failures and continue with in-memory state.
  }
}

function getStoredTransferWallets() {
  if (typeof window === "undefined") {
    return {} as Partial<
      Record<
        CircleTransferBlockchain,
        {
          walletId: string | null;
          walletAddress: string;
          walletSetId: string | null;
        }
      >
    >;
  }

  try {
    const rawValue = window.localStorage.getItem(TRANSFER_WALLET_STORAGE_KEY);
    return rawValue
      ? (JSON.parse(rawValue) as Partial<
          Record<
            CircleTransferBlockchain,
            {
              walletId: string | null;
              walletAddress: string;
              walletSetId: string | null;
            }
          >
        >)
      : {};
  } catch {
    return {};
  }
}

function getErrorDetails(error: TransferApiError | null) {
  if (!error?.details || typeof error.details !== "object") {
    return null;
  }

  return error.details as Record<string, unknown>;
}

function getTreasuryFundingMessage({
  networkLabel,
  availableAmount,
  symbol,
  walletAddress,
  requestedAmount,
}: {
  networkLabel: string;
  availableAmount: string;
  symbol: string;
  walletAddress?: string | null;
  requestedAmount?: string;
}) {
  const walletReference = walletAddress
    ? `${APP_TREASURY_WALLET_TITLE} ${shortenAddress(walletAddress)}`
    : `The ${APP_TREASURY_WALLET_LABEL}`;

  return `Bridge requires ${BRIDGE_ASSET_SYMBOL} in the ${APP_TREASURY_WALLET_LABEL}. ${walletReference} currently holds ${availableAmount} ${symbol} on ${networkLabel}. Please fund this wallet${requestedAmount ? ` before bridging ${requestedAmount} ${BRIDGE_ASSET_SYMBOL}` : " before bridging"}.`;
}

function getTreasurySetupMessage(networkLabel: string) {
  return `Bridge requires an ${APP_TREASURY_WALLET_LABEL} on ${networkLabel}. Initialize it below, then fund it with ${BRIDGE_ASSET_SYMBOL} before bridging.`;
}

function getBridgeErrorMessage(
  error: unknown,
  labels: {
    destinationLabel: string;
    sourceLabel: string;
  }
) {
  const transferError = error instanceof TransferApiError ? error : null;
  const details = getErrorDetails(transferError);
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (transferError?.code === "CIRCLE_WALLET_NOT_FOUND") {
    const walletSetCount = Array.isArray(details?.walletSetIds)
      ? details.walletSetIds.length
      : 0;

    if (walletSetCount > 0) {
      return `Circle can see ${walletSetCount} wallet set${walletSetCount === 1 ? "" : "s"}, but none contains a ${labels.sourceLabel} ${APP_TREASURY_WALLET_LABEL} yet. Initialize the treasury wallet and fund it with ${BRIDGE_ASSET_SYMBOL} before retrying.`;
    }

    return `No ${labels.sourceLabel} ${APP_TREASURY_WALLET_LABEL} is ready yet. Initialize it below and fund it with ${BRIDGE_ASSET_SYMBOL} before retrying.`;
  }

  if (transferError?.code === "CIRCLE_WALLET_CONFIG_MISSING") {
    return `No ${labels.sourceLabel} ${APP_TREASURY_WALLET_LABEL} is configured yet. Initialize one below or set the server treasury wallet environment variables before retrying.`;
  }

  if (
    transferError?.code === "CIRCLE_ENTITY_SECRET_INVALID" ||
    transferError?.code === "CIRCLE_ENTITY_SECRET_NOT_REGISTERED" ||
    transferError?.code === "CIRCLE_ENTITY_SECRET_ROTATED"
  ) {
    return "The server can read Circle wallet sets, but signed write calls are being rejected. This usually means CIRCLE_ENTITY_SECRET does not match the Circle entity/project behind the current API key, or the secret was pasted with extra whitespace. Standard API keys are valid for this flow, so switching to Restricted Key will not fix a 156013 error.";
  }

  if (transferError?.code === "CIRCLE_ENTITY_SECRET_FORMAT_INVALID") {
    return "The configured CIRCLE_ENTITY_SECRET is not the raw 64-character secret required by the official Circle Bridge Kit flow. Replace it with the original entity secret, not the recovery file contents or encrypted ciphertext, then restart the server.";
  }

  if (transferError?.code === "CIRCLE_BRIDGE_USDC_ONLY") {
    return "This bridge currently supports USDC only. EURC is intentionally unavailable in this flow.";
  }

  if (transferError?.code === "CIRCLE_BRIDGE_FORWARDER_UNAVAILABLE") {
    return `Circle Forwarder is not available for the ${labels.sourceLabel} to ${labels.destinationLabel} route right now. Retry later or use a different supported pair.`;
  }

  if (transferError?.code === "CIRCLE_BRIDGE_EXECUTION_FAILED") {
    const failedStep =
      details && typeof details === "object" && details.failedStep && typeof details.failedStep === "object"
        ? (details.failedStep as Record<string, unknown>)
        : null;
    const failedStepName =
      failedStep && typeof failedStep.name === "string" ? failedStep.name : null;
    const failedStepMessage =
      failedStep && typeof failedStep.errorMessage === "string"
        ? failedStep.errorMessage
        : null;

    if (failedStepName && failedStepMessage) {
      return `Circle Bridge Kit failed during ${failedStepName}: ${failedStepMessage}`;
    }

    return `Circle Bridge Kit could not finish the ${labels.sourceLabel} to ${labels.destinationLabel} bridge.`;
  }

  if (transferError?.code === "CIRCLE_SCA_WALLET_CREATION_DISABLED") {
    return `Circle accepted the server credentials, but this account cannot create an SCA wallet on ${labels.sourceLabel} yet. Enable the required paymaster or SCA wallet policy in Circle before bootstrapping this chain.`;
  }

  if (
    transferError?.code === "CIRCLE_API_KEY_BLOCKCHAIN_MISMATCH" ||
    transferError?.code === "CIRCLE_TRANSFER_BLOCKCHAIN_INVALID"
  ) {
    return `Circle rejected the ${labels.sourceLabel} to ${labels.destinationLabel} bridge configuration. Check the selected chain pair and the server-side Circle API key setup before retrying.`;
  }

  if (transferError?.code === "CIRCLE_TRANSFER_INSUFFICIENT_BALANCE") {
    const walletAddress =
      typeof details?.walletAddress === "string" ? details.walletAddress : null;
    const availableAmount =
      typeof details?.availableAmount === "string" ? details.availableAmount : "0";
    const symbol =
      typeof details?.symbol === "string" ? details.symbol : BRIDGE_ASSET_SYMBOL;

    return getTreasuryFundingMessage({
      networkLabel: labels.sourceLabel,
      availableAmount,
      symbol,
      walletAddress,
    });
  }

  if (
    transferError?.code === "CIRCLE_API_KEY_MISSING" ||
    transferError?.code === "CIRCLE_ENTITY_SECRET_MISSING"
  ) {
    return "The server is missing Circle treasury wallet credentials. Configure the developer-controlled wallet secrets before retrying this bridge flow.";
  }

  if (message.includes("fetch failed")) {
    return "The bridge request could not reach the local app server. Reload the page and retry.";
  }

  return message;
}

function formatWalletBalance(
  wallet: CircleTransferWallet | null,
  tokenSymbol: string
) {
  if (!wallet?.balance) {
    return `0 ${tokenSymbol}`;
  }

  return `${wallet.balance.amount} ${wallet.balance.symbol || tokenSymbol}`;
}

export function BridgeScreen() {
  const { arcWallet, sepoliaWallet } = useCircleWallet();
  const { toast } = useToast();

  const [destinationChain, setDestinationChain] =
    useState<CircleTransferBlockchain>("ETH-SEPOLIA");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [transfer, setTransfer] = useState<CircleTransfer | null>(null);
  const [transferWallet, setTransferWallet] = useState<CircleTransferWallet | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletStatusError, setWalletStatusError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isWalletBootstrapping, setIsWalletBootstrapping] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const tokenSymbol = BRIDGE_ASSET_SYMBOL;

  const destinationOption = useMemo(
    () =>
      DESTINATION_OPTIONS.find((option) => option.id === destinationChain) ??
      DESTINATION_OPTIONS[0],
    [destinationChain]
  );
  const sourceChain = getSourceBlockchain(destinationChain);
  const sourceOption = useMemo(
    () =>
      DESTINATION_OPTIONS.find((option) => option.id === sourceChain) ??
      DESTINATION_OPTIONS[0],
    [sourceChain]
  );
  const suggestedDestinationAddress =
    destinationChain === "ARC-TESTNET"
      ? arcWallet?.address ?? ""
      : sepoliaWallet?.address ?? "";
  const destinationTokenAddress = USDC_ADDRESS_BY_CHAIN[destinationChain];
  const sourceTokenAddress = USDC_ADDRESS_BY_CHAIN[sourceChain];
  const requestedAmount = Number(amount || "0");
  const walletBalanceAmount = Number(transferWallet?.balance?.amount || "0");
  const treasuryWalletEmpty =
    Number.isFinite(walletBalanceAmount) && walletBalanceAmount <= 0;
  const hasSufficientWalletBalance =
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0 ||
    walletBalanceAmount >= requestedAmount;
  const canSubmit =
    Boolean(destinationTokenAddress) &&
    isPositiveDecimal(amount) &&
    isValidAddress(destinationAddress) &&
    Boolean(transferWallet) &&
    hasSufficientWalletBalance;
  const latestExplorerStep = useMemo(() => {
    if (!transfer?.steps.length) {
      return null;
    }

    for (let index = transfer.steps.length - 1; index >= 0; index -= 1) {
      const step = transfer.steps[index];

      if (step.explorerUrl) {
        return step;
      }
    }

    return null;
  }, [transfer]);

  useEffect(() => {
    if (suggestedDestinationAddress) {
      setDestinationAddress(suggestedDestinationAddress);
      return;
    }

    setDestinationAddress("");
  }, [destinationChain, suggestedDestinationAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadTransferWallet() {
      setIsWalletLoading(true);

      const storedWallet = getStoredTransferWallet(sourceChain);

      try {
        const wallet = await getCircleTransferWallet({
          blockchain: sourceChain,
          tokenAddress: sourceTokenAddress,
          walletId: storedWallet?.walletId || undefined,
          walletAddress: storedWallet?.walletAddress || undefined,
        });

        if (cancelled) {
          return;
        }

        setTransferWallet(wallet);
        setStoredTransferWallet(sourceChain, wallet);
        setWalletStatusError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (
          error instanceof TransferApiError &&
          (error.code === "CIRCLE_WALLET_NOT_FOUND" ||
            error.code === "CIRCLE_WALLET_CONFIG_MISSING")
        ) {
          clearStoredTransferWallet(sourceChain);
        }

        setTransferWallet(null);
        setWalletStatusError(
          getBridgeErrorMessage(error, {
            destinationLabel: destinationOption.label,
            sourceLabel: sourceOption.label,
          })
        );
      } finally {
        if (!cancelled) {
          setIsWalletLoading(false);
        }
      }
    }

    void loadTransferWallet();

    return () => {
      cancelled = true;
    };
  }, [destinationOption.label, sourceChain, sourceOption.label, sourceTokenAddress]);

  async function refreshTransferWallet() {
    setIsWalletLoading(true);

    const storedWallet = getStoredTransferWallet(sourceChain);

    try {
      const wallet = await getCircleTransferWallet({
        blockchain: sourceChain,
        tokenAddress: sourceTokenAddress,
        walletId: storedWallet?.walletId || undefined,
        walletAddress: storedWallet?.walletAddress || undefined,
      });

      setTransferWallet(wallet);
      setStoredTransferWallet(sourceChain, wallet);
      setWalletStatusError(null);
    } catch (error) {
      if (
        error instanceof TransferApiError &&
        (error.code === "CIRCLE_WALLET_NOT_FOUND" ||
          error.code === "CIRCLE_WALLET_CONFIG_MISSING")
      ) {
        clearStoredTransferWallet(sourceChain);
      }

      setTransferWallet(null);
      setWalletStatusError(
        getBridgeErrorMessage(error, {
          destinationLabel: destinationOption.label,
          sourceLabel: sourceOption.label,
        })
      );
    } finally {
      setIsWalletLoading(false);
    }
  }

  async function handleBootstrapWallet() {
    setIsWalletBootstrapping(true);
    setWalletStatusError(null);

    try {
      const wallet = await bootstrapCircleTransferWallet({
        blockchain: sourceChain,
        tokenAddress: sourceTokenAddress,
        refId: `WIZPAY-BRIDGE-SOURCE-${sourceChain}-${Date.now()}`,
        walletName: `WizPay ${sourceOption.label} App Treasury Wallet`,
      });

      setTransferWallet(wallet);
      setStoredTransferWallet(sourceChain, wallet);
      setWalletStatusError(null);
      toast({
        title: "App treasury wallet ready",
        description: `Fund ${shortenAddress(wallet.walletAddress)} on ${sourceOption.label} with ${tokenSymbol} before bridging.`,
      });
    } catch (error) {
      const message = getBridgeErrorMessage(error, {
        destinationLabel: destinationOption.label,
        sourceLabel: sourceOption.label,
      });
      setWalletStatusError(message);
      toast({
        title: "Source wallet setup failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsWalletBootstrapping(false);
    }
  }

  function openBridgeReview() {
    if (!transferWallet) {
      setErrorMessage(getTreasurySetupMessage(sourceOption.label));
      return;
    }

    if (!hasSufficientWalletBalance) {
      setErrorMessage(
        getTreasuryFundingMessage({
          networkLabel: sourceOption.label,
          availableAmount: transferWallet.balance?.amount || "0",
          symbol: transferWallet.balance?.symbol || tokenSymbol,
          walletAddress: transferWallet.walletAddress,
          requestedAmount: amount,
        })
      );
      return;
    }

    if (!canSubmit) {
      setErrorMessage(
        "Enter a valid amount and destination wallet before starting the transfer."
      );
      return;
    }

    setErrorMessage(null);
    setIsReviewDialogOpen(true);
  }

  async function submitBridge() {
    if (!transferWallet) {
      setErrorMessage(getTreasurySetupMessage(sourceOption.label));
      setIsReviewDialogOpen(false);
      return;
    }

    const activeTransferWallet = transferWallet;

    setIsSubmitting(true);
    setTransfer(null);
    setErrorMessage(null);
    setIsReviewDialogOpen(false);

    try {
      const referenceId = `BRIDGE-${destinationChain}-${Date.now()}`;
      const completedTransfer = await createCircleTransfer({
        amount,
        blockchain: destinationChain,
        destinationAddress,
        referenceId,
        tokenAddress: destinationTokenAddress,
        walletId: activeTransferWallet.walletId || undefined,
        walletAddress: activeTransferWallet.walletAddress,
      });

      setTransfer(completedTransfer);
      setIsSuccessDialogOpen(true);
      toast({
        title: "Bridge settled",
        description: `${tokenSymbol} arrived on ${destinationOption.label}.`,
      });
      await refreshTransferWallet();
    } catch (error) {
      const message = getBridgeErrorMessage(error, {
        destinationLabel: destinationOption.label,
        sourceLabel: sourceOption.label,
      });
      setErrorMessage(message);
      toast({
        title: "Bridge transfer failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      void refreshTransferWallet();
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Bridge
          </h1>
          <p className="text-sm text-muted-foreground/70">
            Treasury-assisted Circle Bridge Kit flow for forwarding testnet USDC between Sepolia and Arc.
          </p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-border/40">
        <CardHeader className="relative overflow-hidden border-b border-border/30 pb-5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <CardTitle className="flex items-center gap-2 text-xl">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <Route className="h-4.5 w-4.5" />
            </div>
            Treasury-Assisted Bridge
          </CardTitle>
          <CardDescription>
            Burns USDC from the app treasury wallet on the source network and mints it to the destination address you choose.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                Treasury model
              </p>
              <p className="mt-2 text-sm text-muted-foreground/80">
                This bridge uses an app-owned Circle developer-controlled wallet on the source network. It is not your personal wallet, and only USDC is supported in this flow.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Destination network
                </label>
                <Select
                  value={destinationChain}
                  onValueChange={(value) =>
                    setDestinationChain(value as CircleTransferBlockchain)
                  }
                >
                  <SelectTrigger className="h-11 border-border/40 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINATION_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Source network
                </label>
                <div className="flex h-11 items-center rounded-md border border-border/40 bg-background/50 px-3 text-sm font-medium">
                  {sourceOption.label} · App treasury · USDC only
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Amount
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.000001"
                  placeholder="0.0"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-11 border-border/40 bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Destination wallet
                </label>
                <Input
                  placeholder="0x..."
                  value={destinationAddress}
                  onChange={(event) => setDestinationAddress(event.target.value)}
                  className="h-11 border-border/40 bg-background/50 font-mono text-xs"
                />
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            {transferWallet && treasuryWalletEmpty && !isPositiveDecimal(amount) ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Bridge requires USDC in the app treasury wallet. Please fund this wallet before bridging.
              </div>
            ) : null}

            {transferWallet && !hasSufficientWalletBalance && isPositiveDecimal(amount) ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {getTreasuryFundingMessage({
                  networkLabel: sourceOption.label,
                  availableAmount: transferWallet.balance?.amount || "0",
                  symbol: transferWallet.balance?.symbol || tokenSymbol,
                  walletAddress: transferWallet.walletAddress,
                  requestedAmount: amount,
                })}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="rounded-2xl border border-border/30 bg-background/40 px-4 py-3 text-sm text-muted-foreground/80">
                No Circle wallet popup appears in this flow. The bridge is executed by the app treasury wallet on the backend, so your confirmation happens in-app instead of through the Circle wallet signer.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={openBridgeReview}
                disabled={
                  !canSubmit ||
                  isSubmitting ||
                  isWalletLoading ||
                  isWalletBootstrapping
                }
                className="h-11 px-5"
              >
                {isSubmitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Route className="h-4 w-4" />
                )}
                {isSubmitting ? "Bridging with Circle..." : `Bridge ${tokenSymbol}`}
              </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    {APP_TREASURY_WALLET_TITLE}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    App-owned Circle developer-controlled wallet. This is not your personal wallet.
                  </p>
                </div>
                {isWalletLoading || isWalletBootstrapping ? (
                  <RefreshCw className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground/60" />
                ) : null}
              </div>

              {transferWallet ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Network</span>
                    <span className="font-medium">{sourceOption.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Asset</span>
                    <span className="font-medium">USDC only</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground/70">Address</span>
                    <span className="max-w-[11rem] break-all text-right font-mono text-xs">
                      {transferWallet.walletAddress}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Balance</span>
                    <span className="font-medium">
                      {formatWalletBalance(transferWallet, tokenSymbol)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Circle Wallet ID</span>
                    <span className="font-mono text-xs">
                      {shortenAddress(transferWallet.walletId)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground/70">
                  {walletStatusError ||
                    `No ${APP_TREASURY_WALLET_LABEL} is ready for ${sourceOption.label} yet. Initialize it below and fund it with ${tokenSymbol}.`}
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshTransferWallet()}
                  disabled={isWalletLoading || isWalletBootstrapping}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh treasury wallet
                </Button>
                {!transferWallet ? (
                  <Button
                    size="sm"
                    onClick={handleBootstrapWallet}
                    disabled={isWalletLoading || isWalletBootstrapping}
                    className="w-full"
                  >
                    {isWalletBootstrapping ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wallet className="h-4 w-4" />
                    )}
                    Initialize treasury wallet
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a
                    href="https://faucet.circle.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Droplet className="h-4 w-4" />
                    Open Circle faucet
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground/70">
                  Fund this wallet with testnet USDC before starting the bridge.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                Your destination wallets
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                These are your personal Circle wallets. The treasury wallet above belongs to the app.
              </p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">Arc Testnet</p>
                    <p className="font-mono text-xs text-muted-foreground/70">
                      {shortenAddress(arcWallet?.address)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">Ethereum Sepolia</p>
                    <p className="font-mono text-xs text-muted-foreground/70">
                      {shortenAddress(sepoliaWallet?.address)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                Transfer status
              </p>
              {transfer ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Status</span>
                    <span className="font-medium capitalize">{transfer.status}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Transfer ID</span>
                    <span className="font-mono text-xs">{shortenAddress(transfer.transferId)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Destination</span>
                    <span className="font-mono text-xs">{shortenAddress(transfer.destinationAddress)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Route</span>
                    <span className="font-medium">{sourceOption.label} to {destinationOption.label}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Provider</span>
                    <span className="font-medium">{transfer.provider || "Circle Bridge Kit"}</span>
                  </div>
                  {transfer.steps.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-border/30 bg-background/45 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                        CCTP steps
                      </p>
                      {transfer.steps.map((step) => (
                        <div key={`${transfer.transferId}-${step.name}`} className="rounded-xl border border-border/25 bg-background/50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{step.name}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                              {step.state}
                            </span>
                          </div>
                          {step.errorMessage ? (
                            <p className="mt-2 text-xs text-destructive">{step.errorMessage}</p>
                          ) : null}
                          {step.explorerUrl ? (
                            <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                              <a href={step.explorerUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                View {step.name}
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {transfer.txHash ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground/70">Latest tx</span>
                      <span className="font-mono text-xs">{shortenAddress(transfer.txHash)}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground/70">
                  No bridge submitted yet.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Current Behavior
            </CardTitle>
            <CardDescription>
              Live treasury-assisted bridge execution, not a placeholder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground/80">
            <p>This page now uses Circle Bridge Kit and the official Circle Wallets adapter on the server.</p>
            <p>It burns USDC from the app treasury wallet on the opposite chain and forwards the destination mint to the address you enter.</p>
            <p>It pre-fills the destination with your Arc or Sepolia Circle wallet when available.</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              Treasury Model
            </CardTitle>
            <CardDescription>
              Important constraints in the current flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground/80">
            <p>This is still a server-orchestrated bridge, so the source wallet is an app-owned Circle developer-controlled wallet on the backend.</p>
            <p>Only USDC is supported today, so EURC is intentionally hidden from this bridge experience.</p>
            <p>The selected route still needs a funded app treasury wallet before the bridge can settle.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="glass-card max-w-md overflow-hidden border-border/40 bg-background/95 p-0">
          <div className="relative overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
              <Route className="h-7 w-7" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl">Review bridge transfer</DialogTitle>
              <DialogDescription>
                This bridge uses the app treasury wallet on the backend, so no Circle wallet signature popup will appear from your personal wallet.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-border/40 bg-background/45 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground/70">Route</span>
                  <span className="font-medium">
                    {sourceOption.label} to {destinationOption.label}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground/70">Amount</span>
                  <span className="font-mono font-medium">
                    {amount || "0"} {tokenSymbol}
                  </span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground/70">Destination</span>
                  <span className="max-w-[12rem] break-all text-right font-mono font-medium">
                    {destinationAddress || "Unavailable"}
                  </span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3 text-sm">
                  <span className="text-muted-foreground/70">Treasury wallet</span>
                  <span className="max-w-[12rem] break-all text-right font-mono font-medium">
                    {transferWallet?.walletAddress || "Unavailable"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Continue if this destination and route are correct. The app treasury wallet will execute the bridge and the result will appear here after settlement.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsReviewDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    void submitBridge();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Route className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Submitting bridge..." : "Continue bridge"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
        <DialogContent className="glass-card max-w-md overflow-hidden border-border/40 bg-background/95 p-0">
          <div className="relative overflow-hidden p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-400/20">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-xl">Bridge settled successfully</DialogTitle>
              <DialogDescription>
                The app treasury wallet completed the bridge and Circle returned a successful result.
              </DialogDescription>
            </DialogHeader>

            {transfer ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-border/40 bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Route</span>
                    <span className="font-medium">
                      {sourceOption.label} to {destinationOption.label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Amount</span>
                    <span className="font-mono font-medium">
                      {transfer.amount} {tokenSymbol}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Destination</span>
                    <span className="max-w-[12rem] break-all text-right font-mono font-medium">
                      {transfer.destinationAddress || "Unavailable"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Transfer ID</span>
                    <span className="font-mono font-medium">
                      {shortenAddress(transfer.transferId)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Status</span>
                    <span className="font-medium capitalize">{transfer.status}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground/80">
                  No Circle wallet popup was required because this route is treasury-assisted. You can review the full transfer details in the status panel on the right.
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {latestExplorerStep?.explorerUrl ? (
                    <Button asChild className="flex-1">
                      <a href={latestExplorerStep.explorerUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        View {latestExplorerStep.name}
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
    </div>
  );
}