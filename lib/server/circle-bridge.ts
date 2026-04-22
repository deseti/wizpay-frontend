import { randomUUID } from "node:crypto";

import type { ChainDefinition } from "@circle-fin/app-kit";
import { ArcTestnet, EthereumSepolia } from "@circle-fin/app-kit/chains";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { BridgeChain } from "@circle-fin/bridge-kit/chains";
import { http as circleWalletsHttp } from "@circle-fin/usdckit/providers/circle-wallets";
import { createPublicClient, createWalletClient, http } from "viem";

import { getRedisClient } from "@/lib/redis";
import {
  CircleTransferError,
  getTransferWallet,
  type CircleTransferBlockchain,
  type CircleTransferWallet,
} from "@/lib/server/circle-transfer";

type BridgeExecutionResult = Awaited<ReturnType<BridgeKit["bridge"]>>;
type BridgeExecutionStep = BridgeExecutionResult["steps"][number];
type CircleBridgeStepId = "burn" | "attestation" | "mint";
type CircleBridgeTransferStage =
  | "pending"
  | "burning"
  | "attesting"
  | "minting"
  | "completed"
  | "failed";

export interface CircleBridgeStepRecord {
  id: CircleBridgeStepId;
  name: string;
  state: "pending" | "success" | "error" | "noop";
  txHash: string | null;
  explorerUrl: string | null;
  errorMessage: string | null;
  forwarded?: boolean;
  batched?: boolean;
}

export interface CircleBridgeTransferRecord {
  id: string;
  transferId: string;
  stage: CircleBridgeTransferStage;
  status: "pending" | "processing" | "settled" | "failed";
  rawStatus: string;
  txHash: string | null;
  txHashBurn: string | null;
  txHashMint: string | null;
  sourceWalletId: string | null;
  walletId: string | null;
  walletAddress: string | null;
  sourceAddress: string | null;
  sourceChain: CircleTransferBlockchain;
  sourceBlockchain: CircleTransferBlockchain;
  destinationChain: CircleTransferBlockchain;
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

interface PendingCircleBridgeExecution {
  amount: string;
  createdAt: string;
  destinationAddress: string;
  destinationBlockchain: CircleTransferBlockchain;
  referenceId: string;
  sourceBlockchain: CircleTransferBlockchain;
  sourceWallet: CircleTransferWallet;
  tokenAddress: string;
  transferId: string;
}

interface QueuedCircleBridgeTransfer {
  execution: PendingCircleBridgeExecution;
  record: CircleBridgeTransferRecord;
}

const BRIDGE_REDIS_KEY_PREFIX = "bridge:";
const DEFAULT_BRIDGE_REDIS_TTL_SECONDS = 1_800;
const DEFAULT_BRIDGE_TX_WAIT_TIMEOUT_MS = 600_000;
const DEFAULT_BRIDGE_RPC_POLLING_INTERVAL_MS = 2_000;
const ARC_TESTNET_RPC_URL =
  normalizeOptionalString(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL) ||
  "https://rpc.testnet.arc.network";
const ETHEREUM_SEPOLIA_RPC_URL =
  normalizeOptionalString(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL) ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const BRIDGE_CHAIN_LABELS: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": "Arc Testnet",
  "ETH-SEPOLIA": "Ethereum Sepolia",
};

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

type BridgeAdapterCapabilities = ConstructorParameters<typeof ViemAdapter>[1];

const BRIDGE_SUPPORTED_CHAINS = [
  withExplicitBridgeRpcEndpoint(ArcTestnet as unknown as ChainDefinition, ARC_TESTNET_RPC_URL),
  withExplicitBridgeRpcEndpoint(
    EthereumSepolia as unknown as ChainDefinition,
    ETHEREUM_SEPOLIA_RPC_URL
  ),
] as unknown as BridgeAdapterCapabilities["supportedChains"];

class CircleBridgeViemAdapter extends ViemAdapter {
  override async waitForTransaction(
    txHash: Parameters<ViemAdapter["waitForTransaction"]>[0],
    config: Parameters<ViemAdapter["waitForTransaction"]>[1],
    chain: Parameters<ViemAdapter["waitForTransaction"]>[2]
  ) {
    return super.waitForTransaction(
      txHash,
      {
        ...config,
        timeout: config?.timeout ?? getBridgeTransactionWaitTimeoutMs(),
      },
      chain
    );
  }
}

export async function queueCircleBridgeTransfer(
  input: CreateCircleBridgeTransferInput
): Promise<QueuedCircleBridgeTransfer> {
  const destinationBlockchain = normalizeBlockchain(input.blockchain);
  const sourceBlockchain = getSourceBlockchain(destinationBlockchain);

  if (sourceBlockchain === destinationBlockchain) {
    throw new CircleTransferError(
      `Bridge source and destination cannot both be ${destinationBlockchain}.`,
      400,
      "CIRCLE_BRIDGE_SAME_CHAIN",
      {
        destinationBlockchain,
        sourceBlockchain,
      }
    );
  }

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

  assertBridgeConfig(getBridgeConfig());

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
        walletBlockchain: sourceWallet.blockchain,
        walletId: sourceWallet.walletId,
      }
    );
  }

  assertSourceWalletHasSufficientUsdc(sourceWallet, normalizedAmount);

  const execution: PendingCircleBridgeExecution = {
    amount: normalizedAmount,
    createdAt: new Date().toISOString(),
    destinationAddress,
    destinationBlockchain,
    referenceId,
    sourceBlockchain,
    sourceWallet,
    tokenAddress: expectedTokenAddress,
    transferId: randomUUID(),
  };
  const record = createQueuedTransferRecord(execution);

  await saveBridgeRecord(record);

  return {
    execution,
    record,
  };
}

export async function getCircleBridgeStatus(
  transferId: string
): Promise<CircleBridgeTransferRecord> {
  const record = await getBridgeRecord(transferId);

  if (!record) {
    throw new CircleTransferError(
      "Transfer not found or expired",
      404,
      "CIRCLE_BRIDGE_NOT_FOUND"
    );
  }

  return record;
}

export async function runCircleBridgeTransfer(
  input: PendingCircleBridgeExecution
) {
  const { adapter, kit, config } = createBridgeRuntime();
  const fallbackRecord = createQueuedTransferRecord(input);

  kit.on("*", (event) => {
    if (!event || typeof event.method !== "string") {
      return;
    }

    void applyBridgeEvent(
      input.transferId,
      event.method,
      event.values,
      fallbackRecord
    ).catch((error) => {
        console.error("Failed to persist Circle bridge event", {
          error,
          method: event.method,
          transferId: input.transferId,
        });
      });
  });

  const bridgeParams = {
    from: {
      adapter,
      chain: BRIDGE_CHAIN_BY_TRANSFER_CHAIN[input.sourceBlockchain],
      address: input.sourceWallet.walletAddress,
    },
    to: {
      chain: BRIDGE_CHAIN_BY_TRANSFER_CHAIN[input.destinationBlockchain],
      recipientAddress: input.destinationAddress,
      useForwarder: true as const,
    },
    amount: input.amount,
    token: "USDC" as const,
    config: {
      transferSpeed: config.transferSpeed,
    },
  };

  console.log("Bridge Execution", {
    destinationChain: input.destinationBlockchain,
    sourceChain: input.sourceBlockchain,
    sourceWalletId: input.sourceWallet.walletId,
  });

  try {
    const bridgeResult = await kit.bridge(bridgeParams);

    await syncBridgeResult(input.transferId, bridgeResult, {
      destinationAddress: input.destinationAddress,
      destinationBlockchain: input.destinationBlockchain,
      referenceId: input.referenceId,
      sourceBlockchain: input.sourceBlockchain,
      sourceWallet: input.sourceWallet,
      transferId: input.transferId,
    }, fallbackRecord);

    if (bridgeResult.state !== "success") {
      await markBridgeFailure(
        input.transferId,
        bridgeResultToError(bridgeResult, {
          destinationAddress: input.destinationAddress,
          destinationBlockchain: input.destinationBlockchain,
          referenceId: input.referenceId,
          sourceBlockchain: input.sourceBlockchain,
          sourceWallet: input.sourceWallet,
          transferId: input.transferId,
        }),
        bridgeResult.steps,
        input.sourceBlockchain,
        input.destinationBlockchain,
        fallbackRecord
      );

      return;
    }

    await updateBridgeRecord(
      input.transferId,
      (record) => ({
        ...record,
        stage: "completed",
        status: "settled",
        rawStatus: "completed",
        txHash: getLatestTxHash(bridgeResult.steps) || record.txHash,
        txHashBurn:
          getExecutionStepTxHash(bridgeResult.steps, "burn") ||
          getRecordedStepTxHash(record.steps, "burn") ||
          record.txHashBurn,
        txHashMint:
          getExecutionStepTxHash(bridgeResult.steps, "mint") ||
          getRecordedStepTxHash(record.steps, "mint") ||
          record.txHashMint,
        errorReason: null,
        provider: bridgeResult.provider || record.provider,
        updatedAt: new Date().toISOString(),
      }),
      fallbackRecord
    );
  } catch (error) {
    await markBridgeFailure(
      input.transferId,
      toCircleBridgeError(error, {
        destinationAddress: input.destinationAddress,
        destinationBlockchain: input.destinationBlockchain,
        sourceBlockchain: input.sourceBlockchain,
        sourceWallet: input.sourceWallet,
      }),
      [],
      input.sourceBlockchain,
      input.destinationBlockchain,
      fallbackRecord
    );
  }
}

function createQueuedTransferRecord(
  input: PendingCircleBridgeExecution
): CircleBridgeTransferRecord {
  const createdAt = input.createdAt;

  return {
    id: input.transferId,
    transferId: input.transferId,
    stage: "pending",
    status: "pending",
    rawStatus: "queued",
    txHash: null,
    txHashBurn: null,
    txHashMint: null,
    sourceWalletId: input.sourceWallet.walletId,
    walletId: input.sourceWallet.walletId,
    walletAddress: input.sourceWallet.walletAddress,
    sourceAddress: input.sourceWallet.walletAddress,
    sourceChain: input.sourceBlockchain,
    sourceBlockchain: input.sourceBlockchain,
    destinationChain: input.destinationBlockchain,
    destinationAddress: input.destinationAddress,
    amount: input.amount,
    tokenAddress: input.tokenAddress,
    blockchain: input.destinationBlockchain,
    provider: "Circle Bridge Kit",
    referenceId: input.referenceId,
    createdAt,
    updatedAt: createdAt,
    errorReason: null,
    steps: createInitialBridgeSteps(
      input.sourceBlockchain,
      input.destinationBlockchain
    ),
  };
}

function createInitialBridgeSteps(
  sourceBlockchain: CircleTransferBlockchain,
  destinationBlockchain: CircleTransferBlockchain
): CircleBridgeStepRecord[] {
  return [
    {
      id: "burn",
      name: `Burn on ${BRIDGE_CHAIN_LABELS[sourceBlockchain]}`,
      state: "pending",
      txHash: null,
      explorerUrl: null,
      errorMessage: null,
    },
    {
      id: "attestation",
      name: "Waiting for Circle attestation",
      state: "pending",
      txHash: null,
      explorerUrl: null,
      errorMessage: null,
    },
    {
      id: "mint",
      name: `Mint on ${BRIDGE_CHAIN_LABELS[destinationBlockchain]}`,
      state: "pending",
      txHash: null,
      explorerUrl: null,
      errorMessage: null,
    },
  ];
}

async function applyBridgeEvent(
  transferId: string,
  method: string,
  values: unknown,
  fallbackRecord: CircleBridgeTransferRecord
) {
  const stepId = getBridgeEventStepId(method);

  if (!stepId) {
    return;
  }

  const txHash =
    getStringField(values, "txHash") ||
    getStringField(values, "transactionHash") ||
    null;
  const explorerUrl = getStringField(values, "explorerUrl") || null;

  await updateBridgeRecord(
    transferId,
    (record) => {
      if (record.status === "failed" || record.status === "settled") {
        return record;
      }

      return {
        ...record,
        stage: getBridgeStageForStep(stepId),
        status: "processing",
        rawStatus: getRawStatusForEventStep(stepId),
        txHash: txHash || record.txHash,
        txHashBurn:
          stepId === "burn" ? txHash || record.txHashBurn : record.txHashBurn,
        txHashMint:
          stepId === "mint" ? txHash || record.txHashMint : record.txHashMint,
        errorReason: null,
        updatedAt: new Date().toISOString(),
        steps: updateBridgeSteps(record.steps, stepId, {
          state: "success",
          txHash,
          explorerUrl,
          errorMessage: null,
        }),
      };
    },
    fallbackRecord
  );
}

async function syncBridgeResult(
  transferId: string,
  bridgeResult: BridgeExecutionResult,
  context: {
    destinationAddress: string;
    destinationBlockchain: CircleTransferBlockchain;
    referenceId: string;
    sourceBlockchain: CircleTransferBlockchain;
    sourceWallet: CircleTransferWallet;
    transferId: string;
  },
  fallbackRecord: CircleBridgeTransferRecord
) {
  await updateBridgeRecord(
    transferId,
    (record) => {
      const nextSteps = mergeBridgeExecutionSteps(
        record.steps,
        bridgeResult.steps,
        context.sourceBlockchain,
        context.destinationBlockchain
      );

      return {
        ...record,
        provider: bridgeResult.provider || record.provider,
        stage:
          bridgeResult.state === "success"
            ? "completed"
            : getBridgeStageFromSteps(nextSteps, record.stage),
        status:
          bridgeResult.state === "success"
            ? "settled"
            : deriveTransferStatus(nextSteps),
        rawStatus:
          bridgeResult.state === "success"
            ? "completed"
            : getRawStatusFromSteps(nextSteps, record.rawStatus),
        txHash:
          getLatestTxHash(bridgeResult.steps) ||
          getLatestRecordedStepTxHash(nextSteps) ||
          record.txHash,
        txHashBurn:
          getExecutionStepTxHash(bridgeResult.steps, "burn") ||
          getRecordedStepTxHash(nextSteps, "burn") ||
          record.txHashBurn,
        txHashMint:
          getExecutionStepTxHash(bridgeResult.steps, "mint") ||
          getRecordedStepTxHash(nextSteps, "mint") ||
          record.txHashMint,
        updatedAt: new Date().toISOString(),
        steps: nextSteps,
      };
    },
    fallbackRecord
  );
}

async function markBridgeFailure(
  transferId: string,
  error: CircleTransferError,
  bridgeSteps: BridgeExecutionStep[],
  sourceBlockchain: CircleTransferBlockchain,
  destinationBlockchain: CircleTransferBlockchain,
  fallbackRecord: CircleBridgeTransferRecord
) {
  await updateBridgeRecord(
    transferId,
    (record) => {
      let nextSteps = record.steps;

      if (bridgeSteps.length > 0) {
        nextSteps = mergeBridgeExecutionSteps(
          record.steps,
          bridgeSteps,
          sourceBlockchain,
          destinationBlockchain
        );
      }

      if (!nextSteps.some((step) => step.state === "error")) {
        nextSteps = markPendingBridgeStepError(nextSteps, error.message);
      }

      return {
        ...record,
        stage: "failed",
        status: "failed",
        rawStatus: "failed",
        txHashBurn:
          getExecutionStepTxHash(bridgeSteps, "burn") ||
          getRecordedStepTxHash(nextSteps, "burn") ||
          record.txHashBurn,
        txHashMint:
          getExecutionStepTxHash(bridgeSteps, "mint") ||
          getRecordedStepTxHash(nextSteps, "mint") ||
          record.txHashMint,
        errorReason: error.message,
        updatedAt: new Date().toISOString(),
        steps: nextSteps,
      };
    },
    fallbackRecord
  );
}

async function updateBridgeRecord(
  transferId: string,
  updater: (record: CircleBridgeTransferRecord) => CircleBridgeTransferRecord,
  fallbackRecord?: CircleBridgeTransferRecord
) {
  const currentRecord =
    (await getBridgeRecord(transferId)) || fallbackRecord || null;

  if (!currentRecord) {
    return;
  }

  await saveBridgeRecord(updater(currentRecord));
}

async function getBridgeRecord(
  transferId: string
): Promise<CircleBridgeTransferRecord | null> {
  try {
    const payload = await getBridgeRedisClient().get<
      CircleBridgeTransferRecord | string
    >(
      getBridgeRedisKey(transferId)
    );

    if (!payload) {
      return null;
    }

    return deserializeBridgeRecord(payload);
  } catch (error) {
    throw toBridgeStorageError(error, "load", transferId);
  }
}

async function saveBridgeRecord(record: CircleBridgeTransferRecord) {
  try {
    await getBridgeRedisClient().set(
      getBridgeRedisKey(record.transferId),
      JSON.stringify(record),
      { ex: getBridgeRedisTtlSeconds() }
    );
  } catch (error) {
    throw toBridgeStorageError(error, "persist", record.transferId);
  }
}

function getBridgeRedisClient() {
  try {
    return getRedisClient();
  } catch {
    throw new CircleTransferError(
      "Upstash Redis is not configured for bridge state persistence. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      503,
      "CIRCLE_BRIDGE_REDIS_CONFIG_MISSING"
    );
  }
}

function getBridgeRedisKey(transferId: string) {
  return `${BRIDGE_REDIS_KEY_PREFIX}${transferId}`;
}

function getBridgeRedisTtlSeconds() {
  const configuredTtl = Number.parseInt(
    process.env.CIRCLE_BRIDGE_TRANSFER_TTL_SECONDS || "",
    10
  );

  if (Number.isFinite(configuredTtl) && configuredTtl > 0) {
    return configuredTtl;
  }

  return DEFAULT_BRIDGE_REDIS_TTL_SECONDS;
}

function toBridgeStorageError(
  error: unknown,
  action: "load" | "persist",
  transferId?: string
) {
  if (error instanceof CircleTransferError) {
    return error;
  }

  return new CircleTransferError(
    `Failed to ${action} bridge transfer state in Redis.`,
    503,
    "CIRCLE_BRIDGE_STORAGE_UNAVAILABLE",
    {
      ...(transferId ? { transferId } : {}),
      message: error instanceof Error ? error.message : String(error),
    }
  );
}

function deserializeBridgeRecord(
  payload: CircleBridgeTransferRecord | string
): CircleBridgeTransferRecord {
  if (typeof payload === "string") {
    return JSON.parse(payload) as CircleBridgeTransferRecord;
  }

  return payload;
}

function createBridgeRuntime() {
  const config = getBridgeConfig();

  assertBridgeConfig(config);

  try {
    return {
      adapter: createBridgeAdapter(config),
      kit: new BridgeKit(),
      config,
    };
  } catch (error) {
    throw toCircleBridgeError(error, {});
  }
}

function createBridgeAdapter(config: CircleBridgeConfig) {
  return new CircleBridgeViemAdapter(
    {
      getPublicClient: ({ chain }) =>
        createPublicClient({
          chain,
          pollingInterval: getBridgeRpcPollingIntervalMs(),
          transport: http(getBridgeRpcUrl(chain.id)),
        }),
      getWalletClient: ({ chain }) =>
        createWalletClient({
          chain,
          transport: circleWalletsHttp({
            apiKey: config.circleApiKey,
            entitySecret: config.circleEntitySecret,
            baseUrl: config.circleWalletsBaseUrl,
            chainId: chain.id,
            pollingInterval: getBridgeRpcPollingIntervalMs(),
            fallbackTransport: http(getBridgeRpcUrl(chain.id)),
          }),
        }),
    },
    {
      addressContext: "developer-controlled",
      supportedChains: BRIDGE_SUPPORTED_CHAINS,
    }
  );
}

function withExplicitBridgeRpcEndpoint(
  chain: ChainDefinition,
  rpcEndpoint: string
): ChainDefinition {
  return {
    ...chain,
    rpcEndpoints: [rpcEndpoint],
  };
}

function getBridgeRpcUrl(chainId: number): string {
  if (chainId === 5_042_002) {
    return ARC_TESTNET_RPC_URL;
  }

  if (chainId === 11_155_111) {
    return ETHEREUM_SEPOLIA_RPC_URL;
  }

  throw new CircleTransferError(
    `Unsupported bridge RPC chainId ${chainId}.`,
    500,
    "CIRCLE_BRIDGE_RPC_CHAIN_UNSUPPORTED",
    { chainId }
  );
}

function getBridgeTransactionWaitTimeoutMs() {
  const configuredTimeout = Number.parseInt(
    process.env.CIRCLE_BRIDGE_TX_WAIT_TIMEOUT_MS || "",
    10
  );

  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  return DEFAULT_BRIDGE_TX_WAIT_TIMEOUT_MS;
}

function getBridgeRpcPollingIntervalMs() {
  const configuredInterval = Number.parseInt(
    process.env.CIRCLE_BRIDGE_RPC_POLLING_INTERVAL_MS || "",
    10
  );

  if (Number.isFinite(configuredInterval) && configuredInterval > 0) {
    return configuredInterval;
  }

  return DEFAULT_BRIDGE_RPC_POLLING_INTERVAL_MS;
}

function assertBridgeConfig(config: CircleBridgeConfig) {
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
      blockchain: wallet.blockchain,
      requiredAmount: amount,
      symbol: wallet.balance?.symbol || "USDC",
      tokenAddress: wallet.tokenAddress,
      walletAddress: wallet.walletAddress,
      walletId: wallet.walletId,
    }
  );
}

function toStepRecord(
  step: BridgeExecutionStep,
  sourceBlockchain: CircleTransferBlockchain,
  destinationBlockchain: CircleTransferBlockchain
): CircleBridgeStepRecord | null {
  const stepId = getBridgeExecutionStepId(step);

  if (!stepId) {
    return null;
  }

  return {
    id: stepId,
    name: getBridgeStepName(stepId, sourceBlockchain, destinationBlockchain),
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

function getLatestRecordedStepTxHash(
  steps: CircleBridgeStepRecord[]
): string | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (step?.txHash) {
      return step.txHash;
    }
  }

  return null;
}

function getExecutionStepTxHash(
  steps: BridgeExecutionStep[],
  stepId: CircleBridgeStepId
) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (getBridgeExecutionStepId(step) === stepId && step.txHash) {
      return step.txHash;
    }
  }

  return null;
}

function getRecordedStepTxHash(
  steps: CircleBridgeStepRecord[],
  stepId: CircleBridgeStepId
) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (step?.id === stepId && step.txHash) {
      return step.txHash;
    }
  }

  return null;
}

function getBridgeEventStepId(method: string): CircleBridgeStepId | null {
  const normalizedMethod = method.trim().toLowerCase();

  if (normalizedMethod.includes("attestation")) {
    return "attestation";
  }

  if (normalizedMethod.includes("mint")) {
    return "mint";
  }

  if (normalizedMethod.includes("burn")) {
    return "burn";
  }

  return null;
}

function getBridgeExecutionStepId(
  step: BridgeExecutionStep
): CircleBridgeStepId | null {
  const normalizedName = step.name.trim().toLowerCase();

  if (normalizedName.includes("attestation")) {
    return "attestation";
  }

  if (normalizedName.includes("mint")) {
    return "mint";
  }

  if (normalizedName.includes("burn")) {
    return "burn";
  }

  if (normalizedName.includes("approve") && step.state !== "success") {
    return "burn";
  }

  return null;
}

function getBridgeStepName(
  stepId: CircleBridgeStepId,
  sourceBlockchain: CircleTransferBlockchain,
  destinationBlockchain: CircleTransferBlockchain
) {
  if (stepId === "burn") {
    return `Burn on ${BRIDGE_CHAIN_LABELS[sourceBlockchain]}`;
  }

  if (stepId === "mint") {
    return `Mint on ${BRIDGE_CHAIN_LABELS[destinationBlockchain]}`;
  }

  return "Waiting for Circle attestation";
}

function getBridgeStageForStep(stepId: CircleBridgeStepId): CircleBridgeTransferStage {
  if (stepId === "burn") {
    return "attesting";
  }

  if (stepId === "attestation") {
    return "minting";
  }

  return "completed";
}

function getBridgeStageFromSteps(
  steps: CircleBridgeStepRecord[],
  fallbackStage: CircleBridgeTransferStage
) {
  if (steps.some((step) => step.state === "error")) {
    return "failed";
  }

  const mintStep = steps.find((step) => step.id === "mint");

  if (mintStep?.state === "success") {
    return "completed";
  }

  const attestationStep = steps.find((step) => step.id === "attestation");

  if (attestationStep?.state === "success") {
    return "minting";
  }

  const burnStep = steps.find((step) => step.id === "burn");

  if (burnStep?.state === "success") {
    return "attesting";
  }

  return fallbackStage;
}

function mergeBridgeExecutionSteps(
  currentSteps: CircleBridgeStepRecord[],
  bridgeSteps: BridgeExecutionStep[],
  sourceBlockchain: CircleTransferBlockchain,
  destinationBlockchain: CircleTransferBlockchain
) {
  let nextSteps = currentSteps;

  for (const bridgeStep of bridgeSteps) {
    const stepRecord = toStepRecord(
      bridgeStep,
      sourceBlockchain,
      destinationBlockchain
    );

    if (!stepRecord) {
      continue;
    }

    nextSteps = updateBridgeSteps(nextSteps, stepRecord.id, stepRecord);
  }

  return nextSteps;
}

function updateBridgeSteps(
  steps: CircleBridgeStepRecord[],
  stepId: CircleBridgeStepId,
  updates: Partial<CircleBridgeStepRecord>
) {
  return steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          ...updates,
          id: step.id,
          name: step.name,
        }
      : step
  );
}

function markPendingBridgeStepError(
  steps: CircleBridgeStepRecord[],
  errorMessage: string
) {
  const pendingStep =
    steps.find((step) => step.state === "pending") || steps[steps.length - 1];

  return updateBridgeSteps(steps, pendingStep.id, {
    state: "error",
    errorMessage,
  });
}

function deriveTransferStatus(steps: CircleBridgeStepRecord[]) {
  if (steps.some((step) => step.state === "error")) {
    return "failed" as const;
  }

  if (
    steps.every(
      (step) => step.state === "success" || step.state === "noop"
    )
  ) {
    return "settled" as const;
  }

  if (steps.some((step) => step.state === "success")) {
    return "processing" as const;
  }

  return "pending" as const;
}

function getRawStatusForStep(stepId: CircleBridgeStepId) {
  if (stepId === "mint") {
    return "completed";
  }

  if (stepId === "attestation") {
    return "attested";
  }

  return "burned";
}

function getRawStatusForEventStep(stepId: CircleBridgeStepId) {
  if (stepId === "mint") {
    return "minting";
  }

  return getRawStatusForStep(stepId);
}

function getRawStatusFromSteps(
  steps: CircleBridgeStepRecord[],
  fallbackStatus: string
) {
  const mintStep = steps.find((step) => step.id === "mint");

  if (mintStep?.state === "success") {
    return "completed";
  }

  const attestationStep = steps.find((step) => step.id === "attestation");

  if (attestationStep?.state === "success") {
    return "attested";
  }

  const burnStep = steps.find((step) => step.id === "burn");

  if (burnStep?.state === "success") {
    return "burned";
  }

  return fallbackStatus;
}

function getStringField(
  value: unknown,
  key: string
): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[key];

  return typeof fieldValue === "string" && fieldValue ? fieldValue : undefined;
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
      failedStep: failedStep
        ? toStepRecord(
            failedStep,
            context.sourceBlockchain,
            context.destinationBlockchain
          )
        : null,
      steps: bridgeResult.steps
        .map((step) =>
          toStepRecord(
            step,
            context.sourceBlockchain,
            context.destinationBlockchain
          )
        )
        .filter((step): step is CircleBridgeStepRecord => Boolean(step)),
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
        destinationBlockchain: context.destinationBlockchain || null,
        message,
        sourceBlockchain: context.sourceBlockchain || null,
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
