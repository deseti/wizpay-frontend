import { keepPreviousData } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";

import { useActiveWalletAddress } from "@/hooks/useActiveWalletAddress";
import { useTransactionExecutor } from "@/hooks/useTransactionExecutor";
import {
  LIQUIDITY_ADDED_EVENT,
  LIQUIDITY_REMOVED_EVENT,
} from "@/constants/abi";
import { STABLE_FX_ADAPTER_V2_ADDRESS } from "@/constants/addresses";
import { STABLE_FX_ADAPTER_V2_ABI } from "@/constants/stablefx-abi";
import { ERC20_ABI } from "@/constants/erc20";
import { arcTestnet } from "@/lib/wagmi";

const POLL_INTERVAL_MS = 1500;
const MAX_CONFIRMATION_POLLS = 20;

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
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { walletAddress } = useActiveWalletAddress();
  const { executeTransaction } = useTransactionExecutor();

  // Liquidity Vault total supply
  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    chainId: arcTestnet.id,
    functionName: "totalSupply",
    query: {
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    },
  });

  // User's LP Balance (SFX-LP is the adapter itself, which is an ERC20)
  const {
    data: lpBalance,
    refetch: refetchLpBalance,
    isLoading: lpBalanceLoading,
  } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    chainId: arcTestnet.id,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
  });

  // User's deposit token allowance to the adapter (for deposit)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "allowance",
    args: walletAddress
      ? [walletAddress, STABLE_FX_ADAPTER_V2_ADDRESS]
      : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
  });

  // User's SFX-LP allowance to the adapter (for withdraw — adapter burns from msg.sender)
  // Note: The contract uses _burn(msg.sender, shares) which is internal,
  // so no external approval is needed. We track it anyway for UX consistency.
  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadContract({
    address: STABLE_FX_ADAPTER_V2_ADDRESS,
    abi: STABLE_FX_ADAPTER_V2_ABI,
    chainId: arcTestnet.id,
    functionName: "allowance",
    args: walletAddress
      ? [walletAddress, STABLE_FX_ADAPTER_V2_ADDRESS]
      : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
  });

  // User's token balance (for deposit max)
  const {
    data: tokenBalance,
    refetch: refetchTokenBalance,
    isLoading: tokenBalanceLoading,
  } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    chainId: arcTestnet.id,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: !!walletAddress,
      staleTime: 10_000,
      placeholderData: keepPreviousData,
    },
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

  const executeManagedWrite = async ({
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
      throw new Error("Connect the active wallet before managing liquidity.");
    }

    const executionResult = await executeTransaction({
      abi,
      args,
      chainId: arcTestnet.id,
      contractAddress,
      functionName,
      refId,
    });

    if (executionResult.txHash && publicClient) {
      await publicClient.waitForTransactionReceipt({
        hash: executionResult.txHash,
        confirmations: 1,
      });
    }

    const recoveredTxHash =
      executionResult.txHash ??
      (recoverTxHash ? await recoverTxHash(executionResult.startBlock) : null);

    return recoveredTxHash ?? executionResult.referenceId;
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
    const txRef = await executeManagedWrite({
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
    return await executeManagedWrite({
      abi: STABLE_FX_ADAPTER_V2_ABI,
      args: [STABLE_FX_ADAPTER_V2_ADDRESS, amount],
      contractAddress: STABLE_FX_ADAPTER_V2_ADDRESS,
      functionName: "approve",
      refId: `liquidity-lp-approve-${Date.now()}`,
    });
  };

  const addLiquidity = async (amount: bigint) => {
    return await executeManagedWrite({
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
    return await executeManagedWrite({
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

  const refetchAll = () =>
    Promise.all([
      refetchTotalSupply(),
      refetchLpBalance(),
      refetchAllowance(),
      refetchLpAllowance(),
      refetchTokenBalance(),
    ]);

  return {
    totalSupply: (totalSupply as bigint) || 0n,
    lpBalance: (lpBalance as bigint) || 0n,
    allowance: (allowance as bigint) || 0n,
    lpAllowance: (lpAllowance as bigint) || 0n,
    tokenBalance: (tokenBalance as bigint) || 0n,
    isLpBalanceLoading: Boolean(walletAddress) && lpBalanceLoading,
    isTokenBalanceLoading: Boolean(walletAddress) && tokenBalanceLoading,
    approveToken,
    approveLpToken,
    addLiquidity,
    removeLiquidity,
    refetchAll,
  };
}
