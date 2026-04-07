import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { STABLE_FX_ADAPTER_ADDRESS } from "@/constants/addresses";
import { STABLE_FX_ADAPTER_ABI } from "@/constants/stablefx-abi";
import { ERC20_ABI } from "@/constants/erc20";
import type { Address } from "viem";

export function useLiquidity(tokenAddress: Address) {
  const { address } = useAccount();

  // Liquidity Vault total supply
  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: STABLE_FX_ADAPTER_ADDRESS,
    abi: STABLE_FX_ADAPTER_ABI,
    functionName: "totalSupply",
  });

  // User's LP Balance (SFX-LP is the adapter itself, which is an ERC20)
  const { data: lpBalance, refetch: refetchLpBalance } = useReadContract({
    address: STABLE_FX_ADAPTER_ADDRESS,
    abi: STABLE_FX_ADAPTER_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address },
  });

  // User's deposit token allowance to the adapter (for deposit)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as Address, STABLE_FX_ADAPTER_ADDRESS],
    query: { enabled: !!address },
  });

  // User's SFX-LP allowance to the adapter (for withdraw — adapter burns from msg.sender)
  // Note: The contract uses _burn(msg.sender, shares) which is internal,
  // so no external approval is needed. We track it anyway for UX consistency.
  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadContract({
    address: STABLE_FX_ADAPTER_ADDRESS,
    abi: STABLE_FX_ADAPTER_ABI,
    functionName: "allowance",
    args: [address as Address, STABLE_FX_ADAPTER_ADDRESS],
    query: { enabled: !!address },
  });

  // User's token balance (for deposit max)
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address },
  });

  // Contract Wrappers
  const { writeContractAsync: writeContract } = useWriteContract();

  const approveToken = async (amount: bigint) => {
    return await writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [STABLE_FX_ADAPTER_ADDRESS, amount],
    });
  };

  // Approve SFX-LP to adapter (for withdraw)
  const approveLpToken = async (amount: bigint) => {
    return await writeContract({
      address: STABLE_FX_ADAPTER_ADDRESS,
      abi: STABLE_FX_ADAPTER_ABI,
      functionName: "approve",
      args: [STABLE_FX_ADAPTER_ADDRESS, amount],
    });
  };

  const addLiquidity = async (amount: bigint) => {
    return await writeContract({
      address: STABLE_FX_ADAPTER_ADDRESS,
      abi: STABLE_FX_ADAPTER_ABI,
      functionName: "addLiquidity",
      args: [tokenAddress, amount],
    });
  };

  const removeLiquidity = async (shares: bigint) => {
    return await writeContract({
      address: STABLE_FX_ADAPTER_ADDRESS,
      abi: STABLE_FX_ADAPTER_ABI,
      functionName: "removeLiquidity",
      args: [tokenAddress, shares],
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
