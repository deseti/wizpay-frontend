import type {
  Abi,
  Address,
  Chain,
  Hex,
  PublicClient,
  WalletClient,
} from "viem";

import { ERC20_ABI } from "@/constants/erc20";

function resolveAccount(
  walletClient: WalletClient,
  accountOverride?: Address
): Address {
  const accountAddress = accountOverride ?? walletClient.account?.address;

  if (!accountAddress) {
    throw new Error("External wallet account is not available.");
  }

  return accountAddress;
}

export async function waitForTransaction(
  publicClient: PublicClient,
  hash: Hex,
  confirmations = 1
) {
  return publicClient.waitForTransactionReceipt({
    confirmations,
    hash,
  });
}

export async function writeContractTransaction({
  abi,
  account,
  address,
  args,
  chain,
  functionName,
  walletClient,
}: {
  abi: Abi;
  account?: Address;
  address: Address;
  args?: readonly unknown[];
  chain: Chain;
  functionName: string;
  walletClient: WalletClient;
}): Promise<Hex> {
  return walletClient.writeContract({
    abi,
    account: resolveAccount(walletClient, account),
    address,
    args,
    chain,
    functionName,
  } as Parameters<WalletClient["writeContract"]>[0]);
}

export async function sendNative({
  account,
  chain,
  to,
  value,
  walletClient,
}: {
  account?: Address;
  chain: Chain;
  to: Address;
  value: bigint;
  walletClient: WalletClient;
}): Promise<Hex> {
  return walletClient.sendTransaction({
    account: resolveAccount(walletClient, account),
    chain,
    to,
    value,
  });
}

export async function sendERC20({
  account,
  amount,
  chain,
  to,
  tokenAddress,
  walletClient,
}: {
  account?: Address;
  amount: bigint;
  chain: Chain;
  to: Address;
  tokenAddress: Address;
  walletClient: WalletClient;
}): Promise<Hex> {
  return writeContractTransaction({
    abi: ERC20_ABI,
    account,
    address: tokenAddress,
    args: [to, amount],
    chain,
    functionName: "transfer",
    walletClient,
  });
}

export async function approveToken({
  account,
  amount,
  chain,
  spender,
  tokenAddress,
  walletClient,
}: {
  account?: Address;
  amount: bigint;
  chain: Chain;
  spender: Address;
  tokenAddress: Address;
  walletClient: WalletClient;
}): Promise<Hex> {
  return writeContractTransaction({
    abi: ERC20_ABI,
    account,
    address: tokenAddress,
    args: [spender, amount],
    chain,
    functionName: "approve",
    walletClient,
  });
}
