import type { ChainDefinition } from "@circle-fin/app-kit";
import { ArcTestnet, EthereumSepolia } from "@circle-fin/app-kit/chains";

import {
  ARC_TESTNET_RPC_URL,
  ETHEREUM_SEPOLIA_RPC_URL,
} from "@/lib/wagmi";

export type CircleBridgeDirection = "arc-to-sepolia" | "sepolia-to-arc";

const BRIDGE_MIGRATION_MESSAGE =
  "Bridge execution is being migrated from the old Privy adapter path to Circle Web3 Services challenges.";

function withExplicitRpcEndpoints(
  chain: ChainDefinition,
  rpcEndpoint: string
): ChainDefinition {
  return {
    ...chain,
    rpcEndpoints: [rpcEndpoint],
  };
}

const circleArcTestnet = withExplicitRpcEndpoints(
  ArcTestnet,
  ARC_TESTNET_RPC_URL
);
const circleEthereumSepolia = withExplicitRpcEndpoints(
  EthereumSepolia,
  ETHEREUM_SEPOLIA_RPC_URL
);

export const CIRCLE_BRIDGE_DIRECTIONS: Array<{
  id: CircleBridgeDirection;
  label: string;
  source: ChainDefinition;
  destination: ChainDefinition;
}> = [
  {
    id: "arc-to-sepolia",
    label: "Arc Testnet -> Ethereum Sepolia",
    source: circleArcTestnet,
    destination: circleEthereumSepolia,
  },
  {
    id: "sepolia-to-arc",
    label: "Ethereum Sepolia -> Arc Testnet",
    source: circleEthereumSepolia,
    destination: circleArcTestnet,
  },
];

function throwBridgeMigrationError(): never {
  throw new Error(BRIDGE_MIGRATION_MESSAGE);
}

export function createCircleBridgeAdapter(_wallet?: unknown) {
  return throwBridgeMigrationError();
}

export type CircleBridgeAdapter = ReturnType<typeof createCircleBridgeAdapter>;

export function createCircleBridgeAdapterFromSmartWallets(
  _getSmartWalletClientForChain?: unknown
) {
  return throwBridgeMigrationError();
}

export async function estimateCircleBridge(_params: unknown) {
  return throwBridgeMigrationError();
}

export async function executeCircleBridge(_params: unknown) {
  return throwBridgeMigrationError();
}

export async function retryCircleBridge(_params: unknown) {
  return throwBridgeMigrationError();
}
