import { randomUUID } from "node:crypto";

import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { BridgeChain } from "@circle-fin/bridge-kit/chains";

import {
  CircleTransferError,
  getTransferWallet,
  type CircleTransferBlockchain,
  type CircleTransferWallet,
} from "@/lib/server/circle-transfer";

type BridgeExecutionResult = Awaited<ReturnType<BridgeKit["bridge"]>>;
type BridgeExecutionStep = BridgeExecutionResult["steps"][number];

export interface CircleBridgeStepRecord {
  name: string;
  state: "pending" | "success" | "error" | "noop";
  txHash: string | null;
  explorerUrl: string | null;
  errorMessage: string | null;
  forwarded?: boolean;
  batched?: boolean;
}

export interface CircleBridgeTransferRecord {
  transferId: string;
  status: "pending" | "processing" | "settled" | "failed";
  rawStatus: string;
  txHash: string | null;
  walletId: string | null;
  walletAddress: string | null;
  sourceAddress: string | null;
  sourceBlockchain: CircleTransferBlockchain;
  destinationAddress: string | null;
  amount: string;
  tokenAddress: string;
  blockchain: CircleTransferBlockchain;
  provider: string | null;
  referenceId: string;
  createdAt: string;
  updatedAt: string;
  errorReason: string | null;
  steps: CircleBridgeStepRecord[];
}

interface CreateCircleBridgeTransferInput {
  destinationAddress: string;
  amount: string;
  referenceId?: string;
  tokenAddress?: string;
  walletId?: string;
  walletAddress?: string;
  blockchain?: CircleTransferBlockchain;
}

interface CircleBridgeConfig {
  circleApiKey: string;
  circleEntitySecret: string;
  circleWalletsBaseUrl: string;
  transferSpeed: "FAST" | "SLOW";
}

const BRIDGE_RESULTS = new Map<string, CircleBridgeTransferRecord>();

const BRIDGE_CHAIN_BY_TRANSFER_CHAIN: Record<
  CircleTransferBlockchain,
  BridgeChain
> = {
  "ARC-TESTNET": BridgeChain.Arc_Testnet,
  "ETH-SEPOLIA": BridgeChain.Ethereum_Sepolia,
};

const USDC_TOKEN_BY_CHAIN: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": "0x3600000000000000000000000000000000000000",
  "ETH-SEPOLIA": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export async function createCircleBridgeTransfer(
  input: CreateCircleBridgeTransferInput
): Promise<CircleBridgeTransferRecord> {
  const destinationBlockchain = normalizeBlockchain(input.blockchain);
  const sourceBlockchain = getSourceBlockchain(destinationBlockchain);
  const referenceId =
    normalizeOptionalString(input.referenceId) ||
    `BRIDGE-${destinationBlockchain}-${Date.now()}`;
  const normalizedAmount = normalizeAmount(input.amount);
  const destinationAddress = normalizeDestinationAddress(input.destinationAddress);
  const expectedTokenAddress = USDC_TOKEN_BY_CHAIN[destinationBlockchain];
  const requestedTokenAddress = normalizeOptionalString(input.tokenAddress);

  if (
    requestedTokenAddress &&
    requestedTokenAddress.toLowerCase() !== expectedTokenAddress.toLowerCase()
  ) {
    throw new CircleTransferError(
      "Official Arc bridge flows only support USDC. Switch the bridge token back to USDC before retrying.",
      400,
      "CIRCLE_BRIDGE_USDC_ONLY",
      {
        destinationBlockchain,
        expectedTokenAddress,
        requestedTokenAddress,
      }
    );
  }

  const sourceTokenAddress = USDC_TOKEN_BY_CHAIN[sourceBlockchain];
  const sourceWallet = await getTransferWallet({
    blockchain: sourceBlockchain,
    tokenAddress: sourceTokenAddress,
    walletId: normalizeOptionalString(input.walletId),
    walletAddress: normalizeOptionalString(input.walletAddress),
  });

  if (sourceWallet.blockchain !== sourceBlockchain) {
    throw new CircleTransferError(
      `The selected Circle wallet is on ${sourceWallet.blockchain}, but bridging to ${destinationBlockchain} requires a funded source wallet on ${sourceBlockchain}.`,
      409,
      "CIRCLE_BRIDGE_SOURCE_WALLET_CHAIN_MISMATCH",
      {
        destinationBlockchain,
        expectedSourceBlockchain: sourceBlockchain,
        walletAddress: sourceWallet.walletAddress,
        walletId: sourceWallet.walletId,
        walletBlockchain: sourceWallet.blockchain,
      }
    );
  }

  assertSourceWalletHasSufficientUsdc(sourceWallet, normalizedAmount);

  const { adapter, kit, config } = createBridgeRuntime();
  const createdAt = new Date().toISOString();
  const transferId = randomUUID();
  const bridgeParams = {
    from: {
      adapter,
      chain: BRIDGE_CHAIN_BY_TRANSFER_CHAIN[sourceBlockchain],
      address: sourceWallet.walletAddress,
    },
    to: {
      chain: BRIDGE_CHAIN_BY_TRANSFER_CHAIN[destinationBlockchain],
      recipientAddress: destinationAddress,
      useForwarder: true as const,
    },
    amount: normalizedAmount,
    token: "USDC" as const,
    config: {
      transferSpeed: config.transferSpeed,
    },
  };

  let bridgeResult: BridgeExecutionResult;

  try {
    bridgeResult = await kit.bridge(bridgeParams);
  } catch (error) {
    throw toCircleBridgeError(error, {
      destinationAddress,
      destinationBlockchain,
      sourceBlockchain,
      sourceWallet,
    });
  }

  if (bridgeResult.state !== "success") {
    throw bridgeResultToError(bridgeResult, {
      destinationAddress,
      destinationBlockchain,
      referenceId,
      sourceBlockchain,
      sourceWallet,
      transferId,
    });
  }

  const record: CircleBridgeTransferRecord = {
    transferId,
    status: "settled",
    rawStatus: bridgeResult.state,
    txHash: getLatestTxHash(bridgeResult.steps),
    walletId: sourceWallet.walletId,
    walletAddress: sourceWallet.walletAddress,
    sourceAddress: sourceWallet.walletAddress,
    sourceBlockchain,
    destinationAddress,
    amount: normalizedAmount,
    tokenAddress: expectedTokenAddress,
    blockchain: destinationBlockchain,
    provider: bridgeResult.provider || null,
    referenceId,
    createdAt,
    updatedAt: new Date().toISOString(),
    errorReason: null,
    steps: bridgeResult.steps.map(toStepRecord),
  };

  BRIDGE_RESULTS.set(transferId, record);

  return record;
}

export async function getCircleBridgeStatus(
  transferId: string
): Promise<CircleBridgeTransferRecord> {
  const record = BRIDGE_RESULTS.get(transferId);

  if (!record) {
    throw new CircleTransferError(
      `Bridge transfer ${transferId} was not found in the local server session. Submit the bridge again to recreate a live result.`,
      404,
      "CIRCLE_BRIDGE_NOT_FOUND"
    );
  }

  return record;
}

function createBridgeRuntime() {
  const config = getBridgeConfig();

  if (!config.circleApiKey) {
    throw new CircleTransferError(
      "CIRCLE_API_KEY is not configured for the official Circle Bridge Kit flow.",
      503,
      "CIRCLE_API_KEY_MISSING"
    );
  }

  if (!config.circleEntitySecret) {
    throw new CircleTransferError(
      "CIRCLE_ENTITY_SECRET is not configured for the official Circle Bridge Kit flow.",
      503,
      "CIRCLE_ENTITY_SECRET_MISSING"
    );
  }

  if (!/^[0-9a-f]{64}$/.test(config.circleEntitySecret)) {
    throw new CircleTransferError(
      "The official Circle Bridge Kit expects the raw 64-character lowercase entity secret. The current CIRCLE_ENTITY_SECRET looks like a recovery file or ciphertext, not the original secret generated during entity-secret setup.",
      503,
      "CIRCLE_ENTITY_SECRET_FORMAT_INVALID",
      {
        actualLength: config.circleEntitySecret.length,
        containsBase64Characters: /[+/=]/.test(config.circleEntitySecret),
        expectedFormat: "64 lowercase hex characters",
      }
    );
  }

  try {
    return {
      adapter: createCircleWalletsAdapter({
        apiKey: config.circleApiKey,
        entitySecret: config.circleEntitySecret,
        baseUrl: config.circleWalletsBaseUrl,
      }),
      kit: new BridgeKit(),
      config,
    };
  } catch (error) {
    throw toCircleBridgeError(error, {});
  }
}

function getBridgeConfig(): CircleBridgeConfig {
  const rawCircleApiBaseUrl =
    normalizeOptionalString(process.env.CIRCLE_API_BASE_URL) ||
    normalizeOptionalString(process.env.CIRCLE_BASE_URL);
  const normalizedCircleWalletsBaseUrl = (
    normalizeOptionalString(process.env.CIRCLE_WALLETS_BASE_URL) ||
    rawCircleApiBaseUrl ||
    "https://api.circle.com"
  ).replace(/\/v1\/?$/, "");
  const requestedTransferSpeed =
    normalizeOptionalString(process.env.CIRCLE_BRIDGE_TRANSFER_SPEED) || "FAST";

  return {
    circleApiKey: normalizeOptionalString(process.env.CIRCLE_API_KEY) || "",
    circleEntitySecret:
      normalizeOptionalString(process.env.CIRCLE_ENTITY_SECRET) || "",
    circleWalletsBaseUrl: normalizedCircleWalletsBaseUrl,
    transferSpeed:
      requestedTransferSpeed.toUpperCase() === "SLOW" ? "SLOW" : "FAST",
  };
}

function getSourceBlockchain(
  destinationBlockchain: CircleTransferBlockchain
): CircleTransferBlockchain {
  return destinationBlockchain === "ARC-TESTNET"
    ? "ETH-SEPOLIA"
    : "ARC-TESTNET";
}

function normalizeBlockchain(
  blockchain: string | undefined
): CircleTransferBlockchain {
  const normalizedBlockchain = (blockchain || "ETH-SEPOLIA").toUpperCase();

  if (
    normalizedBlockchain === "ARC-TESTNET" ||
    normalizedBlockchain === "ETH-SEPOLIA"
  ) {
    return normalizedBlockchain;
  }

  throw new CircleTransferError(
    `Unsupported bridge destination blockchain ${blockchain}.`,
    400,
    "CIRCLE_TRANSFER_UNSUPPORTED_BLOCKCHAIN"
  );
}

function normalizeAmount(amount: string): string {
  const trimmedAmount = amount.trim();
  const numericAmount = Number(trimmedAmount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new CircleTransferError(
      "Amount must be a positive decimal string.",
      400,
      "CIRCLE_TRANSFER_INVALID_AMOUNT"
    );
  }

  return trimmedAmount;
}

function normalizeDestinationAddress(address: string): string {
  const normalizedAddress = address.trim();

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    throw new CircleTransferError(
      "Destination wallet must be a valid EVM address.",
      400,
      "CIRCLE_TRANSFER_INVALID_DESTINATION"
    );
  }

  return normalizedAddress;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function assertSourceWalletHasSufficientUsdc(
  wallet: CircleTransferWallet,
  amount: string
) {
  const availableAmount = Number(wallet.balance?.amount || "0");
  const requiredAmount = Number(amount);

  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
    return;
  }

  if (Number.isFinite(availableAmount) && availableAmount >= requiredAmount) {
    return;
  }

  throw new CircleTransferError(
    `App treasury wallet ${wallet.walletAddress} only has ${wallet.balance?.amount || "0"} ${wallet.balance?.symbol || "USDC"} on ${wallet.blockchain}. Fund it before retrying the bridge.`,
    409,
    "CIRCLE_TRANSFER_INSUFFICIENT_BALANCE",
    {
      availableAmount: wallet.balance?.amount || "0",
      requiredAmount: amount,
      walletAddress: wallet.walletAddress,
      walletId: wallet.walletId,
      blockchain: wallet.blockchain,
      tokenAddress: wallet.tokenAddress,
      symbol: wallet.balance?.symbol || "USDC",
    }
  );
}

function toStepRecord(step: BridgeExecutionStep): CircleBridgeStepRecord {
  return {
    name: step.name,
    state: step.state,
    txHash: step.txHash || null,
    explorerUrl: step.explorerUrl || null,
    errorMessage: step.errorMessage || null,
    ...(typeof step.forwarded === "boolean" ? { forwarded: step.forwarded } : {}),
    ...(typeof step.batched === "boolean" ? { batched: step.batched } : {}),
  };
}

function getLatestTxHash(steps: BridgeExecutionStep[]): string | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (step?.txHash) {
      return step.txHash;
    }
  }

  return null;
}

function bridgeResultToError(
  bridgeResult: BridgeExecutionResult,
  context: {
    destinationAddress: string;
    destinationBlockchain: CircleTransferBlockchain;
    referenceId: string;
    sourceBlockchain: CircleTransferBlockchain;
    sourceWallet: CircleTransferWallet;
    transferId: string;
  }
) {
  const failedStep =
    bridgeResult.steps.find((step) => step.state === "error") ||
    bridgeResult.steps[bridgeResult.steps.length - 1] ||
    null;
  const message =
    failedStep?.errorMessage ||
    `Circle Bridge Kit returned ${bridgeResult.state} for this route.`;

  return new CircleTransferError(
    message,
    502,
    "CIRCLE_BRIDGE_EXECUTION_FAILED",
    {
      transferId: context.transferId,
      referenceId: context.referenceId,
      provider: bridgeResult.provider,
      sourceAddress: context.sourceWallet.walletAddress,
      sourceBlockchain: context.sourceBlockchain,
      destinationAddress: context.destinationAddress,
      destinationBlockchain: context.destinationBlockchain,
      failedStep: failedStep ? toStepRecord(failedStep) : null,
      steps: bridgeResult.steps.map(toStepRecord),
    }
  );
}

function toCircleBridgeError(
  error: unknown,
  context: Partial<{
    destinationAddress: string;
    destinationBlockchain: CircleTransferBlockchain;
    sourceBlockchain: CircleTransferBlockchain;
    sourceWallet: CircleTransferWallet;
  }>
) {
  if (error instanceof CircleTransferError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Circle bridge failed.";
  const loweredMessage = message.toLowerCase();

  if (loweredMessage.includes("64") && loweredMessage.includes("entity")) {
    return new CircleTransferError(
      "Circle Bridge Kit rejected the configured entity secret format. Use the original 64-character lowercase entity secret, not the recovery file contents or encrypted ciphertext.",
      503,
      "CIRCLE_ENTITY_SECRET_FORMAT_INVALID",
      {
        message,
      }
    );
  }

  if (loweredMessage.includes("forwarder") && loweredMessage.includes("supported")) {
    return new CircleTransferError(
      "This bridge route does not support Circle Forwarder yet. Use a supported testnet pair or disable the bridge action until the route is enabled upstream.",
      503,
      "CIRCLE_BRIDGE_FORWARDER_UNAVAILABLE",
      {
        message,
        sourceBlockchain: context.sourceBlockchain || null,
        destinationBlockchain: context.destinationBlockchain || null,
      }
    );
  }

  if (loweredMessage.includes("usdc") && loweredMessage.includes("only")) {
    return new CircleTransferError(
      "Circle Bridge Kit only supports USDC for this official Arc bridge flow.",
      400,
      "CIRCLE_BRIDGE_USDC_ONLY",
      {
        message,
      }
    );
  }

  return new CircleTransferError(
    message,
    502,
    "CIRCLE_BRIDGE_RUNTIME_ERROR",
    {
      destinationAddress: context.destinationAddress || null,
      destinationBlockchain: context.destinationBlockchain || null,
      sourceAddress: context.sourceWallet?.walletAddress || null,
      sourceBlockchain: context.sourceBlockchain || null,
      sourceWalletId: context.sourceWallet?.walletId || null,
    }
  );
}