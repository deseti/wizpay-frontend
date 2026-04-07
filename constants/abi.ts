export const WIZPAY_BATCH_PAYMENT_ROUTED_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: "address", name: "sender", type: "address" },
    { indexed: false, internalType: "address", name: "tokenIn", type: "address" },
    { indexed: false, internalType: "address", name: "tokenOut", type: "address" },
    { indexed: false, internalType: "uint256", name: "totalAmountIn", type: "uint256" },
    { indexed: false, internalType: "uint256", name: "totalAmountOut", type: "uint256" },
    { indexed: false, internalType: "uint256", name: "totalFees", type: "uint256" },
    { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
    { indexed: false, internalType: "string", name: "referenceId", type: "string" },
  ],
  name: "BatchPaymentRouted",
  type: "event",
} as const;

export const WIZPAY_ABI = [
  WIZPAY_BATCH_PAYMENT_ROUTED_EVENT,
  {
    inputs: [],
    name: "feeBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "fxEngine",
    outputs: [{ internalType: "contract IFXEngine", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address", name: "tokenOut", type: "address" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
    ],
    name: "getEstimatedOutput",
    outputs: [{ internalType: "uint256", name: "estimatedAmountOut", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address[]", name: "tokenOuts", type: "address[]" },
      { internalType: "uint256[]", name: "amountsIn", type: "uint256[]" },
    ],
    name: "getBatchEstimatedOutputs",
    outputs: [
      { internalType: "uint256[]", name: "estimatedAmountsOut", type: "uint256[]" },
      { internalType: "uint256", name: "totalEstimatedOut", type: "uint256" },
      { internalType: "uint256", name: "totalFees", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address[]", name: "tokenOuts", type: "address[]" },
      { internalType: "address[]", name: "recipients", type: "address[]" },
      { internalType: "uint256[]", name: "amountsIn", type: "uint256[]" },
      { internalType: "uint256[]", name: "minAmountsOut", type: "uint256[]" },
      { internalType: "string", name: "referenceId", type: "string" },
    ],
    name: "batchRouteAndPay",
    outputs: [{ internalType: "uint256", name: "totalOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ── StableFXAdapter LP Events ──
export const LIQUIDITY_ADDED_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: "address", name: "token", type: "address" },
    { indexed: false, internalType: "uint256", name: "amountIn", type: "uint256" },
    { indexed: false, internalType: "uint256", name: "sharesMinted", type: "uint256" },
  ],
  name: "LiquidityAdded",
  type: "event",
} as const;

export const LIQUIDITY_REMOVED_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: "address", name: "token", type: "address" },
    { indexed: false, internalType: "uint256", name: "amountOut", type: "uint256" },
    { indexed: false, internalType: "uint256", name: "sharesBurned", type: "uint256" },
  ],
  name: "LiquidityRemoved",
  type: "event",
} as const;
