"use client";

import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useHybridWallet } from "@/components/providers/HybridWalletProvider";
import { writeContractTransaction } from "@/lib/web3-transactions";
import {
  arcTestnet,
  CHAIN_BY_ID,
  CHAIN_NAME_BY_ID,
  ethereumSepolia,
} from "@/lib/wagmi";

const CIRCLE_FEE_LEVEL = "MEDIUM";

export type ExecuteTransactionParams = {
  abi: Abi;
  args?: readonly unknown[];
  chainId?: number;
  contractAddress: Address;
  functionName: string;
  memo?: string;
  refId: string;
};

export type ExecuteTransactionResult = {
  hash: string;
  referenceId: string;
  startBlock: bigint;
  txHash: Hex | null;
};

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

  return /^0x[a-fA-F0-9]{64}$/.test(candidate ?? "")
    ? (candidate as Hex)
    : null;
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

function extractCircleSignature(value: unknown): Hex | null {
  const candidate =
    getNestedString(value, ["data", "signature"]) ??
    getNestedString(value, ["signature"]);

  return /^0x[a-fA-F0-9]+$/.test(candidate ?? "")
    ? (candidate as Hex)
    : null;
}

export function useTransactionExecutor() {
  const {
    activeWalletAddress,
    activeWalletChainId,
    walletMode,
  } = useHybridWallet();
  const {
    arcWallet,
    createContractExecutionChallenge,
    createTypedDataChallenge,
    executeChallenge,
    sepoliaWallet,
  } = useCircleWallet();
  const arcPublicClient = usePublicClient({ chainId: arcTestnet.id });
  const sepoliaPublicClient = usePublicClient({ chainId: ethereumSepolia.id });
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const getPublicClientForChain = (chainId: number) => {
    if (chainId === arcTestnet.id) {
      return arcPublicClient;
    }

    if (chainId === ethereumSepolia.id) {
      return sepoliaPublicClient;
    }

    return null;
  };

  const getCircleWalletForChain = (chainId: number) => {
    if (chainId === ethereumSepolia.id) {
      return sepoliaWallet;
    }

    return arcWallet;
  };

  const ensureExternalChain = async (targetChainId: number) => {
    if (activeWalletChainId === targetChainId) {
      return;
    }

    if (!switchChainAsync) {
      throw new Error(
        `Switch your external wallet to ${CHAIN_NAME_BY_ID[targetChainId] ?? `chain ${targetChainId}`} to continue.`
      );
    }

    try {
      await switchChainAsync({ chainId: targetChainId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

      if (message.includes("rejected")) {
        throw new Error("Network switch was rejected in your wallet.");
      }

      throw new Error(
        `Failed to switch the external wallet to ${CHAIN_NAME_BY_ID[targetChainId] ?? `chain ${targetChainId}`}.`
      );
    }
  };

  const getExternalWalletClient = async (targetChainId: number) => {
    await ensureExternalChain(targetChainId);

    const refreshed = await refetchWalletClient();
    const nextWalletClient = refreshed.data ?? walletClient;

    if (!nextWalletClient) {
      throw new Error(
        "External wallet client is not ready. Reconnect the wallet and try again."
      );
    }

    return nextWalletClient;
  };

  const executeWithCircle = async (
    params: ExecuteTransactionParams
  ): Promise<ExecuteTransactionResult> => {
    const chainId = params.chainId ?? arcTestnet.id;
    const publicClient = getPublicClientForChain(chainId);
    const startBlock = publicClient ? await publicClient.getBlockNumber() : 0n;
    const targetWallet = getCircleWalletForChain(chainId);

    if (!targetWallet?.id) {
      throw new Error(
        `${getWalletLabelForChain(chainId)} is not ready yet. Refresh the session and try again.`
      );
    }

    const callData = encodeFunctionData({
      abi: params.abi,
      args: params.args,
      functionName: params.functionName,
    });

    const challenge = await createContractExecutionChallenge({
      walletId: targetWallet.id,
      contractAddress: params.contractAddress,
      callData,
      feeLevel: CIRCLE_FEE_LEVEL,
      memo: params.memo,
      refId: params.refId,
    });

    const challengeResult = await executeChallenge(challenge.challengeId);
    const txHash =
      extractCircleTxHash(challengeResult) ??
      extractCircleTxHash(challenge.raw);
    const referenceId =
      extractCircleReference(challengeResult) ??
      extractCircleReference(challenge.raw) ??
      challenge.challengeId;

    return {
      hash: txHash ?? referenceId,
      referenceId,
      startBlock,
      txHash,
    };
  };

  const executeWithViem = async (
    params: ExecuteTransactionParams
  ): Promise<ExecuteTransactionResult> => {
    const chainId = params.chainId ?? arcTestnet.id;
    const chain = CHAIN_BY_ID[chainId];
    const publicClient = getPublicClientForChain(chainId);

    if (!chain || !publicClient) {
      throw new Error(
        `Chain ${chainId} is not configured for external wallet transactions.`
      );
    }

    if (!activeWalletAddress) {
      throw new Error("Connect an external wallet before sending a transaction.");
    }

    const startBlock = await publicClient.getBlockNumber();
    const nextWalletClient = await getExternalWalletClient(chainId);
    const txHash = await writeContractTransaction({
      abi: params.abi,
      account: activeWalletAddress,
      address: params.contractAddress,
      args: params.args,
      chain,
      functionName: params.functionName,
      walletClient: nextWalletClient,
    });

    return {
      hash: txHash,
      referenceId: params.refId,
      startBlock,
      txHash,
    };
  };

  const executeTransaction = async (
    params: ExecuteTransactionParams
  ): Promise<ExecuteTransactionResult> => {
    if (walletMode === "circle") {
      return executeWithCircle(params);
    }

    return executeWithViem(params);
  };

  const signTypedData = async ({
    chainId = arcTestnet.id,
    memo,
    typedData,
  }: {
    chainId?: number;
    memo?: string;
    typedData: Record<string, unknown>;
  }): Promise<Hex> => {
    if (walletMode === "circle") {
      const targetWallet = getCircleWalletForChain(chainId);

      if (!targetWallet?.id) {
        throw new Error(
          `${getWalletLabelForChain(chainId)} is not ready for signing yet.`
        );
      }

      const challenge = await createTypedDataChallenge({
        walletId: targetWallet.id,
        data: JSON.stringify(typedData),
        memo,
      });
      const challengeResult = await executeChallenge(challenge.challengeId);
      const signature =
        extractCircleSignature(challengeResult) ??
        extractCircleSignature(challenge.raw);

      if (!signature) {
        throw new Error("Circle did not return a typed-data signature.");
      }

      return signature;
    }

    if (!activeWalletAddress) {
      throw new Error("Connect an external wallet before signing typed data.");
    }

    const nextWalletClient = await getExternalWalletClient(chainId);
    const signature = await nextWalletClient.request({
      method: "eth_signTypedData_v4",
      params: [activeWalletAddress, JSON.stringify(typedData)],
    });

    return signature as Hex;
  };

  return {
    executeTransaction,
    signTypedData,
  };
}

function getWalletLabelForChain(chainId: number) {
  if (chainId === ethereumSepolia.id) {
    return "Circle Sepolia wallet";
  }

  return "Circle Arc wallet";
}
