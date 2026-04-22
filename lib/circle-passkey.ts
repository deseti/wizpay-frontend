"use client";

import {
  createAddressMapping,
  modularWalletActions,
  OwnerIdentifierType,
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  type WebAuthnCredential,
} from "@circle-fin/modular-wallets-core";
import { formatUnits, createPublicClient, http, type Address, type Hex } from "viem";
import {
  createBundlerClient,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import type { Transport } from "viem";
import { parsePublicKey } from "webauthn-p256";

import { ERC20_ABI } from "@/constants/erc20";
import { TOKEN_OPTIONS } from "@/lib/wizpay";
import {
  ARC_TESTNET_RPC_URL,
  ETHEREUM_SEPOLIA_RPC_URL,
  arcTestnet,
  ethereumSepolia,
} from "@/lib/wagmi";

const DEFAULT_CIRCLE_PASSKEY_CLIENT_URL =
  "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

export const PASSKEY_CREDENTIAL_STORAGE_KEY =
  "wizpay.circle.passkey.credential";
export const PASSKEY_USERNAME_STORAGE_KEY = "wizpay.circle.passkey.username";
export const PASSKEY_ARC_WALLET_ID = "circle-passkey-arc-testnet";
export const PASSKEY_SEPOLIA_WALLET_ID = "circle-passkey-eth-sepolia";

export type PasskeyWalletDescriptor = {
  id: string;
  address: string;
  accountType?: string;
  blockchain: string;
};

export type PasskeyChainRuntime = {
  account: Awaited<ReturnType<typeof toCircleSmartAccount>>;
  addressMappingReady: boolean;
  bundlerClient: ReturnType<typeof createBundlerClient>;
  chainId: number;
  credential: WebAuthnCredential;
  readPublicClient: ReturnType<typeof createPublicClient>;
  transportMode: "circle-modular" | "rpc-fallback";
  walletPublicClient: ReturnType<typeof createPublicClient>;
  wallet: PasskeyWalletDescriptor;
};

export type PasskeyRuntimeSet = {
  arc: PasskeyChainRuntime | null;
  byWalletId: Map<string, PasskeyChainRuntime>;
  sepolia: PasskeyChainRuntime | null;
  wallets: PasskeyWalletDescriptor[];
};

type PasskeyChainConfig = {
  blockchain: string;
  chain: typeof arcTestnet | typeof ethereumSepolia;
  modularUrl: string | null;
  readRpcUrl: string;
  walletId: string;
};

export type CirclePasskeyConfig = {
  arcModularUrl: string | null;
  clientKey: string;
  clientUrl: string;
  rpId: string;
  sepoliaModularUrl: string | null;
};

export type PasskeyTokenBalance = {
  amount: string;
  raw: Record<string, unknown>;
  symbol: string | null;
  tokenAddress: string | null;
  updatedAt: string | null;
};

function normalizeOptionalUrl(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const directMessage = record.message;

    if (typeof directMessage === "string") {
      return directMessage;
    }

    const nestedError = record.error as Record<string, unknown> | undefined;

    if (typeof nestedError?.message === "string") {
      return nestedError.message;
    }
  }

  return "";
}

function isUnsupportedBlockchainError(error: unknown) {
  return getErrorText(error)
    .toLowerCase()
    .includes("specified blockchain is either not supported or deprecated");
}

function isBundlerRpcUnavailableError(error: unknown) {
  const normalized = getErrorText(error).toLowerCase();

  return (
    normalized.includes("eth_senduseroperation") ||
    normalized.includes("eth_getuseroperationreceipt") ||
    normalized.includes("method not found") ||
    normalized.includes("does not exist") ||
    normalized.includes("is not available") ||
    normalized.includes("unsupported")
  );
}

export function getCirclePasskeyConfig(): CirclePasskeyConfig {
  const clientUrl =
    process.env.NEXT_PUBLIC_CIRCLE_PASSKEY_CLIENT_URL?.trim() ||
    DEFAULT_CIRCLE_PASSKEY_CLIENT_URL;
  const defaultArcModularUrl = `${clientUrl}/arcTestnet`;

  return {
    arcModularUrl:
      normalizeOptionalUrl(
        process.env.NEXT_PUBLIC_CIRCLE_PASSKEY_MODULAR_RPC_URL_ARC_TESTNET
      ) ?? defaultArcModularUrl,
    clientKey: process.env.NEXT_PUBLIC_CIRCLE_PASSKEY_CLIENT_KEY?.trim() || "",
    clientUrl,
    rpId:
      process.env.NEXT_PUBLIC_CIRCLE_PASSKEY_RP_ID?.trim() || "app.wizpay.xyz",
    sepoliaModularUrl: normalizeOptionalUrl(
      process.env.NEXT_PUBLIC_CIRCLE_PASSKEY_MODULAR_RPC_URL_ETH_SEPOLIA
    ),
  };
}

export function getPasskeySupportError(
  config: CirclePasskeyConfig = getCirclePasskeyConfig()
) {
  if (!config.clientKey) {
    return "NEXT_PUBLIC_CIRCLE_PASSKEY_CLIENT_KEY is missing. Add the Circle modular-wallet client key first.";
  }

  if (!config.clientUrl) {
    return "NEXT_PUBLIC_CIRCLE_PASSKEY_CLIENT_URL is missing. Add the Circle modular-wallet client URL first.";
  }

  if (typeof window === "undefined") {
    return null;
  }

  if (!window.isSecureContext) {
    return `Passkey sign-in requires HTTPS on ${config.rpId}.`;
  }

  if (
    typeof window.PublicKeyCredential === "undefined" ||
    typeof window.navigator?.credentials === "undefined"
  ) {
    return "This browser does not support passkey authentication.";
  }

  if (config.rpId && window.location.hostname !== config.rpId) {
    return `Passkey sign-in is bound to ${config.rpId}. Open https://${config.rpId} to continue.`;
  }

  return null;
}

export function readStoredPasskeyCredential() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as WebAuthnCredential;
  } catch {
    return null;
  }
}

export function storePasskeyCredential(credential: WebAuthnCredential) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PASSKEY_CREDENTIAL_STORAGE_KEY,
    JSON.stringify(credential)
  );
}

export function clearStoredPasskeyCredential() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
}

export function readStoredPasskeyUsername() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(PASSKEY_USERNAME_STORAGE_KEY);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function storePasskeyUsername(username: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!username) {
    window.localStorage.removeItem(PASSKEY_USERNAME_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PASSKEY_USERNAME_STORAGE_KEY, username);
}

function getPasskeyChains(config: CirclePasskeyConfig): PasskeyChainConfig[] {
  return [
    {
      blockchain: "ARC-TESTNET",
      chain: arcTestnet,
      modularUrl: config.arcModularUrl,
      readRpcUrl: ARC_TESTNET_RPC_URL,
      walletId: PASSKEY_ARC_WALLET_ID,
    },
    {
      blockchain: "ETH-SEPOLIA",
      chain: ethereumSepolia,
      modularUrl: config.sepoliaModularUrl,
      readRpcUrl: ETHEREUM_SEPOLIA_RPC_URL,
      walletId: PASSKEY_SEPOLIA_WALLET_ID,
    },
  ];
}

function createPasskeyOwner(
  credential: WebAuthnCredential,
  rpId: string
) {
  return toWebAuthnAccount({
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
    },
    rpId: credential.rpId ?? rpId,
  });
}

async function createPasskeyRuntime(
  chainConfig: PasskeyChainConfig,
  config: CirclePasskeyConfig,
  credential: WebAuthnCredential,
  username: string | null
): Promise<PasskeyChainRuntime> {
  const readPublicClient = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.readRpcUrl),
  });
  const owner = createPasskeyOwner(credential, config.rpId);

  const buildRuntime = async ({
    transport,
    transportMode,
  }: {
    transport: Transport;
    transportMode: PasskeyChainRuntime["transportMode"];
  }): Promise<PasskeyChainRuntime> => {
    const walletPublicClient = createPublicClient({
      chain: chainConfig.chain,
      transport,
    });
    const bundlerClient = createBundlerClient({
      chain: chainConfig.chain,
      transport,
    });
    const account = await toCircleSmartAccount({
      client: walletPublicClient,
      name: username ?? undefined,
      owner,
    });
    const address = await account.getAddress();

    return {
      account,
      addressMappingReady: false,
      bundlerClient,
      chainId: chainConfig.chain.id,
      credential,
      readPublicClient,
      transportMode,
      wallet: {
        accountType: "SMART_WALLET",
        address,
        blockchain: chainConfig.blockchain,
        id: chainConfig.walletId,
      },
      walletPublicClient,
    };
  };

  if (chainConfig.modularUrl) {
    try {
      const modularTransport = toModularTransport(
        chainConfig.modularUrl,
        config.clientKey
      );

      return await buildRuntime({
        transport: modularTransport,
        transportMode: "circle-modular",
      });
    } catch (error) {
      if (!isUnsupportedBlockchainError(error)) {
        throw error;
      }
    }
  }

  return buildRuntime({
    transport: http(chainConfig.readRpcUrl),
    transportMode: "rpc-fallback",
  });
}

export async function createPasskeyRuntimeSet({
  config = getCirclePasskeyConfig(),
  credential,
  username,
}: {
  config?: CirclePasskeyConfig;
  credential: WebAuthnCredential;
  username: string | null;
}): Promise<PasskeyRuntimeSet> {
  const runtimes = await Promise.all(
    getPasskeyChains(config).map((chainConfig) =>
      createPasskeyRuntime(chainConfig, config, credential, username)
    )
  );

  const byWalletId = new Map<string, PasskeyChainRuntime>();

  runtimes.forEach((runtime) => {
    byWalletId.set(runtime.wallet.id, runtime);
  });

  return {
    arc: runtimes.find((runtime) => runtime.wallet.id === PASSKEY_ARC_WALLET_ID) ?? null,
    byWalletId,
    sepolia:
      runtimes.find((runtime) => runtime.wallet.id === PASSKEY_SEPOLIA_WALLET_ID) ??
      null,
    wallets: runtimes.map((runtime) => runtime.wallet),
  };
}

export async function registerWithPasskey(
  username: string,
  config: CirclePasskeyConfig = getCirclePasskeyConfig()
) {
  const credential = await toWebAuthnCredential({
    mode: WebAuthnMode.Register,
    transport: toPasskeyTransport(config.clientUrl, config.clientKey),
    username,
  });

  return {
    credential,
    username,
  };
}

export async function loginWithPasskey(
  config: CirclePasskeyConfig = getCirclePasskeyConfig()
) {
  return toWebAuthnCredential({
    mode: WebAuthnMode.Login,
    transport: toPasskeyTransport(config.clientUrl, config.clientKey),
  });
}

export async function getPasskeyTokenBalances(
  runtime: PasskeyChainRuntime
): Promise<PasskeyTokenBalance[]> {
  const updatedAt = new Date().toISOString();
  const balanceClient =
    runtime.transportMode === "circle-modular"
      ? runtime.walletPublicClient
      : runtime.readPublicClient;

  const balances: PasskeyTokenBalance[] = [];

  for (const token of TOKEN_OPTIONS) {
    try {
      const amount = await balanceClient.readContract({
        abi: ERC20_ABI,
        address: token.address,
        args: [runtime.wallet.address as Address],
        functionName: "balanceOf",
      });
      const normalizedAmount = formatUnits(amount, token.decimals);

      balances.push({
        amount: normalizedAmount,
        raw: {
          amount: amount.toString(),
          blockchain: runtime.wallet.blockchain,
          source: "passkey",
          tokenAddress: token.address,
        },
        symbol: token.symbol,
        tokenAddress: token.address,
        updatedAt,
      });
    } catch {
      continue;
    }
  }

  return balances;
}

async function ensurePasskeyAddressMapping(runtime: PasskeyChainRuntime) {
  if (runtime.transportMode !== "circle-modular" || runtime.addressMappingReady) {
    return;
  }

  try {
    const publicKeyOwner = parsePublicKey(runtime.credential.publicKey);

    await createAddressMapping(runtime.walletPublicClient, {
      walletAddress: runtime.wallet.address as Hex,
      owners: [
        {
          type: OwnerIdentifierType.WebAuthn,
          identifier: {
            publicKeyX: publicKeyOwner.x.toString(),
            publicKeyY: publicKeyOwner.y.toString(),
          },
        },
      ],
    });
  } catch (error) {
    const normalizedMessage = getErrorText(error).toLowerCase();

    if (
      !normalizedMessage.includes("already exists") &&
      !normalizedMessage.includes("already known")
    ) {
      throw error;
    }
  }

  runtime.addressMappingReady = true;
}

async function getPasskeyUserOperationFees(runtime: PasskeyChainRuntime) {
  if (runtime.transportMode !== "circle-modular") {
    return {};
  }

  const modularClient = runtime.walletPublicClient.extend(modularWalletActions);
  const gasPrice = await modularClient.getUserOperationGasPrice();
  const preferredLevel = gasPrice.medium ?? gasPrice.high ?? gasPrice.low;

  if (!preferredLevel?.maxFeePerGas || !preferredLevel?.maxPriorityFeePerGas) {
    throw new Error(
      `Circle did not return user-operation gas fees for ${runtime.wallet.blockchain}.`
    );
  }

  return {
    maxFeePerGas: BigInt(preferredLevel.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(preferredLevel.maxPriorityFeePerGas),
  };
}

export async function sendPasskeyUserOperation({
  callData,
  contractAddress,
  runtime,
}: {
  callData: Hex;
  contractAddress: Address;
  runtime: PasskeyChainRuntime;
}) {
  try {
    await ensurePasskeyAddressMapping(runtime);
    const userOperationFees = await getPasskeyUserOperationFees(runtime);

    const userOpHash = await runtime.bundlerClient.sendUserOperation({
      account: runtime.account,
      calls: [{ data: callData, to: contractAddress }],
      ...userOperationFees,
      paymaster: runtime.transportMode === "circle-modular" ? true : undefined,
    });
    const receipt = await runtime.bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    return {
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };
  } catch (error) {
    if (
      runtime.transportMode === "rpc-fallback" &&
      isBundlerRpcUnavailableError(error)
    ) {
      throw new Error(
        `Passkey transactions on ${runtime.wallet.blockchain} require a chain-specific Circle modular RPC URL. Configure the corresponding NEXT_PUBLIC_CIRCLE_PASSKEY_MODULAR_RPC_URL_* value for this chain.`
      );
    }

    throw error;
  }
}

export async function signPasskeyTypedData({
  runtime,
  typedDataJson,
}: {
  runtime: PasskeyChainRuntime;
  typedDataJson: string;
}): Promise<Hex> {
  const typedData = JSON.parse(
    typedDataJson
  ) as Parameters<PasskeyChainRuntime["account"]["signTypedData"]>[0];

  return runtime.account.signTypedData(typedData);
}