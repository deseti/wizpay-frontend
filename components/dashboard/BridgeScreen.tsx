"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
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
import { useAdaptivePolling } from "@/hooks/useAdaptivePolling";
import {
  bootstrapCircleTransferWallet,
  createCircleTransfer,
  getCircleTransferStatus,
  getCircleTransferWallet,
  TransferApiError,
  type CircleTransfer,
  type CircleTransferBlockchain,
  type CircleTransferStep,
  type CircleTransferWallet,
} from "@/lib/transfer-service";

const TRANSFER_WALLET_STORAGE_KEY = "wizpay-bridge-transfer-wallets";
const ACTIVE_TRANSFER_STORAGE_KEY = "wizpay-bridge-active-transfer";
const BRIDGE_POLL_INTERVAL_MS = 4_000;
const BRIDGE_LONG_RUNNING_MS = 120_000;
const BRIDGE_ESTIMATED_TIME_LABEL = "30-90 seconds";
const STEP_ORDER = ["burn", "attestation", "mint"] as const;
const DEFAULT_SOURCE_BLOCKCHAIN: CircleTransferBlockchain = "ETH-SEPOLIA";

type BridgeStepId = (typeof STEP_ORDER)[number];
type StoredTransferWallet = {
  walletId: string | null;
  walletAddress: string;
  walletSetId: string | null;
};
type StoredTransferWalletMap = Partial<
  Record<CircleTransferBlockchain, StoredTransferWallet>
>;

const DESTINATION_OPTIONS: Array<{
  id: CircleTransferBlockchain;
  label: string;
}> = [
  {
    id: "ARC-TESTNET",
    label: "Arc Testnet",
  },
  {
    id: "ETH-SEPOLIA",
    label: "Ethereum Sepolia",
  },
];

const APP_TREASURY_WALLET_TITLE = "Source Treasury Wallet";
const APP_TREASURY_WALLET_LABEL = "source treasury wallet";
const BRIDGE_ASSET_SYMBOL = "USDC";

const USDC_ADDRESS_BY_CHAIN: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": USDC_ADDRESS,
  "ETH-SEPOLIA": ETHEREUM_SEPOLIA_USDC_ADDRESS,
};

function getOptionByChain(chain: CircleTransferBlockchain) {
  return (
    DESTINATION_OPTIONS.find((option) => option.id === chain) ??
    DESTINATION_OPTIONS[0]
  );
}

function getOppositeBlockchain(
  blockchain: CircleTransferBlockchain
): CircleTransferBlockchain {
  return blockchain === "ARC-TESTNET" ? "ETH-SEPOLIA" : "ARC-TESTNET";
}

function normalizeBridgeStepId(value: string | undefined): BridgeStepId | null {
  if (value === "burn" || value === "attestation" || value === "mint") {
    return value;
  }

  return null;
}

function isTrackedTransfer(
  transfer: CircleTransfer | null
): transfer is CircleTransfer {
  return Boolean(
    transfer && (transfer.status === "pending" || transfer.status === "processing")
  );
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

    const parsedValue = JSON.parse(rawValue) as StoredTransferWalletMap;

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
    return;
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
    return;
  }
}

function getStoredTransferWallets(): StoredTransferWalletMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(TRANSFER_WALLET_STORAGE_KEY);

    return rawValue ? (JSON.parse(rawValue) as StoredTransferWalletMap) : {};
  } catch {
    return {};
  }
}

function getStoredActiveTransfer() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(ACTIVE_TRANSFER_STORAGE_KEY);

    return rawValue ? (JSON.parse(rawValue) as CircleTransfer) : null;
  } catch {
    return null;
  }
}

function setStoredActiveTransfer(transfer: CircleTransfer) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ACTIVE_TRANSFER_STORAGE_KEY,
      JSON.stringify(transfer)
    );
  } catch {
    return;
  }
}

function clearStoredActiveTransfer() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(ACTIVE_TRANSFER_STORAGE_KEY);
  } catch {
    return;
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
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

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
    transferError?.code === "CIRCLE_WALLET_ID_MISMATCH" ||
    transferError?.code === "CIRCLE_WALLET_CHAIN_MISMATCH" ||
    transferError?.code === "CIRCLE_BRIDGE_SOURCE_WALLET_CHAIN_MISMATCH"
  ) {
    return `The configured ${labels.sourceLabel} ${APP_TREASURY_WALLET_LABEL} does not match the selected route. Update the per-chain Circle wallet mapping before retrying.`;
  }

  if (transferError?.code === "CIRCLE_BRIDGE_SAME_CHAIN") {
    return "Bridge source and destination must be different networks.";
  }

  if (
    transferError?.code === "CIRCLE_ENTITY_SECRET_INVALID" ||
    transferError?.code === "CIRCLE_ENTITY_SECRET_NOT_REGISTERED" ||
    transferError?.code === "CIRCLE_ENTITY_SECRET_ROTATED"
  ) {
    return "The server can read Circle wallet sets, but signed write calls are being rejected. This usually means CIRCLE_ENTITY_SECRET does not match the Circle entity or project behind the current API key, or the secret was pasted with extra whitespace.";
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

  if (transferError?.code === "CIRCLE_BRIDGE_NOT_FOUND") {
    return "The last bridge session is no longer available on this server. Start a new bridge to resume live tracking.";
  }

  if (transferError?.code === "CIRCLE_BRIDGE_STORAGE_UNAVAILABLE") {
    return "Live bridge tracking is temporarily unavailable because Redis could not be read. The last known progress stays on screen and the bridge may still continue on-chain.";
  }

  if (transferError?.code === "CIRCLE_BRIDGE_REDIS_CONFIG_MISSING") {
    return "Live bridge tracking is unavailable because Redis is not configured on the server. The bridge may still continue on-chain, but automatic status updates are disabled.";
  }

  if (transferError?.code === "CIRCLE_BRIDGE_EXECUTION_FAILED") {
    const failedStep =
      details &&
      typeof details === "object" &&
      details.failedStep &&
      typeof details.failedStep === "object"
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

function getOrderedBridgeSteps(
  transfer: CircleTransfer,
  sourceLabel: string,
  destinationLabel: string
): CircleTransferStep[] {
  return STEP_ORDER.map((stepId) => {
    const step = transfer.steps.find((candidate) => candidate.id === stepId);

    if (step) {
      return step;
    }

    return {
      id: stepId,
      name:
        stepId === "burn"
          ? `Burn on ${sourceLabel}`
          : stepId === "mint"
            ? `Mint on ${destinationLabel}`
            : "Waiting for Circle attestation",
      state: "pending",
      txHash: null,
      explorerUrl: null,
      errorMessage: null,
    };
  });
}

function getCurrentStepId(
  transfer: CircleTransfer | null,
  steps: CircleTransferStep[]
): BridgeStepId | null {
  if (!transfer || steps.length === 0) {
    return null;
  }

  const failedStep = steps.find((step) => step.state === "error");

  if (failedStep) {
    return normalizeBridgeStepId(failedStep.id);
  }

  if (transfer.status === "settled") {
    return "mint";
  }

  const pendingStep = steps.find((step) => step.state === "pending");

  if (pendingStep) {
    return normalizeBridgeStepId(pendingStep.id);
  }

  const inFlightStep = steps.find(
    (step) => step.state !== "success" && step.state !== "noop"
  );

  if (inFlightStep) {
    return normalizeBridgeStepId(inFlightStep.id);
  }

  return normalizeBridgeStepId(steps[steps.length - 1]?.id);
}

function getTransferHeadline(
  transfer: CircleTransfer,
  currentStepName: string | undefined
) {
  if (transfer.status === "settled") {
    return "Bridge completed successfully";
  }

  if (transfer.status === "failed") {
    return "Bridge needs attention";
  }

  if (transfer.rawStatus === "attested") {
    return "Attestation received, mint is next";
  }

  if (transfer.rawStatus === "burned") {
    return "Burn confirmed, waiting for attestation";
  }

  return currentStepName || "Bridge submitted";
}

function getTransferStatusLabel(transfer: CircleTransfer) {
  if (transfer.status === "settled") {
    return "Completed";
  }

  if (transfer.status === "failed") {
    return "Failed";
  }

  if (transfer.rawStatus === "attested") {
    return "Minting";
  }

  if (transfer.rawStatus === "burned") {
    return "Awaiting attestation";
  }

  return transfer.status === "processing" ? "Processing" : "Queued";
}

function getStatusBadgeClass(transfer: CircleTransfer) {
  if (transfer.status === "settled") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  }

  if (transfer.status === "failed") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }

  if (transfer.rawStatus === "attested") {
    return "border-primary/25 bg-primary/10 text-primary";
  }

  return "border-amber-500/25 bg-amber-500/10 text-amber-300";
}

function getStepStatusLabel(
  step: CircleTransferStep,
  currentStepId: BridgeStepId | null,
  transferStatus: CircleTransfer["status"]
) {
  const stepId = normalizeBridgeStepId(step.id);

  if (step.state === "success") {
    return "Success";
  }

  if (step.state === "error") {
    return "Failed";
  }

  if (transferStatus === "settled" && stepId === "mint") {
    return "Success";
  }

  if (currentStepId && stepId === currentStepId) {
    return "In progress";
  }

  return "Pending";
}

function getLastUpdatedLabel(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function getLongRunningTransferMessage(
  transfer: CircleTransfer,
  currentStepId: BridgeStepId | null,
  labels: {
    destinationLabel: string;
    sourceLabel: string;
  }
) {
  if (transfer.status === "pending" && transfer.rawStatus === "queued") {
    return "This bridge has stayed queued longer than expected. If the source wallet balance already changed, this is likely an older tracking record that stopped updating before the latest Redis fix.";
  }

  if (transfer.rawStatus === "attested" || currentStepId === "mint") {
    return `Circle attestation is done. Mint is pending on ${labels.destinationLabel}. This last step can still take a few more minutes on testnet.`;
  }

  if (transfer.rawStatus === "burned" || currentStepId === "attestation") {
    return `Burn is already confirmed on ${labels.sourceLabel}. Circle is now waiting to issue the CCTP attestation before minting on ${labels.destinationLabel}. Testnet attestation can take several minutes.`;
  }

  if (currentStepId === "burn") {
    return `The source-chain burn is still being finalized on ${labels.sourceLabel}. After that, Circle will wait for attestation and then mint on ${labels.destinationLabel}.`;
  }

  return "Still processing on-chain. You can check back later.";
}

export function BridgeScreen() {
  const { arcWallet, sepoliaWallet } = useCircleWallet();
  const { toast } = useToast();
  const restoredTransferRef = useRef(false);
  const normalizedLegacyDefaultRef = useRef(false);
  const terminalNoticeRef = useRef<string | null>(null);

  const [destinationChain, setDestinationChain] = useState<CircleTransferBlockchain>(
    getOppositeBlockchain(DEFAULT_SOURCE_BLOCKCHAIN)
  );
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [transfer, setTransfer] = useState<CircleTransfer | null>(null);
  const [transferWallet, setTransferWallet] = useState<CircleTransferWallet | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletStatusError, setWalletStatusError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [isWalletBootstrapping, setIsWalletBootstrapping] = useState(false);
  const [isPollingTransfer, setIsPollingTransfer] = useState(false);
  const [isTrackingUnavailable, setIsTrackingUnavailable] = useState(false);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const tokenSymbol = BRIDGE_ASSET_SYMBOL;

  const destinationOption = useMemo(
    () => getOptionByChain(destinationChain),
    [destinationChain]
  );
  const sourceChain = getOppositeBlockchain(destinationChain);
  const sourceOption = useMemo(() => getOptionByChain(sourceChain), [sourceChain]);
  const treasuryWalletOption = useMemo(
    () =>
      transferWallet ? getOptionByChain(transferWallet.blockchain) : sourceOption,
    [transferWallet, sourceOption]
  );
  const transferDestinationOption = useMemo(
    () => (transfer ? getOptionByChain(transfer.blockchain) : destinationOption),
    [transfer, destinationOption]
  );
  const transferSourceOption = useMemo(
    () => (transfer ? getOptionByChain(transfer.sourceBlockchain) : sourceOption),
    [transfer, sourceOption]
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
  const isTransferActive = isTrackedTransfer(transfer);
  const pollTransferFnRef = useRef<(() => Promise<void>) | null>(null);
  const canSubmit =
    Boolean(destinationTokenAddress) &&
    isPositiveDecimal(amount) &&
    isValidAddress(destinationAddress) &&
    Boolean(transferWallet) &&
    hasSufficientWalletBalance &&
    !isTransferActive;
  const orderedSteps = useMemo(
    () =>
      transfer
        ? getOrderedBridgeSteps(
            transfer,
            transferSourceOption.label,
            transferDestinationOption.label
          )
        : [],
    [transfer, transferDestinationOption.label, transferSourceOption.label]
  );
  const currentStepId = useMemo(
    () => getCurrentStepId(transfer, orderedSteps),
    [orderedSteps, transfer]
  );
  const currentStep = orderedSteps.find(
    (step) => normalizeBridgeStepId(step.id) === currentStepId
  );
  const burnStep = orderedSteps.find((step) => step.id === "burn");
  const mintStep = orderedSteps.find((step) => step.id === "mint");
  const shouldShowLongRunningMessage = Boolean(
    transfer &&
      isTransferActive &&
      Date.now() - new Date(transfer.createdAt).getTime() > BRIDGE_LONG_RUNNING_MS
  );
  const longRunningTransferMessage = useMemo(
    () =>
      transfer
        ? getLongRunningTransferMessage(transfer, currentStepId, {
            destinationLabel: transferDestinationOption.label,
            sourceLabel: transferSourceOption.label,
          })
        : null,
    [
      currentStepId,
      transfer,
      transferDestinationOption.label,
      transferSourceOption.label,
    ]
  );

  useEffect(() => {
    if (restoredTransferRef.current) {
      return;
    }

    restoredTransferRef.current = true;

    const storedTransfer = getStoredActiveTransfer();

    if (!storedTransfer) {
      return;
    }

    // Don't restore stale terminal transfers - clear them instead
    if (storedTransfer.status === "settled" || storedTransfer.status === "failed") {
      clearStoredActiveTransfer();
      return;
    }

    setTransfer(storedTransfer);
    setDestinationChain(storedTransfer.blockchain);
    setAmount(storedTransfer.amount);
    setDestinationAddress(storedTransfer.destinationAddress || "");
  }, []);

  useEffect(() => {
    if (normalizedLegacyDefaultRef.current) {
      return;
    }

    if (!restoredTransferRef.current) {
      return;
    }

    normalizedLegacyDefaultRef.current = true;

    if (transfer || getStoredActiveTransfer()) {
      return;
    }

    if (destinationChain === "ETH-SEPOLIA") {
      setDestinationChain(getOppositeBlockchain(DEFAULT_SOURCE_BLOCKCHAIN));
    }
  }, [destinationChain, transfer]);

  useEffect(() => {
    if (isTransferActive) {
      return;
    }

    if (suggestedDestinationAddress) {
      setDestinationAddress(suggestedDestinationAddress);
      return;
    }

    setDestinationAddress("");
  }, [isTransferActive, suggestedDestinationAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadTransferWallet() {
      setIsWalletLoading(true);
      setTransferWallet((currentWallet) =>
        currentWallet?.blockchain === sourceChain ? currentWallet : null
      );

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
            error.code === "CIRCLE_WALLET_CONFIG_MISSING" ||
            error.code === "CIRCLE_WALLET_CHAIN_MISMATCH" ||
            error.code === "CIRCLE_WALLET_ID_MISMATCH")
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

  useEffect(() => {
    if (!transfer) {
      return;
    }

    setStoredActiveTransfer(transfer);
  }, [transfer]);

  useEffect(() => {
    if (!transfer?.transferId || !isTransferActive || isTrackingUnavailable) {
      setIsPollingTransfer(false);
      return;
    }

    const activeTransferId = transfer.transferId;
    let cancelled = false;

    async function pollTransfer() {
      setIsPollingTransfer(true);

      try {
        const latestTransfer = await getCircleTransferStatus(activeTransferId);

        if (cancelled) {
          return;
        }

        setTransfer(latestTransfer);
        setStoredActiveTransfer(latestTransfer);
        setIsTrackingUnavailable(false);
        setErrorMessage(null);

        if (latestTransfer.status === "settled") {
          const terminalKey = `${latestTransfer.transferId}:settled`;

          if (terminalNoticeRef.current !== terminalKey) {
            terminalNoticeRef.current = terminalKey;
            setIsSuccessDialogOpen(true);
            clearStoredActiveTransfer();
            toast({
              title: "Bridge completed",
              description: `${tokenSymbol} arrived on ${transferDestinationOption.label}.`,
            });
            void refreshTransferWallet();
          }
        }

        if (latestTransfer.status === "failed") {
          const terminalKey = `${latestTransfer.transferId}:failed`;

          if (terminalNoticeRef.current !== terminalKey) {
            terminalNoticeRef.current = terminalKey;
            clearStoredActiveTransfer();
            toast({
              title: "Bridge transfer failed",
              description:
                latestTransfer.errorReason ||
                `Circle could not finish the ${transferSourceOption.label} to ${transferDestinationOption.label} bridge.`,
              variant: "destructive",
            });
            void refreshTransferWallet();
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (
          error instanceof TransferApiError &&
          error.code === "CIRCLE_BRIDGE_NOT_FOUND"
        ) {
          setIsTrackingUnavailable(true);
          setErrorMessage(
            "Live Redis tracking for this bridge is no longer available. The last known progress stays visible here, but automatic updates have stopped."
          );
          return;
        }

        setErrorMessage(
          getBridgeErrorMessage(error, {
            destinationLabel: transferDestinationOption.label,
            sourceLabel: transferSourceOption.label,
          })
        );
      } finally {
        if (!cancelled) {
          setIsPollingTransfer(false);
        }
      }
    }

    pollTransferFnRef.current = pollTransfer;
    void pollTransfer();

    return () => {
      cancelled = true;
      pollTransferFnRef.current = null;
    };
  }, [
    isTrackingUnavailable,
    isTransferActive,
    toast,
    tokenSymbol,
    transfer?.transferId,
    transferDestinationOption.label,
    transferSourceOption.label,
  ]);

  useAdaptivePolling({
    onPoll: () => void pollTransferFnRef.current?.(),
    activeInterval: BRIDGE_POLL_INTERVAL_MS,
    idleInterval: 15_000,
    idleAfter: 60_000,
    enabled: Boolean(transfer?.transferId) && isTransferActive && !isTrackingUnavailable,
  });

  async function refreshTransferWallet() {
    setIsWalletLoading(true);
    setTransferWallet((currentWallet) =>
      currentWallet?.blockchain === sourceChain ? currentWallet : null
    );

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
          error.code === "CIRCLE_WALLET_CONFIG_MISSING" ||
          error.code === "CIRCLE_WALLET_CHAIN_MISMATCH" ||
          error.code === "CIRCLE_WALLET_ID_MISMATCH")
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
    if (isTransferActive) {
      setErrorMessage(
        "A bridge is already running. You can leave this page and come back later while tracking continues in the background."
      );
      return;
    }

    if (!transferWallet) {
      setErrorMessage(getTreasurySetupMessage(sourceOption.label));
      return;
    }

    if (transferWallet.blockchain !== sourceChain) {
      setErrorMessage(
        `The displayed ${APP_TREASURY_WALLET_LABEL} does not match ${sourceOption.label}. Refresh the treasury wallet and try again.`
      );
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
        "Enter a valid amount and destination wallet before starting the bridge."
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

    if (transferWallet.blockchain !== sourceChain) {
      setErrorMessage(
        `The displayed ${APP_TREASURY_WALLET_LABEL} does not match ${sourceOption.label}. Refresh the treasury wallet and try again.`
      );
      setIsReviewDialogOpen(false);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setIsReviewDialogOpen(false);
    setIsSuccessDialogOpen(false);
    setIsTrackingUnavailable(false);

    try {
      const referenceId = `BRIDGE-${destinationChain}-${Date.now()}`;
      const queuedTransfer = await createCircleTransfer({
        amount,
        blockchain: destinationChain,
        destinationAddress,
        referenceId,
        tokenAddress: destinationTokenAddress,
        walletId: transferWallet.walletId || undefined,
        walletAddress: transferWallet.walletAddress,
      });

      terminalNoticeRef.current = null;
      setTransfer(queuedTransfer);
      setStoredActiveTransfer(queuedTransfer);
      setDestinationChain(queuedTransfer.blockchain);
      setAmount(queuedTransfer.amount);
      setDestinationAddress(queuedTransfer.destinationAddress || destinationAddress);
      toast({
        title: "Bridge started",
        description: `Estimated time ${BRIDGE_ESTIMATED_TIME_LABEL}. You can leave this page and come back later while Circle finishes the bridge.`,
      });
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
            Treasury-assisted Circle CCTP flow for forwarding testnet USDC
            between Sepolia and Arc.
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
            Choose the source network for the treasury wallet. Circle burns on
            that chain first, then mints on the opposite destination network.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                Treasury model
              </p>
              <p className="mt-2 text-sm text-muted-foreground/80">
                This bridge uses an app-owned Circle developer-controlled wallet
                on the selected source network. It is not your personal wallet,
                and only USDC is supported in this flow.
              </p>
            </div>

            {transfer ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                      Bridge progress
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">
                      {getTransferHeadline(transfer, currentStep?.name)}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground/80">
                      Estimated time {BRIDGE_ESTIMATED_TIME_LABEL}. You can leave
                      this page and tracking will resume when you return.
                    </p>
                  </div>
                  <div
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusBadgeClass(
                      transfer
                    )}`}
                  >
                    {isPollingTransfer && isTransferActive ? (
                      <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : transfer.status === "settled" ? (
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                    ) : transfer.status === "failed" ? (
                      <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <Clock3 className="mr-2 h-3.5 w-3.5" />
                    )}
                    {getTransferStatusLabel(transfer)}
                  </div>
                </div>

                {shouldShowLongRunningMessage ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    {longRunningTransferMessage}
                  </div>
                ) : null}

                {isTrackingUnavailable ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                    Redis tracking expired or was removed, so live polling has
                    stopped. The last known burn, attestation, and mint status
                    remains visible here while the bridge may still continue
                    on-chain.
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  {orderedSteps.map((step) => {
                    const stepId = normalizeBridgeStepId(step.id);
                    const isCurrentStep =
                      Boolean(stepId && currentStepId && stepId === currentStepId) &&
                      isTransferActive;
                    const statusLabel = getStepStatusLabel(
                      step,
                      currentStepId,
                      transfer.status
                    );

                    return (
                      <div
                        key={`${transfer.transferId}-${step.id}`}
                        className={`rounded-2xl border p-4 ${
                          step.state === "success"
                            ? "border-emerald-500/25 bg-emerald-500/5"
                            : step.state === "error"
                              ? "border-destructive/25 bg-destructive/5"
                              : isCurrentStep
                                ? "border-primary/25 bg-primary/5"
                                : "border-border/30 bg-background/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                                step.state === "success"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : step.state === "error"
                                    ? "bg-destructive/10 text-destructive"
                                    : isCurrentStep
                                      ? "bg-primary/15 text-primary"
                                      : "bg-background/60 text-muted-foreground/70"
                              }`}
                            >
                              {step.state === "success" ? (
                                <CheckCircle2 className="h-4.5 w-4.5" />
                              ) : step.state === "error" ? (
                                <AlertTriangle className="h-4.5 w-4.5" />
                              ) : isCurrentStep ? (
                                <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                              ) : (
                                <Clock3 className="h-4.5 w-4.5" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{step.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground/70">
                                {statusLabel}
                              </p>
                              {step.txHash ? (
                                <p className="mt-2 font-mono text-xs text-muted-foreground/80">
                                  {shortenAddress(step.txHash)}
                                </p>
                              ) : null}
                              {step.errorMessage ? (
                                <p className="mt-2 text-xs text-destructive">
                                  {step.errorMessage}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {step.explorerUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={step.explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                                View tx
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/30 bg-background/40 p-4 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                      Transfer ID
                    </p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground/80">
                      {transfer.transferId}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/30 bg-background/40 p-4 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                      Route
                    </p>
                    <p className="mt-2 font-medium text-foreground">
                      {transferSourceOption.label} to {transferDestinationOption.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Last updated {getLastUpdatedLabel(transfer.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  Source network
                </label>
                <Select
                  value={sourceChain}
                  onValueChange={(value) =>
                    setDestinationChain(
                      getOppositeBlockchain(value as CircleTransferBlockchain)
                    )
                  }
                  disabled={isTransferActive || isSubmitting}
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
                  Destination network
                </label>
                <div className="flex h-11 items-center rounded-md border border-border/40 bg-background/50 px-3 text-sm font-medium">
                  {destinationOption.label} · Recipient wallet
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/30 bg-background/35 px-4 py-3 text-sm text-muted-foreground/80">
              Route: burn from the {sourceOption.label} source treasury wallet,
              then mint to your destination address on {destinationOption.label}.
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
                  disabled={isTransferActive || isSubmitting}
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
                  disabled={isTransferActive || isSubmitting}
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
                Bridge requires USDC in the selected {sourceOption.label} source
                treasury wallet. If your funded wallet is on the other network,
                switch the source network above before bridging.
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
                No Circle wallet popup appears in this flow. The bridge is
                executed by the selected source treasury wallet on the backend,
                so your confirmation happens in-app instead of through the Circle
                wallet signer.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  {isSubmitting ? "Starting bridge..." : `Bridge ${tokenSymbol}`}
                </Button>
                {isTransferActive ? (
                  <p className="text-sm text-muted-foreground/70">
                    A bridge is already running. You can leave this page and come
                    back later while tracking continues.
                  </p>
                ) : null}
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
                    App-owned Circle developer-controlled wallet on the selected
                    source network. This is not your personal wallet.
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
                    <span className="font-medium">{treasuryWalletOption.label}</span>
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
                These are your personal Circle wallets. The treasury wallet above
                belongs to the app.
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
                    <span className="font-medium">
                      {getTransferStatusLabel(transfer)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Route</span>
                    <span className="font-medium">
                      {transferSourceOption.label} to {transferDestinationOption.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Transfer ID</span>
                    <span className="font-mono text-xs">
                      {shortenAddress(transfer.transferId)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Destination</span>
                    <span className="font-mono text-xs">
                      {shortenAddress(transfer.destinationAddress)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Provider</span>
                    <span className="font-medium">
                      {transfer.provider || "Circle Bridge Kit"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground/70">Last updated</span>
                    <span className="font-medium">
                      {getLastUpdatedLabel(transfer.updatedAt)}
                    </span>
                  </div>

                  {burnStep?.explorerUrl || mintStep?.explorerUrl ? (
                    <div className="grid gap-2">
                      {burnStep?.explorerUrl ? (
                        <Button asChild size="sm" variant="outline" className="w-full">
                          <a
                            href={burnStep.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View burn tx
                          </a>
                        </Button>
                      ) : null}
                      {mintStep?.explorerUrl ? (
                        <Button asChild size="sm" variant="outline" className="w-full">
                          <a
                            href={mintStep.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View mint tx
                          </a>
                        </Button>
                      ) : null}
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
              <Route className="h-4 w-4 text-primary" />
              CCTP flow
            </CardTitle>
            <CardDescription>
              The bridge runs through three Circle-controlled stages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground/80">
            <p>1. Burn USDC on the source chain treasury wallet.</p>
            <p>2. Wait for Circle attestation.</p>
            <p>3. Mint USDC on the destination chain for the wallet you entered.</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              Tracking
            </CardTitle>
            <CardDescription>
              This bridge is non-blocking by design.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground/80">
            <p>Status refreshes every 4 seconds while a bridge is pending.</p>
            <p>The latest transfer is stored locally so the page can resume after refresh.</p>
            <p>If the flow runs longer than 2 minutes, the UI tells the user it is still processing on-chain.</p>
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
                This bridge uses the selected source treasury wallet on the
                backend, so no Circle wallet signature popup will appear from
                your personal wallet.
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
                  <span className="text-muted-foreground/70">
                    Source treasury wallet
                  </span>
                  <span className="max-w-[12rem] break-all text-right font-mono font-medium">
                    {transferWallet?.walletAddress || "Unavailable"}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Circle burn, attestation, and mint can take a while. The progress
                tracker will keep updating after you submit, and you can leave the
                page at any time.
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
                  {isSubmitting ? "Starting bridge..." : "Start bridge"}
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
              <DialogTitle className="text-xl">Bridge completed</DialogTitle>
              <DialogDescription>
                Circle finished the bridge and the destination mint is confirmed.
              </DialogDescription>
            </DialogHeader>

            {transfer ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-border/40 bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground/70">Route</span>
                    <span className="font-medium">
                      {transferSourceOption.label} to {transferDestinationOption.label}
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
                    <span className="font-mono text-xs">
                      {shortenAddress(transfer.transferId)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2">
                  {burnStep?.explorerUrl ? (
                    <Button asChild variant="outline" className="w-full">
                      <a
                        href={burnStep.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View burn tx
                      </a>
                    </Button>
                  ) : null}
                  {mintStep?.explorerUrl ? (
                    <Button asChild variant="outline" className="w-full">
                      <a
                        href={mintStep.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View mint tx
                      </a>
                    </Button>
                  ) : null}
                </div>

                <Button className="w-full" onClick={() => {
                  setIsSuccessDialogOpen(false);
                  clearStoredActiveTransfer();
                  setTransfer(null);
                  setAmount("");
                  setDestinationAddress("");
                  setErrorMessage(null);
                  terminalNoticeRef.current = null;
                }}>
                  Start New Bridge
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
