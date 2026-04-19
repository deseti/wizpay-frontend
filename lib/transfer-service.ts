export interface CircleTransferStep {
  id: string;
  name: string;
  state: "pending" | "success" | "error" | "noop";
  txHash: string | null;
  explorerUrl: string | null;
  errorMessage: string | null;
  forwarded?: boolean;
  batched?: boolean;
}

export interface CircleTransfer {
  id?: string;
  stage?:
    | "pending"
    | "burning"
    | "attesting"
    | "minting"
    | "completed"
    | "failed";
  transferId: string;
  status: "pending" | "processing" | "settled" | "failed";
  rawStatus: string;
  txHash: string | null;
  txHashBurn?: string | null;
  txHashMint?: string | null;
  sourceWalletId?: string | null;
  walletId: string | null;
  walletAddress: string | null;
  sourceAddress: string | null;
  sourceChain?: CircleTransferBlockchain;
  sourceBlockchain: CircleTransferBlockchain;
  destinationChain?: CircleTransferBlockchain;
  destinationAddress: string | null;
  amount: string;
  tokenAddress: string;
  blockchain: CircleTransferBlockchain;
  provider: string | null;
  referenceId: string;
  createdAt: string;
  updatedAt: string;
  errorReason: string | null;
  steps: CircleTransferStep[];
}

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

interface BootstrapCircleTransferWalletParams {
  walletSetId?: string;
  walletSetName?: string;
  walletName?: string;
  refId?: string;
  blockchain?: CircleTransferBlockchain;
  tokenAddress?: string;
}

interface GetCircleTransferWalletParams {
  walletId?: string;
  walletAddress?: string;
  blockchain?: CircleTransferBlockchain;
  tokenAddress?: string;
}

interface CreateCircleTransferParams {
  destinationAddress: string;
  amount: string;
  referenceId?: string;
  tokenAddress?: string;
  walletId?: string;
  walletAddress?: string;
  blockchain?: CircleTransferBlockchain;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
  details?: unknown;
  data?: unknown;
}

export class TransferApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "TransferApiError";
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;

  if (!response.ok) {
    throw new TransferApiError(
      payload.error || `API error ${response.status}`,
      response.status,
      payload.code,
      payload.details
    );
  }

  return (payload.data as T | undefined) ?? (payload as T);
}

export async function getCircleTransferWallet(
  params: GetCircleTransferWalletParams = {}
): Promise<CircleTransferWallet> {
  const searchParams = new URLSearchParams();

  if (params.walletId) {
    searchParams.set("walletId", params.walletId);
  }

  if (params.walletAddress) {
    searchParams.set("walletAddress", params.walletAddress);
  }

  if (params.blockchain) {
    searchParams.set("blockchain", params.blockchain);
  }

  if (params.tokenAddress) {
    searchParams.set("tokenAddress", params.tokenAddress);
  }

  const query = searchParams.toString();
  const url = query ? `/api/transfers/wallet?${query}` : "/api/transfers/wallet";

  return apiFetch<CircleTransferWallet>(url);
}

export async function bootstrapCircleTransferWallet(
  params: BootstrapCircleTransferWalletParams = {}
): Promise<CircleTransferWallet> {
  return apiFetch<CircleTransferWallet>("/api/transfers/wallet/bootstrap", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function createCircleTransfer(
  params: CreateCircleTransferParams
): Promise<CircleTransfer> {
  return apiFetch<CircleTransfer>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getCircleTransferStatus(
  transferId: string
): Promise<CircleTransfer> {
  return apiFetch<CircleTransfer>(
    `/api/transfers/${encodeURIComponent(transferId)}`
  );
}