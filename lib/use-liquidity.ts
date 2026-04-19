import { encodeFunctionData, type Address, type Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";

import { useCircleWallet } from "@/components/providers/CircleWalletProvider";
import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import {
  LIQUIDITY_ADDED_EVENT,
  LIQUIDITY_REMOVED_EVENT,
} from "@/constants/abi";
import { STABLE_FX_ADAPTER_V2_ADDRESS } from "@/constants/addresses";
import { STABLE_FX_ADAPTER_V2_ABI } from "@/constants/stablefx-abi";
import { ERC20_ABI } from "@/constants/erc20";

const CIRCLE_FEE_LEVEL = "MEDIUM";
const POLL_INTERVAL_MS = 1500;
const MAX_CONFIRMATION_POLLS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedString(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    if (!isRecord(current) || typeof current[key] === "undefined") {
      return null;
    }

    current = current[key];
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

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type LiquidityAddedLog = {
  transactionHash: Hex | null;
  args: {
    amountIn?: bigint;
    sharesMinted?: bigint;
    token?: Address;
  };
};

type LiquidityRemovedLog = {
  transactionHash: Hex | null;
  args: {
    amountOut?: bigint;
    sharesBurned?: bigint;
    token?: Address;
  };
};

export function useLiquidity(tokenAddress: Address) {
  const publicClient = usePublicClient();
  const { walletAddress } = useActiveWalletAddress();
  const { arcWallet, createContractExecutionChallenge, executeChallenge } =
    useCircleWallet();

  // Liquidity Vault total supply
  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    functionName: "totalSupply",
  });

  // User's LP Balance (SFX-LP is the adapter itself, which is an ERC20)
  const { data: lpBalance, refetch: refetchLpBalance } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  });

  // User's deposit token allowance to the adapter (for deposit)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: walletAddress
      ? [walletAddress, STABLE_FX_ADAPTER_V2_ADDRESS]
      : undefined,
    query: { enabled: !!walletAddress },
  });

  // User's SFX-LP allowance to the adapter (for withdraw — adapter burns from msg.sender)
  // Note: The contract uses _burn(msg.sender, shares) which is internal,
  // so no external approval is needed. We track it anyway for UX consistency.
  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    functionName: "allowance",
    args: walletAddress
      ? [walletAddress, STABLE_FX_ADAPTER_V2_ADDRESS]
      : undefined,
    query: { enabled: !!walletAddress },
  });

  // User's token balance (for deposit max)
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: !!walletAddress },
  });

  const waitForLiquidityEvent = async ({
    amount,
    shares,
    startBlock,
    type,
  }: {
    amount?: bigint;
    shares?: bigint;
    startBlock: bigint;
    type: "add" | "remove";
  }) => {
    if (!publicClient) {
      return null;
    }

    for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
      if (type === "add") {
        const logs = (await publicClient.getLogs({
          address: STABLE_FX_ADAPTER_V2_ADDRESS,
          event: LIQUIDITY_ADDED_EVENT,
          args: { token: tokenAddress },
          fromBlock: startBlock,
        })) as LiquidityAddedLog[];

        const matchedLog = logs.find(
          (log) =>
            Boolean(log.transactionHash) &&
            (typeof amount === "bigint" ? log.args.amountIn === amount : true)
        );

        if (matchedLog?.transactionHash) {
          return matchedLog.transactionHash;
        }
      } else {
        const logs = (await publicClient.getLogs({
          address: STABLE_FX_ADAPTER_V2_ADDRESS,
          event: LIQUIDITY_REMOVED_EVENT,
          args: { token: tokenAddress },
          fromBlock: startBlock,
        })) as LiquidityRemovedLog[];

        const matchedLog = logs.find(
          (log) =>
            Boolean(log.transactionHash) &&
            (typeof shares === "bigint" ? log.args.sharesBurned === shares : true)
        );

        if (matchedLog?.transactionHash) {
          return matchedLog.transactionHash;
        }
      }

      if (attempt < MAX_CONFIRMATION_POLLS - 1) {
        await waitFor(POLL_INTERVAL_MS);
      }
    }

    return null;
  };

  const executeCircleWrite = async ({
    abi,
    args,
    contractAddress,
    functionName,
    recoverTxHash,
    refId,
  }: {
    abi: typeof ERC20_ABI | typeof STABLE_FX_ADAPTER_V2_ABI;
    args: readonly unknown[];
    contractAddress: Address;
    functionName: string;
    recoverTxHash?: (startBlock: bigint) => Promise<Hex | null>;
    refId: string;
  }) => {
    if (!walletAddress) {
      throw new Error("Sign in with your Circle Arc wallet before managing liquidity.");
    }

    if (!arcWallet?.id) {
      throw new Error(
        "Circle Arc wallet metadata is missing. Refresh the session and try again."
      );
    }

    const callData = (encodeFunctionData as any)({
      abi,
      functionName,
      args,
    });
    const startBlock = publicClient ? await publicClient.getBlockNumber() : 0n;

    const challenge = await createContractExecutionChallenge({
      walletId: arcWallet.id,
      contractAddress,
      callData,
      feeLevel: CIRCLE_FEE_LEVEL,
      refId,
    });

    const challengeResult = await executeChallenge(challenge.challengeId);
    const txHash =
      extractCircleTxHash(challengeResult) ?? extractCircleTxHash(challenge.raw);

    if (txHash && publicClient) {
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });
    }

    const recoveredTxHash =
      txHash ?? (recoverTxHash ? await recoverTxHash(startBlock) : null);

    return (
      recoveredTxHash ??
      extractCircleReference(challengeResult) ??
      extractCircleReference(challenge.raw) ??
      challenge.challengeId
    );
  };

  const waitForAllowanceUpdate = async (targetAmount: bigint) => {
    for (let attempt = 0; attempt < MAX_CONFIRMATION_POLLS; attempt += 1) {
      const result = await refetchAllowance();
      const nextAllowance = result.data ?? 0n;

      if (nextAllowance >= targetAmount) {
        return;
      }

      if (attempt < MAX_CONFIRMATION_POLLS - 1) {
        await waitFor(POLL_INTERVAL_MS);
      }
    }

    throw new Error(
      "Circle approval completed, but the token allowance did not update before the timeout window ended."
    );
  };

  const approveToken = async (amount: bigint) => {
    const txRef = await executeCircleWrite({
      abi: ERC20_ABI,
      args: [STABLE_FX_ADAPTER_V2_ADDRESS, amount],
      contractAddress: tokenAddress,
      functionName: "approve",
      refId: `liquidity-approve-${Date.now()}`,
    });

    await waitForAllowanceUpdate(amount);
    return txRef;
  };

  // Approve SFX-LP to adapter (for withdraw)
  const approveLpToken = async (amount: bigint) => {
    return await executeCircleWrite({
      abi: STABLE_FX_ADAPTER_V2_ABI,
      args: [STABLE_FX_ADAPTER_V2_ADDRESS, amount],
      contractAddress: STABLE_FX_ADAPTER_V2_ADDRESS,
      functionName: "approve",
      refId: `liquidity-lp-approve-${Date.now()}`,
    });
  };

  const addLiquidity = async (amount: bigint) => {
    return await executeCircleWrite({
      abi: STABLE_FX_ADAPTER_V2_ABI,
      args: [tokenAddress, amount],
      contractAddress: STABLE_FX_ADAPTER_V2_ADDRESS,
      functionName: "addLiquidity",
      recoverTxHash: (startBlock) =>
        waitForLiquidityEvent({
          amount,
          startBlock,
          type: "add",
        }),
      refId: `liquidity-add-${Date.now()}`,
    });
  };

  const removeLiquidity = async (shares: bigint) => {
    return await executeCircleWrite({
      abi: STABLE_FX_ADAPTER_V2_ABI,
      args: [tokenAddress, shares],
      contractAddress: STABLE_FX_ADAPTER_V2_ADDRESS,
      functionName: "removeLiquidity",
      recoverTxHash: (startBlock) =>
        waitForLiquidityEvent({
          shares,
          startBlock,
          type: "remove",
        }),
      refId: `liquidity-remove-${Date.now()}`,
    });
  };

  const refetchAll = () => {
    refetchTotalSupply();
    refetchLpBalance();
    refetchAllowance();
    refetchLpAllowance();
    refetchTokenBalance();
  };

  return {
    totalSupply: (totalSupply as bigint) || 0n,
    lpBalance: (lpBalance as bigint) || 0n,
    allowance: (allowance as bigint) || 0n,
    lpAllowance: (lpAllowance as bigint) || 0n,
    tokenBalance: (tokenBalance as bigint) || 0n,
    approveToken,
    approveLpToken,
    addLiquidity,
    removeLiquidity,
    refetchAll,
  };
}
