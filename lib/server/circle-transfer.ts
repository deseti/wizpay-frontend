import { createHash, randomUUID } from "node:crypto";

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type {
  Blockchain,
  CircleDeveloperControlledWalletsClient,
  CreateTransferTransactionInput,
  FeeLevel,
  TokenBlockchain,
  Transaction,
  Wallet,
} from "@circle-fin/developer-controlled-wallets";
import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

import {
  getWalletByChain,
  type CircleWalletByChain,
} from "@/lib/server/circle-wallet-mapping";

export type CircleTransferBlockchain = "ARC-TESTNET" | "ETH-SEPOLIA";

export interface CircleTransferWalletBalance {
  amount: string;
  symbol: string | null;
  tokenAddress: string;
  updatedAt: string;
}

export interface CircleTransferWallet {
  walletSetId: string | null;
  walletId: string | null;
  walletAddress: string;
  blockchain: CircleTransferBlockchain;
  tokenAddress: string;
  balance: CircleTransferWalletBalance | null;
}

export interface BootstrapCircleTransferWalletInput {
  walletSetId?: string;
  walletSetName?: string;
  walletName?: string;
  refId?: string;
  blockchain?: CircleTransferBlockchain;
  tokenAddress?: string;
}

export interface GetCircleTransferWalletInput {
  walletId?: string;
  walletAddress?: string;
  blockchain?: CircleTransferBlockchain;
  tokenAddress?: string;
}

export interface CreateCircleTransferInput {
  destinationAddress: string;
  amount: string;
  referenceId?: string;
  tokenAddress?: string;
  walletId?: string;
  walletAddress?: string;
  blockchain?: CircleTransferBlockchain;
}

export interface CircleTransferRecord {
  transferId: string;
  status: "pending" | "processing" | "settled" | "failed";
  rawStatus: string;
  txHash: string | null;
  walletId: string | null;
  walletAddress: string | null;
  sourceAddress: string | null;
  destinationAddress: string | null;
  amount: string;
  tokenAddress: string;
  blockchain: CircleTransferBlockchain;
  referenceId: string;
  createdAt: string;
  updatedAt: string;
  errorReason: string | null;
}

interface ResolvedWalletConfig {
  walletSetId: string | null;
  walletId: string | null;
  walletAddress: string;
  blockchain: CircleTransferBlockchain;
}

interface StoredTransferMetadata {
  amount: string;
  blockchain: CircleTransferBlockchain;
  destinationAddress: string;
  referenceId: string;
  tokenAddress: string;
  walletAddress: string;
  walletId: string | null;
}

interface ChainWalletConfig {
  walletSetId: string;
  walletId: string;
  walletAddress: string;
}

interface CircleTransferConfig {
  circleApiKey: string;
  circleEntitySecret: string;
  chainWallets: Record<CircleTransferBlockchain, CircleWalletByChain>;
  circleWalletsBaseUrl: string;
  defaultBlockchain: CircleTransferBlockchain;
  defaultTokenAddress: string;
  defaultFeeLevel: FeeLevel;
}

export interface CircleTransferRuntimeDebugConfig {
  apiKeyFingerprint: string | null;
  apiKeyLength: number;
  apiKeyPrefix: string | null;
  chainWallets: Record<
    CircleTransferBlockchain,
    {
      walletAddress: string | null;
      walletId: string | null;
      walletSetId: string | null;
    }
  >;
  circleWalletsBaseUrl: string;
  defaultBlockchain: CircleTransferBlockchain;
  defaultFeeLevel: FeeLevel;
  defaultTokenAddress: string;
  entitySecretFingerprint: string | null;
  entitySecretLength: number;
}

export interface CircleTransferRuntimeDebugSnapshot {
  cachedClientConfig: CircleTransferRuntimeDebugConfig | null;
  clientInitialized: boolean;
  currentConfig: CircleTransferRuntimeDebugConfig;
  matchesCachedClientConfig: {
    apiKey: boolean | null;
    baseUrl: boolean | null;
    entitySecret: boolean | null;
  };
  rememberedWallets: Array<{
    blockchain: CircleTransferBlockchain;
    walletAddress: string;
    walletId: string | null;
    walletSetId: string | null;
  }>;
  runtimeWalletSetIds: Array<{
    blockchain: CircleTransferBlockchain;
    walletSetId: string;
  }>;
}

const SUPPORTED_BLOCKCHAINS = new Set<CircleTransferBlockchain>([
  "ARC-TESTNET",
  "ETH-SEPOLIA",
]);

const DEFAULT_TOKEN_BY_CHAIN: Record<CircleTransferBlockchain, string> = {
  "ARC-TESTNET": "0x3600000000000000000000000000000000000000",
  "ETH-SEPOLIA": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

const ARC_TESTNET_RPC_URL =
  normalizeOptionalString(process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL) ||
  "https://rpc.testnet.arc.network";
const ETHEREUM_SEPOLIA_RPC_URL =
  normalizeOptionalString(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL) ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const arcTestnetPublicChain = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_URL],
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

const ethereumSepoliaPublicChain = {
  ...sepolia,
  rpcUrls: {
    ...sepolia.rpcUrls,
    default: {
      http: [ETHEREUM_SEPOLIA_RPC_URL],
    },
    public: {
      http: [ETHEREUM_SEPOLIA_RPC_URL],
    },
  },
};

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const publicClientsByChain: Record<
  CircleTransferBlockchain,
  ReturnType<typeof createPublicClient>
> = {
  "ARC-TESTNET": createPublicClient({
    chain: arcTestnetPublicChain,
    transport: http(ARC_TESTNET_RPC_URL),
  }),
  "ETH-SEPOLIA": createPublicClient({
    chain: ethereumSepoliaPublicChain,
    transport: http(ETHEREUM_SEPOLIA_RPC_URL),
  }),
};

const DEFAULT_WALLET_SET_NAME = "WizPay Transfer Wallet Set";
const DEFAULT_WALLET_NAME_PREFIX = "WizPay Transfer Wallet";
const transferMetadata = new Map<string, StoredTransferMetadata>();
const runtimeWallets = new Map<CircleTransferBlockchain, ResolvedWalletConfig>();
const runtimeWalletSetIds = new Map<CircleTransferBlockchain, string>();

let circleWalletClient: CircleDeveloperControlledWalletsClient | null = null;
let circleWalletClientDebugConfig: CircleTransferRuntimeDebugConfig | null = null;

export class CircleTransferError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CircleTransferError";
  }
}

export async function getTransferWallet(
  input: GetCircleTransferWalletInput = {}
): Promise<CircleTransferWallet> {
  const blockchain = normalizeBlockchain(input.blockchain);
  const tokenAddress = input.tokenAddress || getDefaultTokenAddress(blockchain);
  const resolvedWallet = await resolveWalletConfig({
    walletId: input.walletId,
    walletAddress: input.walletAddress,
    blockchain,
  });

  return buildWalletRecord(resolvedWallet, tokenAddress);
}

export async function bootstrapTransferWallet(
  input: BootstrapCircleTransferWalletInput = {}
): Promise<CircleTransferWallet> {
  const client = getCircleWalletClient();
  const config = getConfig();
  const blockchain = normalizeBlockchain(input.blockchain);
  const tokenAddress = input.tokenAddress || getDefaultTokenAddress(blockchain);
  const discoveredWallet = await discoverWalletAcrossWalletSets(client, blockchain);

  if (discoveredWallet) {
    return buildWalletRecord(rememberWallet(discoveredWallet), tokenAddress);
  }

  let walletSetId =
    input.walletSetId ||
    config.chainWallets[blockchain].walletSetId ||
    runtimeWalletSetIds.get(blockchain) ||
    null;

  if (walletSetId) {
    const existingWallet = await getFirstWalletInSet(client, walletSetId, blockchain);

    if (existingWallet) {
      const resolvedWallet = rememberWallet(existingWallet);
      runtimeWalletSetIds.set(
        blockchain,
        existingWallet.walletSetId || walletSetId
      );
      return buildWalletRecord(resolvedWallet, tokenAddress);
    }
  }

  if (!walletSetId) {
    walletSetId = await createWalletSet(client, input.walletSetName);
    runtimeWalletSetIds.set(blockchain, walletSetId);
  }

  const walletResponse = await wrapCircleCall(
    async () =>
      client.createWallets({
        blockchains: [blockchain as Blockchain],
        count: 1,
        walletSetId,
        metadata: [
          {
            name:
              input.walletName || `${DEFAULT_WALLET_NAME_PREFIX} ${blockchain}`,
            refId: input.refId,
          },
        ],
        xRequestId: randomUUID(),
      }),
    `Failed to create a ${blockchain} transfer wallet.`
  );

  const wallet = walletResponse.data?.wallets?.[0];

  if (!wallet) {
    throw new CircleTransferError(
      "Circle did not return the created wallet.",
      502,
      "CIRCLE_EMPTY_WALLET_RESPONSE"
    );
  }

  runtimeWalletSetIds.set(blockchain, walletSetId);

  return buildWalletRecord(rememberWallet(wallet), tokenAddress);
}

export async function createCircleTransfer(
  input: CreateCircleTransferInput
): Promise<CircleTransferRecord> {
  const client = getCircleWalletClient();
  const normalizedAmount = normalizeAmount(input.amount);
  const blockchain = normalizeBlockchain(input.blockchain);
  const tokenAddress = input.tokenAddress || getDefaultTokenAddress(blockchain);
  const feeLevel = getConfig().defaultFeeLevel;
  const resolvedWallet = await resolveWalletConfig({
    walletId: input.walletId,
    walletAddress: input.walletAddress,
    blockchain,
  });

  await assertWalletHasSufficientBalance({
    amount: normalizedAmount,
    tokenAddress,
    wallet: resolvedWallet,
  });

  const requestId = randomUUID();
  const request: CreateTransferTransactionInput = resolvedWallet.walletId
    ? {
        walletId: resolvedWallet.walletId,
        tokenAddress,
        amount: [normalizedAmount],
        destinationAddress: input.destinationAddress,
        refId: input.referenceId,
        fee: {
          type: "level",
          config: { feeLevel },
        },
        xRequestId: requestId,
      }
    : {
        walletAddress: resolvedWallet.walletAddress,
        blockchain: resolvedWallet.blockchain as TokenBlockchain,
        tokenAddress,
        amount: [normalizedAmount],
        destinationAddress: input.destinationAddress,
        refId: input.referenceId,
        fee: {
          type: "level",
          config: { feeLevel },
        },
        xRequestId: requestId,
      };

  const response = await wrapCircleCall(
    async () => client.createTransaction(request),
    "Failed to create the Circle transfer transaction."
  );

  const createdTransfer = response.data;

  if (!createdTransfer?.id || !createdTransfer.state) {
    throw new CircleTransferError(
      "Circle did not return a transfer identifier.",
      502,
      "CIRCLE_EMPTY_TRANSFER_RESPONSE"
    );
  }

  const timestamp = new Date().toISOString();

  transferMetadata.set(createdTransfer.id, {
    amount: normalizedAmount,
    blockchain,
    destinationAddress: input.destinationAddress,
    referenceId: input.referenceId || "",
    tokenAddress,
    walletAddress: resolvedWallet.walletAddress,
    walletId: resolvedWallet.walletId,
  });

  return {
    transferId: createdTransfer.id,
    status: normalizeTransactionState(createdTransfer.state),
    rawStatus: createdTransfer.state,
    txHash: null,
    walletId: resolvedWallet.walletId,
    walletAddress: resolvedWallet.walletAddress,
    sourceAddress: resolvedWallet.walletAddress,
    destinationAddress: input.destinationAddress,
    amount: normalizedAmount,
    tokenAddress,
    blockchain,
    referenceId: input.referenceId || "",
    createdAt: timestamp,
    updatedAt: timestamp,
    errorReason: null,
  };
}

export async function getCircleTransferStatus(
  transferId: string
): Promise<CircleTransferRecord> {
  const client = getCircleWalletClient();
  const response = await wrapCircleCall(
    async () =>
      client.getTransaction({
        id: transferId,
        xRequestId: randomUUID(),
      }),
    `Failed to load Circle transfer ${transferId}.`
  );

  const transaction = response.data?.transaction;

  if (!transaction) {
    throw new CircleTransferError(
      `Circle transfer ${transferId} was not found.`,
      404,
      "CIRCLE_TRANSFER_NOT_FOUND"
    );
  }

  return mapTransactionToTransferRecord(transaction);
}

export function getCircleTransferRuntimeDebugSnapshot(): CircleTransferRuntimeDebugSnapshot {
  const currentConfig = toRuntimeDebugConfig(getConfig());

  return {
    cachedClientConfig: circleWalletClientDebugConfig,
    clientInitialized: Boolean(circleWalletClient),
    currentConfig,
    matchesCachedClientConfig: {
      apiKey: circleWalletClientDebugConfig
        ? circleWalletClientDebugConfig.apiKeyFingerprint ===
          currentConfig.apiKeyFingerprint
        : null,
      baseUrl: circleWalletClientDebugConfig
        ? circleWalletClientDebugConfig.circleWalletsBaseUrl ===
          currentConfig.circleWalletsBaseUrl
        : null,
      entitySecret: circleWalletClientDebugConfig
        ? circleWalletClientDebugConfig.entitySecretFingerprint ===
          currentConfig.entitySecretFingerprint
        : null,
    },
    rememberedWallets: Array.from(runtimeWallets.values()).map((wallet) => ({
      blockchain: wallet.blockchain,
      walletAddress: wallet.walletAddress,
      walletId: wallet.walletId,
      walletSetId: wallet.walletSetId,
    })),
    runtimeWalletSetIds: Array.from(runtimeWalletSetIds.entries()).map(
      ([blockchain, walletSetId]) => ({
        blockchain,
        walletSetId,
      })
    ),
  };
}

function getCircleWalletClient(): CircleDeveloperControlledWalletsClient {
  if (circleWalletClient) {
    return circleWalletClient;
  }

  const config = getConfig();

  if (!config.circleApiKey) {
    throw new CircleTransferError(
      "CIRCLE_API_KEY is not configured for Circle developer-controlled wallets.",
      503,
      "CIRCLE_API_KEY_MISSING"
    );
  }

  if (!config.circleEntitySecret) {
    throw new CircleTransferError(
      "CIRCLE_ENTITY_SECRET is not configured for Circle developer-controlled wallets.",
      503,
      "CIRCLE_ENTITY_SECRET_MISSING"
    );
  }

  circleWalletClient = initiateDeveloperControlledWalletsClient({
    apiKey: config.circleApiKey,
    entitySecret: config.circleEntitySecret,
    baseUrl: config.circleWalletsBaseUrl,
  });
  circleWalletClientDebugConfig = toRuntimeDebugConfig(config);

  return circleWalletClient;
}

function getConfig(): CircleTransferConfig {
  const configuredBlockchain = normalizeOptionalString(
    process.env.CIRCLE_TRANSFER_BLOCKCHAIN
  );
  const rawCircleApiBaseUrl =
    normalizeOptionalString(process.env.CIRCLE_API_BASE_URL) ||
    normalizeOptionalString(process.env.CIRCLE_BASE_URL);
  const normalizedCircleWalletsBaseUrl = (
    normalizeOptionalString(process.env.CIRCLE_WALLETS_BASE_URL) ||
    rawCircleApiBaseUrl ||
    "https://api.circle.com"
  ).replace(/\/v1\/?$/, "");

  return {
    circleApiKey: normalizeOptionalString(process.env.CIRCLE_API_KEY) || "",
    circleEntitySecret:
      normalizeOptionalString(process.env.CIRCLE_ENTITY_SECRET) || "",
    chainWallets: {
      "ARC-TESTNET": getWalletByChain("ARC-TESTNET"),
      "ETH-SEPOLIA": getWalletByChain("ETH-SEPOLIA"),
    },
    circleWalletsBaseUrl: normalizedCircleWalletsBaseUrl,
    defaultBlockchain: normalizeBlockchain(configuredBlockchain),
    defaultTokenAddress:
      normalizeOptionalString(process.env.CIRCLE_TRANSFER_TOKEN_ADDRESS) ||
      DEFAULT_TOKEN_BY_CHAIN[normalizeBlockchain(configuredBlockchain)],
    defaultFeeLevel: ((normalizeOptionalString(process.env.CIRCLE_TRANSFER_FEE_LEVEL) ||
      "MEDIUM").toUpperCase() as FeeLevel),
  };
}

function toRuntimeDebugConfig(
  config: CircleTransferConfig
): CircleTransferRuntimeDebugConfig {
  return {
    apiKeyFingerprint: fingerprintValue(config.circleApiKey),
    apiKeyLength: config.circleApiKey.length,
    apiKeyPrefix: extractApiKeyPrefix(config.circleApiKey),
    chainWallets: {
      "ARC-TESTNET": {
        walletAddress:
          normalizeOptionalString(
            config.chainWallets["ARC-TESTNET"].walletAddress
          ) || null,
        walletId:
          normalizeOptionalString(config.chainWallets["ARC-TESTNET"].walletId) ||
          null,
        walletSetId:
          normalizeOptionalString(
            config.chainWallets["ARC-TESTNET"].walletSetId
          ) || null,
      },
      "ETH-SEPOLIA": {
        walletAddress:
          normalizeOptionalString(
            config.chainWallets["ETH-SEPOLIA"].walletAddress
          ) || null,
        walletId:
          normalizeOptionalString(
            config.chainWallets["ETH-SEPOLIA"].walletId
          ) || null,
        walletSetId:
          normalizeOptionalString(
            config.chainWallets["ETH-SEPOLIA"].walletSetId
          ) || null,
      },
    },
    circleWalletsBaseUrl: config.circleWalletsBaseUrl,
    defaultBlockchain: config.defaultBlockchain,
    defaultFeeLevel: config.defaultFeeLevel,
    defaultTokenAddress: config.defaultTokenAddress,
    entitySecretFingerprint: fingerprintValue(config.circleEntitySecret),
    entitySecretLength: config.circleEntitySecret.length,
  };
}

async function createWalletSet(
  client: CircleDeveloperControlledWalletsClient,
  walletSetName?: string
): Promise<string> {
  const response = await wrapCircleCall(
    async () =>
      client.createWalletSet({
        name: walletSetName || DEFAULT_WALLET_SET_NAME,
        xRequestId: randomUUID(),
      }),
    "Failed to create a Circle wallet set."
  );

  const walletSetId = response.data?.walletSet?.id;

  if (!walletSetId) {
    throw new CircleTransferError(
      "Circle did not return the created wallet set identifier.",
      502,
      "CIRCLE_EMPTY_WALLET_SET_RESPONSE"
    );
  }

  return walletSetId;
}

async function resolveWalletConfig(
  overrides: {
    walletId?: string;
    walletAddress?: string;
    blockchain?: CircleTransferBlockchain;
  } = {}
): Promise<ResolvedWalletConfig> {
  const client = getCircleWalletClient();
  const config = getConfig();
  const blockchain = normalizeBlockchain(overrides.blockchain);
  const requestedWalletId = normalizeOptionalString(overrides.walletId);
  const requestedWalletAddress = normalizeOptionalString(overrides.walletAddress);
  const chainWalletConfig = config.chainWallets[blockchain];
  const rememberedWallet = runtimeWallets.get(blockchain);
  const walletSetId =
    chainWalletConfig.walletSetId ||
    runtimeWalletSetIds.get(blockchain) ||
    null;
  let configuredWalletSetWasChecked = false;

  if (requestedWalletId) {
    if (
      chainWalletConfig.walletId &&
      requestedWalletId !== chainWalletConfig.walletId
    ) {
      logWalletMappingError({
        actualWalletId: requestedWalletId,
        blockchain,
        expectedWalletId: chainWalletConfig.walletId,
        reason: "requested walletId does not match the configured chain walletId",
      });

      throw new CircleTransferError(
        `Requested Circle wallet ${requestedWalletId} does not match the configured wallet ${chainWalletConfig.walletId} for ${blockchain}.`,
        409,
        "CIRCLE_WALLET_ID_MISMATCH",
        {
          actualWalletId: requestedWalletId,
          blockchain,
          configuredEnv: chainWalletConfig.walletIdEnvName,
          expectedWalletId: chainWalletConfig.walletId,
        }
      );
    }

    const requestedWallet = await getWalletById(client, requestedWalletId);

    if (walletMatchesBlockchain(requestedWallet, blockchain)) {
      return rememberWallet(requestedWallet);
    }

    logWalletMappingError({
      actualWalletId: requestedWalletId,
      blockchain,
      reason: "requested walletId belongs to a different blockchain",
      walletBlockchain: String(requestedWallet.blockchain),
    });

    throw new CircleTransferError(
      `Requested Circle wallet ${requestedWalletId} is not on ${blockchain}.`,
      409,
      "CIRCLE_WALLET_CHAIN_MISMATCH",
      {
        blockchain,
        walletAddress: requestedWallet.address,
        walletBlockchain: String(requestedWallet.blockchain),
        walletId: requestedWallet.id,
      }
    );
  }

  if (chainWalletConfig.walletId) {
    const chainWallet = await getWalletById(client, chainWalletConfig.walletId);
    return rememberWallet(
      assertConfiguredWalletMatchesChain(
        chainWallet,
        blockchain,
        chainWalletConfig.walletIdEnvName
      )
    );
  }

  if (rememberedWallet) {
    return rememberedWallet;
  }

  if (walletSetId) {
    const wallet = await getFirstWalletInSet(client, walletSetId, blockchain);

    if (wallet) {
      runtimeWalletSetIds.set(blockchain, wallet.walletSetId || walletSetId);
      return rememberWallet(wallet);
    }

    configuredWalletSetWasChecked = true;
  }

  if (requestedWalletAddress || chainWalletConfig.walletAddress) {
    return {
      walletSetId: null,
      walletId: null,
      walletAddress:
        requestedWalletAddress || chainWalletConfig.walletAddress,
      blockchain,
    };
  }

  const discoveredWallet = await discoverWalletAcrossWalletSets(
    client,
    blockchain,
    walletSetId ? [walletSetId] : []
  );

  if (discoveredWallet) {
    return rememberWallet(discoveredWallet);
  }

  const accessibleWalletSetIds = await getAccessibleWalletSetIds(client);

  if (configuredWalletSetWasChecked || accessibleWalletSetIds.length > 0) {
    throw new CircleTransferError(
      configuredWalletSetWasChecked
        ? `No Circle transfer wallet was found for ${blockchain} inside the configured wallet set. Bootstrap that chain and fund it before retrying.`
        : `No Circle transfer wallet was found for ${blockchain} in any accessible Circle wallet set yet. Bootstrap that chain and fund it before retrying.`,
      503,
      "CIRCLE_WALLET_NOT_FOUND",
      {
        blockchain,
        ...(walletSetId ? { walletSetId } : {}),
        walletSetIds: accessibleWalletSetIds,
      }
    );
  }

  throw new CircleTransferError(
    `Circle transfer wallet is not configured for ${blockchain}. Bootstrap a transfer wallet for this chain or set ${chainWalletConfig.walletIdEnvName}, ${chainWalletConfig.walletAddressEnvName}, or ${chainWalletConfig.walletSetIdEnvName} on the server.`,
    503,
    "CIRCLE_WALLET_CONFIG_MISSING",
    { blockchain }
  );
}

function walletMatchesBlockchain(
  wallet: Wallet,
  blockchain: CircleTransferBlockchain
) {
  try {
    return normalizeBlockchain(String(wallet.blockchain)) === blockchain;
  } catch {
    return false;
  }
}

function assertConfiguredWalletMatchesChain(
  wallet: Wallet,
  blockchain: CircleTransferBlockchain,
  envName: string
) {
  const walletBlockchain = normalizeBlockchain(String(wallet.blockchain));

  if (walletBlockchain === blockchain) {
    return wallet;
  }

  logWalletMappingError({
    actualWalletId: wallet.id,
    blockchain,
    configuredEnv: envName,
    reason: "configured walletId belongs to a different blockchain",
    walletAddress: wallet.address,
    walletBlockchain,
  });

  throw new CircleTransferError(
    `Configured Circle wallet ${wallet.id} from ${envName} is on ${walletBlockchain}, but ${blockchain} was requested. Fix the per-chain treasury wallet mapping before retrying.`,
    503,
    "CIRCLE_WALLET_CHAIN_MISMATCH",
    {
      blockchain,
      configuredEnv: envName,
      walletAddress: wallet.address,
      walletBlockchain,
      walletId: wallet.id,
    }
  );
}

async function getWalletById(
  client: CircleDeveloperControlledWalletsClient,
  walletId: string
): Promise<Wallet> {
  const response = await wrapCircleCall(
    async () =>
      client.getWallet({
        id: walletId,
        xRequestId: randomUUID(),
      }),
    `Failed to load Circle wallet ${walletId}.`
  );

  const wallet = response.data?.wallet;

  if (!wallet) {
    throw new CircleTransferError(
      `Circle wallet ${walletId} was not found.`,
      404,
      "CIRCLE_WALLET_NOT_FOUND"
    );
  }

  return wallet;
}

async function getFirstWalletInSet(
  client: CircleDeveloperControlledWalletsClient,
  walletSetId: string,
  blockchain: CircleTransferBlockchain
): Promise<Wallet | null> {
  const response = await wrapCircleCall(
    async () =>
      client.listWallets({
        walletSetId,
        blockchain: blockchain as Blockchain,
        xRequestId: randomUUID(),
      }),
    `Failed to list wallets for Circle wallet set ${walletSetId}.`
  );

  return response.data?.wallets?.[0] ?? null;
}

async function discoverWalletAcrossWalletSets(
  client: CircleDeveloperControlledWalletsClient,
  blockchain: CircleTransferBlockchain,
  excludedWalletSetIds: string[] = []
): Promise<Wallet | null> {
  const excludedSet = new Set(excludedWalletSetIds);
  const walletSets = await listAccessibleWalletSets(client);

  for (const walletSet of walletSets) {
    const walletSetId =
      typeof walletSet?.id === "string" && walletSet.id ? walletSet.id : null;

    if (!walletSetId || excludedSet.has(walletSetId)) {
      continue;
    }

    const wallet = await getFirstWalletInSet(client, walletSetId, blockchain);

    if (wallet) {
      return wallet;
    }
  }

  return null;
}

async function getAccessibleWalletSetIds(
  client: CircleDeveloperControlledWalletsClient
): Promise<string[]> {
  const walletSets = await listAccessibleWalletSets(client);

  return walletSets
    .map((walletSet) =>
      typeof walletSet?.id === "string" && walletSet.id ? walletSet.id : null
    )
    .filter((walletSetId): walletSetId is string => Boolean(walletSetId));
}

async function listAccessibleWalletSets(
  client: CircleDeveloperControlledWalletsClient
) {
  const response = await wrapCircleCall(
    async () =>
      client.listWalletSets({
        xRequestId: randomUUID(),
      }),
    "Failed to list accessible Circle wallet sets."
  );

  return response.data?.walletSets ?? [];
}

async function buildWalletRecord(
  wallet: ResolvedWalletConfig,
  tokenAddress: string
): Promise<CircleTransferWallet> {
  return {
    walletSetId: wallet.walletSetId,
    walletId: wallet.walletId,
    walletAddress: wallet.walletAddress,
    blockchain: wallet.blockchain,
    tokenAddress,
    balance: await getWalletBalance(wallet, tokenAddress),
  };
}

async function getWalletBalance(
  wallet: ResolvedWalletConfig,
  tokenAddress: string
): Promise<CircleTransferWalletBalance | null> {
  const onchainBalance = await getWalletBalanceFromRpc(wallet, tokenAddress);

  if (onchainBalance) {
    return onchainBalance;
  }

  return getWalletBalanceFromCircle(wallet.walletId, tokenAddress);
}

async function getWalletBalanceFromCircle(
  walletId: string | null,
  tokenAddress: string
): Promise<CircleTransferWalletBalance | null> {
  if (!walletId) {
    return null;
  }

  const client = getCircleWalletClient();
  const response = await wrapCircleCall(
    async () =>
      client.getWalletTokenBalance({
        id: walletId,
        tokenAddresses: [tokenAddress],
        xRequestId: randomUUID(),
      }),
    `Failed to load the Circle balance for wallet ${walletId}.`
  );

  const balance = response.data?.tokenBalances?.[0];

  if (!balance) {
    return null;
  }

  return {
    amount: balance.amount,
    symbol: balance.token.symbol || inferTokenSymbol(tokenAddress),
    tokenAddress: balance.token.tokenAddress || tokenAddress,
    updatedAt: balance.updateDate,
  };
}

async function getWalletBalanceFromRpc(
  wallet: ResolvedWalletConfig,
  tokenAddress: string
): Promise<CircleTransferWalletBalance | null> {
  try {
    const publicClient = publicClientsByChain[wallet.blockchain];

    if (isArcNativeUsdcToken(wallet.blockchain, tokenAddress)) {
      const amount = await publicClient.getBalance({
        address: wallet.walletAddress as Address,
      });

      return {
        amount: formatUnits(amount, 18),
        symbol: inferTokenSymbol(tokenAddress),
        tokenAddress,
        updatedAt: new Date().toISOString(),
      };
    }

    const [amount, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallet.walletAddress as Address],
      }),
      publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: "decimals",
      }),
    ]);

    return {
      amount: formatUnits(amount, Number(decimals)),
      symbol: inferTokenSymbol(tokenAddress),
      tokenAddress,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function isArcNativeUsdcToken(
  blockchain: CircleTransferBlockchain,
  tokenAddress: string
) {
  return (
    blockchain === "ARC-TESTNET" &&
    tokenAddress.toLowerCase() === DEFAULT_TOKEN_BY_CHAIN["ARC-TESTNET"].toLowerCase()
  );
}

async function assertWalletHasSufficientBalance({
  amount,
  tokenAddress,
  wallet,
}: {
  amount: string;
  tokenAddress: string;
  wallet: ResolvedWalletConfig;
}): Promise<void> {
  const balance = await getWalletBalance(wallet, tokenAddress);
  const availableAmount = Number(balance?.amount || "0");
  const requiredAmount = Number(amount);

  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
    return;
  }

  if (Number.isFinite(availableAmount) && availableAmount >= requiredAmount) {
    return;
  }

  throw new CircleTransferError(
    `Transfer wallet ${wallet.walletAddress} only has ${balance?.amount || "0"} ${
      balance?.symbol || inferTokenSymbol(tokenAddress)
    } available on ${wallet.blockchain}. Fund it from the Circle faucet before retrying.`,
    409,
    "CIRCLE_TRANSFER_INSUFFICIENT_BALANCE",
    {
      availableAmount: balance?.amount || "0",
      requiredAmount: amount,
      walletAddress: wallet.walletAddress,
      walletId: wallet.walletId,
      blockchain: wallet.blockchain,
      tokenAddress,
      symbol: balance?.symbol || inferTokenSymbol(tokenAddress),
    }
  );
}

function rememberWallet(wallet: Wallet): ResolvedWalletConfig {
  const resolvedWallet = {
    walletSetId: wallet.walletSetId,
    walletId: wallet.id,
    walletAddress: wallet.address,
    blockchain: normalizeBlockchain(String(wallet.blockchain)),
  } satisfies ResolvedWalletConfig;

  runtimeWallets.set(resolvedWallet.blockchain, resolvedWallet);

  if (resolvedWallet.walletSetId) {
    runtimeWalletSetIds.set(resolvedWallet.blockchain, resolvedWallet.walletSetId);
  }

  return resolvedWallet;
}

function mapTransactionToTransferRecord(
  transaction: Transaction
): CircleTransferRecord {
  const metadata = transferMetadata.get(transaction.id);
  const fallbackBlockchain = metadata?.blockchain
    ? metadata.blockchain
    : typeof transaction.blockchain === "string"
      ? normalizeBlockchain(transaction.blockchain)
      : getConfig().defaultBlockchain;

  return {
    transferId: transaction.id,
    status: normalizeTransactionState(transaction.state),
    rawStatus: transaction.state,
    txHash: transaction.txHash || null,
    walletId: transaction.walletId || metadata?.walletId || null,
    walletAddress: metadata?.walletAddress || transaction.sourceAddress || null,
    sourceAddress: transaction.sourceAddress || metadata?.walletAddress || null,
    destinationAddress:
      transaction.destinationAddress || metadata?.destinationAddress || null,
    amount: transaction.amounts?.[0] || metadata?.amount || "0",
    tokenAddress:
      metadata?.tokenAddress || getDefaultTokenAddress(fallbackBlockchain),
    blockchain: metadata?.blockchain || fallbackBlockchain,
    referenceId: transaction.refId || metadata?.referenceId || "",
    createdAt: transaction.createDate,
    updatedAt: transaction.updateDate,
    errorReason: transaction.errorReason || transaction.errorDetails || null,
  };
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

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function normalizeBlockchain(
  blockchain: string | undefined
): CircleTransferBlockchain {
  const normalizedBlockchain = (blockchain || "ARC-TESTNET").toUpperCase();

  if (SUPPORTED_BLOCKCHAINS.has(normalizedBlockchain as CircleTransferBlockchain)) {
    return normalizedBlockchain as CircleTransferBlockchain;
  }

  throw new CircleTransferError(
    `Unsupported transfer blockchain ${blockchain}.`,
    400,
    "CIRCLE_TRANSFER_UNSUPPORTED_BLOCKCHAIN"
  );
}

function getDefaultTokenAddress(blockchain: CircleTransferBlockchain): string {
  const config = getConfig();

  if (config.defaultBlockchain === blockchain && config.defaultTokenAddress) {
    return config.defaultTokenAddress;
  }

  return DEFAULT_TOKEN_BY_CHAIN[blockchain];
}

function inferTokenSymbol(tokenAddress: string): string {
  const normalizedAddress = tokenAddress.toLowerCase();

  if (normalizedAddress === DEFAULT_TOKEN_BY_CHAIN["ETH-SEPOLIA"].toLowerCase()) {
    return "USDC";
  }

  if (normalizedAddress === "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4") {
    return "EURC";
  }

  if (normalizedAddress === "0x89b50855aa3be2f677cd6303cec089b5f319d72a") {
    return "EURC";
  }

  if (normalizedAddress === DEFAULT_TOKEN_BY_CHAIN["ARC-TESTNET"].toLowerCase()) {
    return "USDC";
  }

  return "tokens";
}

function normalizeTransactionState(
  state: string
): "pending" | "processing" | "settled" | "failed" {
  const normalizedState = state.toUpperCase();

  if (
    normalizedState === "COMPLETE" ||
    normalizedState === "CONFIRMED" ||
    normalizedState === "CLEARED"
  ) {
    return "settled";
  }

  if (normalizedState === "SENT" || normalizedState === "QUEUED") {
    return "processing";
  }

  if (
    normalizedState === "FAILED" ||
    normalizedState === "DENIED" ||
    normalizedState === "CANCELLED" ||
    normalizedState === "STUCK"
  ) {
    return "failed";
  }

  return "pending";
}

async function wrapCircleCall<T>(
  operation: () => Promise<T>,
  fallbackMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toCircleTransferError(error, fallbackMessage);
  }
}

function logWalletMappingError(details: Record<string, unknown>) {
  console.error("Circle wallet mapping mismatch", details);
}

function toCircleTransferError(
  error: unknown,
  fallbackMessage: string
): CircleTransferError {
  if (error instanceof CircleTransferError) {
    return error;
  }

  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  const status =
    getNumberField(error, "status") ||
    getNumberField(error, "statusCode") ||
    502;
  const circleCode = getNumberField(error, "code");
  const detailPayload = {
    circleCode: circleCode ?? null,
    circleMessage: message,
    method: getStringField(error, "method") ?? null,
    url: getStringField(error, "url") ?? null,
    upstreamDetails:
      getUnknownField(error, "details") ?? getUnknownField(error, "body") ?? null,
  };

  switch (circleCode) {
    case 156013:
    case 177604:
      return new CircleTransferError(
        "Circle rejected signed write calls for this developer-controlled wallet client. The current CIRCLE_ENTITY_SECRET does not match the Circle entity behind this API key, or it was pasted with extra whitespace. Standard API keys are supported here; this 156013 error is not caused by using Standard Key instead of Restricted Key.",
        503,
        "CIRCLE_ENTITY_SECRET_INVALID",
        detailPayload
      );
    case 156016:
    case 177605:
      return new CircleTransferError(
        "Circle developer-controlled wallet secret has not been registered for this API key yet. Register a new entity secret in Circle Console or with the SDK, update CIRCLE_ENTITY_SECRET, and restart the server.",
        503,
        "CIRCLE_ENTITY_SECRET_NOT_REGISTERED",
        detailPayload
      );
    case 156019:
    case 177606:
      return new CircleTransferError(
        "Circle developer-controlled wallet secret is stale or has been rotated. Generate and register a new entity secret for this API key, update CIRCLE_ENTITY_SECRET, and restart the server.",
        503,
        "CIRCLE_ENTITY_SECRET_ROTATED",
        detailPayload
      );
    case 156005:
      return new CircleTransferError(
        "Circle could not access the requested wallet set with the current developer-controlled wallet credentials. Use the matching entity secret or choose a wallet set that belongs to the current Circle entity.",
        503,
        "CIRCLE_WALLET_SET_NOT_ACCESSIBLE",
        detailPayload
      );
    case 177305:
      return new CircleTransferError(
        "Circle account is not eligible to create an SCA wallet on this blockchain yet. Configure the required paymaster or SCA wallet policy in Circle before bootstrapping this transfer wallet.",
        503,
        "CIRCLE_SCA_WALLET_CREATION_DISABLED",
        detailPayload
      );
    case 156006:
      return new CircleTransferError(
        "This Circle API key cannot be used for the requested blockchain environment. Use a TEST_API key for testnets and a LIVE_API key for mainnets.",
        503,
        "CIRCLE_API_KEY_BLOCKCHAIN_MISMATCH",
        detailPayload
      );
    case 156017:
      return new CircleTransferError(
        "Circle rejected the requested blockchain parameters for this wallet operation.",
        400,
        "CIRCLE_TRANSFER_BLOCKCHAIN_INVALID",
        detailPayload
      );
    default:
      return new CircleTransferError(
        message,
        status,
        "CIRCLE_API_ERROR",
        detailPayload
      );
  }
}

function getUnknownField(value: unknown, field: string): unknown {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  return value[field as keyof typeof value];
}

function getNumberField(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = value[field as keyof typeof value];
  return typeof fieldValue === "number" ? fieldValue : undefined;
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = value[field as keyof typeof value];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function fingerprintValue(value: string): string | null {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function extractApiKeyPrefix(value: string): string | null {
  if (!value) {
    return null;
  }

  const [prefix] = value.split(":", 1);
  return prefix || null;
}