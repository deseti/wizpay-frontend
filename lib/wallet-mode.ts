export type WalletMode = "circle" | "external";

export const DEFAULT_WALLET_MODE: WalletMode = "circle";
export const WALLET_MODE_STORAGE_KEY = "wizpay.wallet.mode";

export function parseWalletMode(value: string | null | undefined): WalletMode {
  return value === "external" ? "external" : DEFAULT_WALLET_MODE;
}

export function getWalletModeLabel(mode: WalletMode): string {
  return mode === "circle" ? "App Wallet (Circle)" : "External Wallet";
}

export function getWalletModeDescription(mode: WalletMode): string {
  return mode === "circle"
    ? "Google or email login with Circle MPC custody"
    : "Injected browser wallet such as MetaMask, Rainbow, or Rabby";
}
