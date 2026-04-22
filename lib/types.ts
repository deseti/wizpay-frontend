import type { Address, Hex } from "viem";
import type { RecipientDraft, TokenSymbol } from "@/lib/wizpay";

/* ── Step machine for approval / submit flows ── */
export type StepState =
  | "idle"
  | "signing"
  | "confirming"
  | "simulating"
  | "wallet"
  | "confirmed";

/* ── Recipient row enriched with parsed amounts ── */
export interface PreparedRecipient extends RecipientDraft {
  validAddress: boolean;
  amountUnits: bigint;
}

/* ── Fee-aware quote from `getBatchEstimatedOutputs` ── */
export interface QuoteSummary {
  estimatedAmountsOut: bigint[];
  totalEstimatedOut: bigint;
  totalFees: bigint;
}

/* ── On-chain history item from BatchPaymentRouted events ── */
export interface HistoryItem {
  contractAddress: Address;
  tokenIn: Address;
  tokenOut: Address;
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  totalFees: bigint;
  recipientCount: number;
  referenceId: string;
  txHash: Hex;
  blockNumber: bigint;
  timestampMs: number;
}

/* ── Unified history covering all dashboard event types ── */
export type HistoryActionType = "payroll" | "add_lp" | "remove_lp";

export interface UnifiedHistoryItem {
  type: HistoryActionType;
  txHash: Hex;
  blockNumber: bigint;
  timestampMs: number;
  /* Payroll-specific */
  tokenIn?: Address;
  tokenOut?: Address;
  totalAmountIn?: bigint;
  totalAmountOut?: bigint;
  totalFees?: bigint;
  recipientCount?: number;
  referenceId?: string;
  /* LP-specific */
  lpToken?: Address;
  lpAmount?: bigint;
  lpShares?: bigint;
}

export interface TransactionActionResult {
  ok: boolean;
  hash: string | null;
}

/* ── The shape returned by useWizPay() ── */
export interface WizPayState {
  /* token selection */
  selectedToken: TokenSymbol;
  setSelectedToken: (token: TokenSymbol) => void;
  activeToken: { symbol: TokenSymbol; name: string; address: Address; decimals: number };

  /* recipients */
  recipients: RecipientDraft[];
  preparedRecipients: PreparedRecipient[];
  addRecipient: () => void;
  removeRecipient: (id: string) => void;
  updateRecipient: (id: string, field: keyof Omit<RecipientDraft, "id">, value: string) => void;

  /* reference */
  referenceId: string;
  setReferenceId: (value: string) => void;

  /* validation */
  errors: Record<string, string>;
  clearFieldError: (key: string) => void;

  /* amounts */
  batchAmount: bigint;
  validRecipientCount: number;

  /* contract reads */
  currentAllowance: bigint;
  currentBalance: bigint;
  feeBps: bigint;
  fxEngineData: Address | undefined;
  engineBalances: Record<TokenSymbol, bigint>;
  quoteSummary: QuoteSummary;
  allowanceLoading: boolean;
  balanceLoading: boolean;
  feeLoading: boolean;
  engineLoading: boolean;
  quoteLoading: boolean;
  quoteRefreshing: boolean;

  /* diagnostics */
  rowDiagnostics: (string | null)[];
  hasRouteIssue: boolean;
  approvalAmount: bigint;
  needsApproval: boolean;
  insufficientBalance: boolean;

  /* history */
  history: HistoryItem[];
  unifiedHistory: UnifiedHistoryItem[];
  historyLoading: boolean;
  totalRouted: bigint;

  /* tx state */
  approvalState: StepState;
  submitState: StepState;
  approveTxHash: Hex | null;
  submitTxHash: string | null;
  estimatedGas: bigint | null;
  statusMessage: string | null;
  errorMessage: string | null;
  isBusy: boolean;

  /* chunking state */
  pendingBatches: RecipientDraft[][];
  currentBatchNumber: number;
  totalBatches: number;
  sessionTotalAmount: bigint;
  setSessionTotalAmount: (amount: bigint | ((prev: bigint) => bigint)) => void;
  sessionTotalRecipients: number;
  setSessionTotalRecipients: (count: number | ((prev: number) => number)) => void;
  sessionTotalDistributed: Record<TokenSymbol, bigint>;
  setSessionTotalDistributed: (arg: Record<TokenSymbol, bigint> | ((prev: Record<TokenSymbol, bigint>) => Record<TokenSymbol, bigint>)) => void;

  /* actions */
  handleApprove: () => Promise<TransactionActionResult>;
  handleSubmit: () => Promise<TransactionActionResult>;
  resetComposer: () => void;
  loadNextBatch: () => void;
  dismissSuccessModal: () => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  importRecipients: (rows: RecipientDraft[]) => void;

  /* smart batch */
  smartBatchAvailable: boolean;
  smartBatchRunning: boolean;
  smartBatchReason: string | null;
  smartBatchButtonText: string | null;
  smartBatchHelperText: string | null;
  smartBatchSubmissionHashes: string[];
  handleSmartBatchSubmit: () => Promise<void>;

  /* clipboard */
  copiedHash: string | null;
  copyHash: (hash: string | null) => Promise<void>;

  /* derived text */
  primaryActionText: string;
  approvalText: string;
}
