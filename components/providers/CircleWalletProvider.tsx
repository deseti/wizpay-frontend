"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { deleteCookie, getCookie, setCookie } from "cookies-next";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import { Fingerprint, LogIn, Mail, ShieldCheck, Wallet } from "lucide-react";
import type { Address, Hex } from "viem";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  clearStoredPasskeyCredential,
  createPasskeyRuntimeSet,
  getCirclePasskeyConfig,
  getPasskeySupportError,
  getPasskeyTokenBalances,
  loginWithPasskey,
  readStoredPasskeyCredential,
  readStoredPasskeyUsername,
  registerWithPasskey,
  sendPasskeyUserOperation,
  signPasskeyTypedData,
  storePasskeyCredential,
  storePasskeyUsername,
  type PasskeyChainRuntime,
  type PasskeyRuntimeSet,
} from "@/lib/circle-passkey";

type LoginMethod = "google" | "email" | "passkey";

type W3SLoginMethod = Extract<LoginMethod, "google" | "email">;

type CircleUserWallet = {
  id: string;
  address: string;
  blockchain: string;
  accountType?: string;
  [key: string]: unknown;
};

type CircleW3SSession = {
  authMethod: W3SLoginMethod;
  email: string | null;
  encryptionKey: string;
  refreshToken?: string;
  userToken: string;
};

type CirclePasskeySession = {
  authMethod: "passkey";
  email: null;
  passkeyUsername: string | null;
};

type CircleSession = CircleW3SSession | CirclePasskeySession;

type CircleChallengeHandle = {
  challengeId: string;
  raw: Record<string, unknown>;
};

type CirclePasskeyChallenge =
  | {
      callData: Hex;
      contractAddress: Address;
      kind: "contract";
      referenceId: string | null;
      walletId: string;
    }
  | {
      kind: "typed-data";
      typedDataJson: string;
      walletId: string;
    };

type CircleWalletTokenBalance = {
  amount: string;
  raw: Record<string, unknown>;
  symbol: string | null;
  tokenAddress: string | null;
  updatedAt: string | null;
};

type CircleDevCredentials = {
  key: string;
  token: string;
  walletId: string;
};

type StoredLoginConfig = {
  email?: string | null;
  loginConfigs: Record<string, unknown>;
  loginMethod: W3SLoginMethod;
};

type GoogleOAuthDiagnostics = {
  audience: string | null;
  clientIdMatches: boolean | null;
  configuredClientId: string | null;
  hasDeviceEncryptionKey: boolean;
  hasDeviceToken: boolean;
  nonceMatches: boolean | null;
  provider: string | null;
  redirectUri: string | null;
  stateMatches: boolean | null;
};

type W3SSdkInstance = {
  execute: (
    challengeId: string,
    callback: (error?: unknown, result?: unknown) => void
  ) => void;
  getDeviceId: () => Promise<string>;
  performLogin: (provider: unknown) => void;
  setAuthentication: (auth: {
    encryptionKey: string;
    userToken: string;
  }) => void;
  updateConfigs: (config: Record<string, unknown>) => void;
  verifyOtp: () => void;
};

type W3SSdkModule = {
  W3SSdk?: new (
    config: Record<string, unknown>,
    onLoginComplete: (error: unknown, result: unknown) => void
  ) => W3SSdkInstance;
};

type W3SLoginCompleteResult = {
  encryptionKey: string;
  refreshToken?: string;
  userToken: string;
};

type CircleWalletContextValue = {
  arcWallet: CircleUserWallet | null;
  authMethod: LoginMethod | null;
  authError: string | null;
  authStatus: string | null;
  authenticated: boolean;
  closeLogin: () => void;
  createContractExecutionChallenge: (
    payload: Record<string, unknown>
  ) => Promise<CircleChallengeHandle>;
  createTypedDataChallenge: (
    payload: Record<string, unknown>
  ) => Promise<CircleChallengeHandle>;
  executeChallenge: (challengeId: string) => Promise<unknown>;
  getDevCredentials: () => CircleDevCredentials | null;
  getWalletBalances: (walletId: string) => Promise<CircleWalletTokenBalance[]>;
  hasPendingEmailOtp: boolean;
  isAuthenticating: boolean;
  login: () => void;
  loginMethodLabel: string;
  logout: () => void;
  primaryWallet: CircleUserWallet | null;
  ready: boolean;
  refreshWallets: () => Promise<void>;
  requestEmailOtp: (email: string) => Promise<void>;
  requestGoogleLogin: () => Promise<void>;
  requestPasskeyLogin: () => Promise<void>;
  requestPasskeyRegistration: (username: string) => Promise<void>;
  sepoliaWallet: CircleUserWallet | null;
  userEmail: string | null;
  verifyEmailOtp: () => void;
  wallets: CircleUserWallet[];
};

const CIRCLE_APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const PASSKEY_CONFIG = getCirclePasskeyConfig();
const APP_ID_COOKIE_KEY = "wizpay.circle.app-id";
const DEVICE_ID_STORAGE_KEY = "wizpay.circle.device-id";
const DEVICE_ENCRYPTION_KEY_COOKIE_KEY = "deviceEncryptionKey";
const DEVICE_TOKEN_COOKIE_KEY = "deviceToken";
const GOOGLE_CLIENT_ID_COOKIE_KEY = "google.clientId";
const LOGIN_CONFIG_STORAGE_KEY = "wizpay.circle.login-config";
const LOGIN_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
};
const OAUTH_NONCE_COOKIE_KEY = "wizpay.circle.oauth.nonce";
const OAUTH_NONCE_FALLBACK_STORAGE_KEY = "wizpay.circle.oauth.backup.nonce";
const OAUTH_PROVIDER_COOKIE_KEY = "wizpay.circle.oauth.provider";
const OAUTH_PROVIDER_FALLBACK_STORAGE_KEY = "wizpay.circle.oauth.backup.provider";
const OAUTH_STATE_COOKIE_KEY = "wizpay.circle.oauth.state";
const OAUTH_STATE_FALLBACK_STORAGE_KEY = "wizpay.circle.oauth.backup.state";
const SESSION_STORAGE_KEY = "wizpay.circle.session";
const SOCIAL_LOGIN_PROVIDER_STORAGE_KEY = "socialLoginProvider";
const SOCIAL_LOGIN_STATE_STORAGE_KEY = "state";
const SOCIAL_LOGIN_NONCE_STORAGE_KEY = "nonce";
const SUPPORTED_WALLET_CHAINS = new Set(["ARC-TESTNET", "ETH-SEPOLIA"]);
const INVALID_DEVICE_ERROR_CODES = new Set([155113, 155137, 155143, 155144, 155145]);
const OAUTH_RECOVERY_ERROR_CODES = new Set([155114, 155140]);

const CircleWalletContext = createContext<CircleWalletContextValue | null>(null);

function getGoogleOAuthErrorMessage(diagnostics: GoogleOAuthDiagnostics | null) {
  if (!diagnostics) {
    return "Circle failed to validate the Google OAuth response. In Circle's Web SDK this can mean the Google Client ID does not match, the OAuth redirect URI is not allowed for http://localhost:3000, or the saved OAuth state/nonce from a previous redirect became stale. Retry after the app clears the old OAuth session.";
  }

  if (diagnostics.provider !== "GOOGLE") {
    return "Circle returned from Google, but the saved OAuth provider marker was missing from browser storage when the callback loaded. This browser likely lost the pre-login OAuth session before Circle could verify it.";
  }

  if (diagnostics.stateMatches === false) {
    return "Circle rejected the Google redirect because the OAuth state returned by Google no longer matches the state saved in this browser. This usually means the pre-login browser state was replaced before the redirect completed.";
  }

  if (diagnostics.nonceMatches === false) {
    return "Circle rejected the Google redirect because the ID token nonce returned by Google does not match the nonce saved before redirect. That means this browser no longer has the same OAuth session that started the login.";
  }

  if (!diagnostics.hasDeviceToken || !diagnostics.hasDeviceEncryptionKey) {
    return "Google redirect returned correctly, but the stored Circle device verification config was missing when the app came back from Google. Retry once so the app can recreate the Circle login config before redirecting again.";
  }

  if (diagnostics.clientIdMatches === false) {
    const audienceLabel = diagnostics.audience ?? "a different Google OAuth client";
    const configuredLabel =
      diagnostics.configuredClientId ?? "the configured NEXT_PUBLIC_GOOGLE_CLIENT_ID";

    return `Google returned an ID token for ${audienceLabel}, but this app is configured for ${configuredLabel}.`;
  }

  return "Google redirect passed the browser-side state, nonce, and client ID checks, but Circle still rejected the token. That usually means the Google client ID is not enabled on the same Circle User-Controlled Wallet app as NEXT_PUBLIC_CIRCLE_APP_ID in Circle Console.";
}

function getErrorMessage(
  error: unknown,
  googleOAuthDiagnostics: GoogleOAuthDiagnostics | null = null
) {
  const directMessage =
    getNestedString(error, ["message"]) ??
    getNestedString(error, ["error", "message"]) ??
    getNestedString(error, ["data", "message"]);
  const directCode =
    (isRecord(error) && typeof error.code === "number" ? error.code : null) ??
    (isRecord(error) && isRecord(error.error) && typeof error.error.code === "number"
      ? error.error.code
      : null) ??
    (isRecord(error) && isRecord(error.data) && typeof error.data.code === "number"
      ? error.data.code
      : null);

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (directCode === 155114) {
    return "Circle app ID does not match this wallet app. Verify NEXT_PUBLIC_CIRCLE_APP_ID comes from the same User-Controlled Wallet app in Circle Console.";
  }

  if (directCode === 155140) {
    return getGoogleOAuthErrorMessage(googleOAuthDiagnostics);
  }

  if (directCode === 155706) {
    return "Circle verification iframe did not respond. Refresh the page, allow third-party cookies for localhost and pw-auth.circle.com, then retry.";
  }

  if (INVALID_DEVICE_ERROR_CODES.has(directCode ?? -1)) {
    return "Circle rejected the cached device session. Refreshing the device registration and retrying should fix it.";
  }

  if (directMessage) {
    return directCode ? `Circle error ${directCode}: ${directMessage}` : directMessage;
  }

  return "Circle wallet request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isW3SLoginCompleteResult(
  value: unknown
): value is W3SLoginCompleteResult {
  return (
    isRecord(value) &&
    typeof value.encryptionKey === "string" &&
    typeof value.userToken === "string" &&
    (typeof value.refreshToken === "string" ||
      typeof value.refreshToken === "undefined")
  );
}

function isPasskeySession(
  value: CircleSession | null | undefined
): value is CirclePasskeySession {
  return value?.authMethod === "passkey";
}

function isHexValue(
  value: unknown,
  expectedBytes?: number
): value is `0x${string}` {
  if (typeof value !== "string") {
    return false;
  }

  const sizePattern = expectedBytes ? `{${expectedBytes * 2}}` : "*";
  return new RegExp(`^0x[a-fA-F0-9]${sizePattern}$`).test(value);
}

function createLocalChallengeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Math.random().toString(36).slice(2)}:${Date.now().toString(36)}`;
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

function decodeJwtPayload(token: string | null) {
  if (typeof window === "undefined" || !token) {
    return null;
  }

  const [, payloadSegment] = token.split(".");

  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );

    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getGoogleAudienceInfo(
  audience: unknown,
  configuredClientId: string | null
) {
  if (typeof audience === "string") {
    return {
      audience,
      matches: configuredClientId ? audience === configuredClientId : null,
    };
  }

  if (Array.isArray(audience)) {
    const stringAudiences = audience.filter(
      (value): value is string => typeof value === "string" && Boolean(value)
    );

    return {
      audience: stringAudiences[0] ?? null,
      matches: configuredClientId ? stringAudiences.includes(configuredClientId) : null,
    };
  }

  return {
    audience: null,
    matches: null,
  };
}

function getGoogleOAuthDiagnostics(
  storedLoginConfig: StoredLoginConfig | null
): GoogleOAuthDiagnostics | null {
  if (typeof window === "undefined" || !window.location.hash.includes("id_token=")) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const tokenPayload = decodeJwtPayload(hashParams.get("id_token"));
  const loginConfigs = isRecord(storedLoginConfig?.loginConfigs)
    ? storedLoginConfig.loginConfigs
    : null;
  const googleConfig = loginConfigs && isRecord(loginConfigs.google) ? loginConfigs.google : null;
  const configuredClientId =
    typeof googleConfig?.clientId === "string" && googleConfig.clientId
      ? googleConfig.clientId
      : GOOGLE_CLIENT_ID || null;
  const { audience, matches } = getGoogleAudienceInfo(
    tokenPayload?.aud,
    configuredClientId
  );
  const oauthBackup = readCircleOAuthBackup();
  const inferredProvider =
    oauthBackup.provider ||
    (window.location.hash.includes("id_token=") && configuredClientId ? SocialLoginProvider.GOOGLE : null);
  const returnedState = hashParams.get("state");
  const storedState =
    readStorageString(window.localStorage, SOCIAL_LOGIN_STATE_STORAGE_KEY) ||
    oauthBackup.state ||
    null;
  const returnedNonce =
    tokenPayload && typeof tokenPayload.nonce === "string" ? tokenPayload.nonce : null;
  const storedNonce =
    readStorageString(window.localStorage, SOCIAL_LOGIN_NONCE_STORAGE_KEY) ||
    oauthBackup.nonce ||
    null;

  return {
    audience,
    clientIdMatches: matches,
    configuredClientId,
    hasDeviceEncryptionKey:
      typeof loginConfigs?.deviceEncryptionKey === "string" &&
      Boolean(loginConfigs.deviceEncryptionKey),
    hasDeviceToken:
      typeof loginConfigs?.deviceToken === "string" && Boolean(loginConfigs.deviceToken),
    nonceMatches:
      storedNonce && returnedNonce
        ? storedNonce === returnedNonce
        : storedNonce || returnedNonce
          ? false
          : null,
    provider:
      readStorageString(window.localStorage, SOCIAL_LOGIN_PROVIDER_STORAGE_KEY) ||
      inferredProvider ||
      null,
    redirectUri:
      typeof googleConfig?.redirectUri === "string" && googleConfig.redirectUri
        ? googleConfig.redirectUri
        : window.location.origin,
    stateMatches:
      storedState && returnedState
        ? storedState === returnedState
        : storedState || returnedState
          ? false
          : null,
  };
}

function extractChallengeId(payload: Record<string, unknown>) {
  return (
    getNestedString(payload, ["challengeId"]) ??
    getNestedString(payload, ["challenge", "id"]) ??
    getNestedString(payload, ["challenge", "challengeId"]) ??
    getNestedString(payload, ["data", "challengeId"]) ??
    getNestedString(payload, ["data", "challenge", "id"])
  );
}

function normalizeCircleWalletTokenBalance(
  payload: unknown
): CircleWalletTokenBalance | null {
  const record = isRecord(payload) ? payload : null;

  if (!record || typeof record.amount !== "string" || !record.amount) {
    return null;
  }

  const token = isRecord(record.token) ? record.token : null;

  return {
    amount: record.amount,
    raw: record,
    symbol:
      typeof token?.symbol === "string" && token.symbol ? token.symbol : null,
    tokenAddress:
      typeof token?.tokenAddress === "string" && token.tokenAddress
        ? token.tokenAddress
        : null,
    updatedAt:
      typeof record.updateDate === "string" && record.updateDate
        ? record.updateDate
        : typeof record.updatedAt === "string" && record.updatedAt
          ? record.updatedAt
          : null,
  };
}

function readStoredJson<T>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeStoredValue(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
}

function readStorageString(storage: Storage | undefined, key: string) {
  try {
    const value = storage?.getItem(key);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function writeStorageValue(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage write failures and continue with other fallbacks.
  }
}

function removeStorageValue(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function readCookieString(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const value = getCookie(key);

  if (typeof value === "string") {
    return value;
  }

  return value ? String(value) : "";
}

function readCircleOAuthBackup() {
  if (typeof window === "undefined") {
    return {
      nonce: "",
      provider: "",
      state: "",
    };
  }

  return {
    nonce:
      readStorageString(window.sessionStorage, OAUTH_NONCE_FALLBACK_STORAGE_KEY) ||
      readStorageString(window.localStorage, OAUTH_NONCE_FALLBACK_STORAGE_KEY) ||
      readCookieString(OAUTH_NONCE_COOKIE_KEY),
    provider:
      readStorageString(window.sessionStorage, OAUTH_PROVIDER_FALLBACK_STORAGE_KEY) ||
      readStorageString(window.localStorage, OAUTH_PROVIDER_FALLBACK_STORAGE_KEY) ||
      readCookieString(OAUTH_PROVIDER_COOKIE_KEY),
    state:
      readStorageString(window.sessionStorage, OAUTH_STATE_FALLBACK_STORAGE_KEY) ||
      readStorageString(window.localStorage, OAUTH_STATE_FALLBACK_STORAGE_KEY) ||
      readCookieString(OAUTH_STATE_COOKIE_KEY),
  };
}

function getRestoredCircleAppId() {
  return readCookieString(APP_ID_COOKIE_KEY) || CIRCLE_APP_ID;
}

function buildGoogleLoginConfigs({
  deviceEncryptionKey,
  deviceToken,
  googleClientId,
}: {
  deviceEncryptionKey: string;
  deviceToken: string;
  googleClientId: string;
}) {
  return {
    deviceToken,
    deviceEncryptionKey,
    google: {
      clientId: googleClientId,
      redirectUri: typeof window !== "undefined" ? window.location.origin : "",
      selectAccountPrompt: true,
    },
  };
}

function createOAuthRedirectValue() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function buildGoogleOAuthRedirectUrl({
  clientId,
  nonce,
  redirectUri,
  selectAccountPrompt,
  state,
}: {
  clientId: string;
  nonce: string;
  redirectUri: string;
  selectAccountPrompt: boolean;
  state: string;
}) {
  const scope = encodeURIComponent(
    "openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email"
  );
  const responseType = encodeURIComponent("id_token token");

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scope}&state=${state}&response_type=${responseType}&nonce=${nonce}&prompt=${
    selectAccountPrompt ? "select_account" : "none"
  }`;
}

function readGoogleLoginConfigFromCookies(): StoredLoginConfig | null {
  const googleClientId = readCookieString(GOOGLE_CLIENT_ID_COOKIE_KEY) || GOOGLE_CLIENT_ID;
  const deviceToken = readCookieString(DEVICE_TOKEN_COOKIE_KEY);
  const deviceEncryptionKey = readCookieString(DEVICE_ENCRYPTION_KEY_COOKIE_KEY);

  if (!googleClientId || !deviceToken || !deviceEncryptionKey) {
    return null;
  }

  return {
    loginMethod: "google",
    loginConfigs: buildGoogleLoginConfigs({
      deviceEncryptionKey,
      deviceToken,
      googleClientId,
    }),
  };
}

function persistGoogleLoginCookies({
  appId,
  deviceEncryptionKey,
  deviceToken,
  googleClientId,
}: {
  appId: string;
  deviceEncryptionKey: string;
  deviceToken: string;
  googleClientId: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  setCookie(APP_ID_COOKIE_KEY, appId, LOGIN_COOKIE_OPTIONS);
  setCookie(GOOGLE_CLIENT_ID_COOKIE_KEY, googleClientId, LOGIN_COOKIE_OPTIONS);
  setCookie(DEVICE_TOKEN_COOKIE_KEY, deviceToken, LOGIN_COOKIE_OPTIONS);
  setCookie(
    DEVICE_ENCRYPTION_KEY_COOKIE_KEY,
    deviceEncryptionKey,
    LOGIN_COOKIE_OPTIONS
  );
}

function persistCircleOAuthCookies({
  nonce,
  provider,
  state,
}: {
  nonce?: string;
  provider: string;
  state: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  setCookie(OAUTH_PROVIDER_COOKIE_KEY, provider, LOGIN_COOKIE_OPTIONS);
  setCookie(OAUTH_STATE_COOKIE_KEY, state, LOGIN_COOKIE_OPTIONS);
  setCookie(OAUTH_NONCE_COOKIE_KEY, nonce ?? "", LOGIN_COOKIE_OPTIONS);
}

function persistCircleOAuthBackups({
  nonce,
  provider,
  state,
}: {
  nonce?: string;
  provider: string;
  state: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  writeStorageValue(
    window.sessionStorage,
    OAUTH_PROVIDER_FALLBACK_STORAGE_KEY,
    provider
  );
  writeStorageValue(
    window.sessionStorage,
    OAUTH_STATE_FALLBACK_STORAGE_KEY,
    state
  );
  writeStorageValue(
    window.sessionStorage,
    OAUTH_NONCE_FALLBACK_STORAGE_KEY,
    nonce ?? ""
  );
  writeStorageValue(
    window.localStorage,
    OAUTH_PROVIDER_FALLBACK_STORAGE_KEY,
    provider
  );
  writeStorageValue(
    window.localStorage,
    OAUTH_STATE_FALLBACK_STORAGE_KEY,
    state
  );
  writeStorageValue(
    window.localStorage,
    OAUTH_NONCE_FALLBACK_STORAGE_KEY,
    nonce ?? ""
  );
  persistCircleOAuthCookies({ nonce, provider, state });
}

function clearCircleOAuthCookies() {
  if (typeof window === "undefined") {
    return;
  }

  deleteCookie(OAUTH_PROVIDER_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
  deleteCookie(OAUTH_STATE_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
  deleteCookie(OAUTH_NONCE_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
}

function clearCircleOAuthBackups() {
  if (typeof window === "undefined") {
    return;
  }

  removeStorageValue(
    window.sessionStorage,
    OAUTH_PROVIDER_FALLBACK_STORAGE_KEY
  );
  removeStorageValue(window.sessionStorage, OAUTH_STATE_FALLBACK_STORAGE_KEY);
  removeStorageValue(window.sessionStorage, OAUTH_NONCE_FALLBACK_STORAGE_KEY);
  removeStorageValue(
    window.localStorage,
    OAUTH_PROVIDER_FALLBACK_STORAGE_KEY
  );
  removeStorageValue(window.localStorage, OAUTH_STATE_FALLBACK_STORAGE_KEY);
  removeStorageValue(window.localStorage, OAUTH_NONCE_FALLBACK_STORAGE_KEY);
  clearCircleOAuthCookies();
}

function persistCircleOAuthState({
  nonce,
  provider,
  state,
}: {
  nonce?: string;
  provider: string;
  state: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SOCIAL_LOGIN_PROVIDER_STORAGE_KEY, provider);
  window.localStorage.setItem(SOCIAL_LOGIN_STATE_STORAGE_KEY, state);
  window.localStorage.setItem(SOCIAL_LOGIN_NONCE_STORAGE_KEY, nonce ?? "");
  persistCircleOAuthBackups({ nonce, provider, state });
}

function restoreCircleOAuthStateFromCookies() {
  if (typeof window === "undefined") {
    return false;
  }

  const hasOAuthCallbackHash =
    window.location.hash.includes("state=") ||
    window.location.hash.includes("id_token=") ||
    window.location.hash.includes("access_token=");

  if (!hasOAuthCallbackHash) {
    return false;
  }

  const { nonce, provider, state } = readCircleOAuthBackup();
  const inferredProvider =
    provider ||
    (window.location.hash.includes("id_token=") && readGoogleLoginConfigFromCookies()
      ? SocialLoginProvider.GOOGLE
      : "");

  if (!inferredProvider || !state) {
    return false;
  }

  window.localStorage.setItem(SOCIAL_LOGIN_PROVIDER_STORAGE_KEY, inferredProvider);
  window.localStorage.setItem(SOCIAL_LOGIN_STATE_STORAGE_KEY, state);

  if (window.location.hash.includes("id_token=") && nonce) {
    window.localStorage.setItem(SOCIAL_LOGIN_NONCE_STORAGE_KEY, nonce);
  }

  persistCircleOAuthBackups({ nonce, provider: inferredProvider, state });

  return true;
}

function clearGoogleLoginCookies() {
  if (typeof window === "undefined") {
    return;
  }

  deleteCookie(APP_ID_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
  deleteCookie(GOOGLE_CLIENT_ID_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
  deleteCookie(DEVICE_TOKEN_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
  deleteCookie(DEVICE_ENCRYPTION_KEY_COOKIE_KEY, LOGIN_COOKIE_OPTIONS);
}

function clearCircleOAuthState() {
  removeStoredValue(SOCIAL_LOGIN_PROVIDER_STORAGE_KEY);
  removeStoredValue(SOCIAL_LOGIN_STATE_STORAGE_KEY);
  removeStoredValue(SOCIAL_LOGIN_NONCE_STORAGE_KEY);
  clearCircleOAuthBackups();
}

export function CircleWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sdkRef = useRef<W3SSdkInstance | null>(null);
  const loginConfigRef = useRef<StoredLoginConfig | null>(null);
  const googleOAuthDiagnosticsRef = useRef<GoogleOAuthDiagnostics | null>(null);
  const authRequestInFlightRef = useRef(false);
  const passkeyChallengeStoreRef = useRef(
    new Map<string, CirclePasskeyChallenge>()
  );
  const passkeyRuntimeByWalletIdRef = useRef(
    new Map<string, PasskeyChainRuntime>()
  );

  const [arcWallet, setArcWallet] = useState<CircleUserWallet | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [hasPendingEmailOtp, setHasPendingEmailOtp] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [passkeyUnavailableReason, setPasskeyUnavailableReason] = useState<
    string | null
  >(null);
  const [ready, setReady] = useState(false);
  const [sepoliaWallet, setSepoliaWallet] = useState<CircleUserWallet | null>(null);
  const [session, setSession] = useState<CircleSession | null>(null);
  const [wallets, setWallets] = useState<CircleUserWallet[]>([]);

  const resetDeviceId = useCallback(() => {
    setDeviceId("");
    removeStoredValue(DEVICE_ID_STORAGE_KEY);
  }, []);

  const handleAuthFailure = useCallback(
    (error: unknown) => {
      const code =
        (isRecord(error) && typeof error.code === "number" ? error.code : null) ??
        (isRecord(error) && isRecord(error.error) && typeof error.error.code === "number"
          ? error.error.code
          : null) ??
        null;

      authRequestInFlightRef.current = false;

      if (INVALID_DEVICE_ERROR_CODES.has(code ?? -1)) {
        resetDeviceId();
        clearGoogleLoginCookies();
      }

      if (OAUTH_RECOVERY_ERROR_CODES.has(code ?? -1)) {
        clearCircleOAuthState();
      }

      setAuthError(getErrorMessage(error, googleOAuthDiagnosticsRef.current));
      setAuthStatus(null);
    },
    [resetDeviceId]
  );

  const ensureDeviceId = useCallback(async () => {
    if (deviceId) {
      return deviceId;
    }

    const cachedDeviceId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
        : null;

    if (cachedDeviceId) {
      setDeviceId(cachedDeviceId);
      return cachedDeviceId;
    }

    const sdk = sdkRef.current;

    if (!sdk) {
      throw new Error("Circle Web SDK is not ready yet.");
    }

    const nextDeviceId = await sdk.getDeviceId();

    if (!nextDeviceId) {
      throw new Error("Circle device ID is unavailable.");
    }

    setDeviceId(nextDeviceId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
    }

    return nextDeviceId;
  }, [deviceId]);

  const persistSession = useCallback((nextSession: CircleSession | null) => {
    if (nextSession) {
      writeStoredJson(SESSION_STORAGE_KEY, nextSession);
      return;
    }

    removeStoredValue(SESSION_STORAGE_KEY);
  }, []);

  const clearStoredLoginConfig = useCallback(
    (options?: { preserveGoogleCookies?: boolean }) => {
      loginConfigRef.current = null;
      setHasPendingEmailOtp(false);
      removeStoredValue(LOGIN_CONFIG_STORAGE_KEY);

      if (!options?.preserveGoogleCookies) {
        clearGoogleLoginCookies();
      }
    },
    []
  );

  const storeLoginConfig = useCallback((value: StoredLoginConfig) => {
    loginConfigRef.current = value;
    writeStoredJson(LOGIN_CONFIG_STORAGE_KEY, value);
    setHasPendingEmailOtp(value.loginMethod === "email");
  }, []);

  const applyPasskeyRuntimeSet = useCallback((runtimeSet: PasskeyRuntimeSet | null) => {
    passkeyRuntimeByWalletIdRef.current = runtimeSet?.byWalletId ?? new Map();

    const nextWallets = (runtimeSet?.wallets ?? []) as CircleUserWallet[];

    setWallets(nextWallets);
    setArcWallet((runtimeSet?.arc?.wallet as CircleUserWallet | null) ?? null);
    setSepoliaWallet(
      (runtimeSet?.sepolia?.wallet as CircleUserWallet | null) ?? null
    );
  }, []);

  const resetPasskeyRuntimeState = useCallback(() => {
    passkeyChallengeStoreRef.current.clear();
    passkeyRuntimeByWalletIdRef.current.clear();
  }, []);

  const clearPasskeyState = useCallback(() => {
    resetPasskeyRuntimeState();
    clearStoredPasskeyCredential();
    storePasskeyUsername(null);
  }, [resetPasskeyRuntimeState]);

  const initializePasskeyWallets = useCallback(
    async ({
      credential,
      username,
    }: {
      credential?: ReturnType<typeof readStoredPasskeyCredential>;
      username: string | null;
    }) => {
      const nextCredential = credential ?? readStoredPasskeyCredential();

      if (!nextCredential) {
        throw new Error(
          "No stored passkey credential was found. Sign in with Passkey again."
        );
      }

      const runtimeSet = await createPasskeyRuntimeSet({
        config: PASSKEY_CONFIG,
        credential: nextCredential,
        username,
      });

      applyPasskeyRuntimeSet(runtimeSet);

      return runtimeSet;
    },
    [applyPasskeyRuntimeSet]
  );

  const finalizePasskeyAuthentication = useCallback(
    async ({
      credential,
      username,
    }: {
      credential: NonNullable<ReturnType<typeof readStoredPasskeyCredential>>;
      username: string | null;
    }) => {
      const nextUsername = username ?? readStoredPasskeyUsername();

      await initializePasskeyWallets({
        credential,
        username: nextUsername,
      });

      storePasskeyCredential(credential);
      storePasskeyUsername(nextUsername);

      const nextSession: CirclePasskeySession = {
        authMethod: "passkey",
        email: null,
        passkeyUsername: nextUsername,
      };

      setSession(nextSession);
      persistSession(nextSession);
      clearCircleOAuthState();
      clearStoredLoginConfig({ preserveGoogleCookies: true });
      setAuthStatus("Circle passkey wallet ready.");
      setIsLoginOpen(false);
    },
    [clearStoredLoginConfig, initializePasskeyWallets, persistSession]
  );

  const executePasskeyChallenge = useCallback(async (challengeId: string) => {
    const pendingChallenge = passkeyChallengeStoreRef.current.get(challengeId);

    if (!pendingChallenge) {
      throw new Error("Passkey request expired. Retry the action.");
    }

    const runtime = passkeyRuntimeByWalletIdRef.current.get(
      pendingChallenge.walletId
    );

    if (!runtime) {
      throw new Error("Passkey wallet session is not ready.");
    }

    try {
      if (pendingChallenge.kind === "contract") {
        const result = await sendPasskeyUserOperation({
          callData: pendingChallenge.callData,
          contractAddress: pendingChallenge.contractAddress,
          runtime,
        });
        const referenceId = pendingChallenge.referenceId ?? result.userOpHash;

        return {
          data: {
            id: referenceId,
            transactionHash: result.txHash,
            transactionId: referenceId,
            txHash: result.txHash,
            userOpHash: result.userOpHash,
          },
          id: referenceId,
          transactionHash: result.txHash,
          transactionId: referenceId,
          txHash: result.txHash,
          userOpHash: result.userOpHash,
        };
      }

      const signature = await signPasskeyTypedData({
        runtime,
        typedDataJson: pendingChallenge.typedDataJson,
      });

      return {
        data: { signature },
        signature,
      };
    } finally {
      passkeyChallengeStoreRef.current.delete(challengeId);
    }
  }, []);

  const handleAuthFailureRef = useRef<((error: unknown) => void) | null>(null);
  const initializeAndLoadWalletsRef = useRef<
    ((authSession: CircleW3SSession) => Promise<void>) | null
  >(null);
  const persistSessionRef = useRef<((nextSession: CircleSession | null) => void) | null>(
    null
  );

  const postW3sAction = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const response = await fetch("/api/w3s", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...params }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        code?: number;
        error?: string;
        message?: string;
        retryAfterMs?: number | null;
        status?: number;
        [key: string]: unknown;
      };

      if (!response.ok) {
        const retryAfterSeconds =
          typeof payload.retryAfterMs === "number"
            ? Math.max(1, Math.ceil(payload.retryAfterMs / 1000))
            : null;
        const fallbackMessage =
          response.status === 429
            ? `Circle rate limit reached while running ${action}.${retryAfterSeconds ? ` Retry in about ${retryAfterSeconds}s.` : " Retry in a few seconds."}`
            : `Circle action failed: ${action}`;
        const nextError = new Error(
          payload.error || payload.message || fallbackMessage
        ) as Error & { code?: number; retryAfterMs?: number | null; status?: number };
        nextError.code = payload.code;
        nextError.retryAfterMs = payload.retryAfterMs;
        nextError.status = response.status;
        throw nextError;
      }

      return payload;
    },
    []
  );

  const loadWallets = useCallback(
    async (authSessionOverride?: CircleSession | null) => {
      const activeSession = authSessionOverride ?? session;

      if (isPasskeySession(activeSession)) {
        const storedCredential = readStoredPasskeyCredential();

        if (!storedCredential) {
          throw new Error(
            "Your saved passkey session is incomplete. Sign in with Passkey again."
          );
        }

        await initializePasskeyWallets({
          credential: storedCredential,
          username: activeSession.passkeyUsername,
        });

        return;
      }

      const userToken = activeSession?.userToken;

      if (!userToken) {
        setWallets([]);
        setArcWallet(null);
        setSepoliaWallet(null);
        resetPasskeyRuntimeState();
        return;
      }

      const payload = (await postW3sAction("listWallets", {
        userToken,
      })) as {
        wallets?: CircleUserWallet[];
      };

      const nextWallets = (payload.wallets ?? []).filter((wallet) =>
        SUPPORTED_WALLET_CHAINS.has(wallet.blockchain)
      );

      setWallets(nextWallets);
      setArcWallet(
        nextWallets.find((wallet) => wallet.blockchain === "ARC-TESTNET") ?? null
      );
      setSepoliaWallet(
        nextWallets.find((wallet) => wallet.blockchain === "ETH-SEPOLIA") ?? null
      );
    },
    [initializePasskeyWallets, postW3sAction, resetPasskeyRuntimeState, session]
  );

  const executeChallengeForSession = useCallback(
    async (challengeId: string, authSession: CircleSession) => {
      if (isPasskeySession(authSession)) {
        return executePasskeyChallenge(challengeId);
      }

      const sdk = sdkRef.current;

      if (!sdk) {
        throw new Error("Circle Web SDK is not ready yet.");
      }

      sdk.setAuthentication({
        userToken: authSession.userToken,
        encryptionKey: authSession.encryptionKey,
      });

      return new Promise<unknown>((resolve, reject) => {
        sdk.execute(challengeId, (error, result) => {
          if (error) {
            reject(new Error(getErrorMessage(error)));
            return;
          }

          resolve(result);
        });
      });
    },
    [executePasskeyChallenge]
  );

  const initializeAndLoadWallets = useCallback(
    async (authSession: CircleW3SSession) => {
      setIsAuthenticating(true);
      setAuthError(null);
      setAuthStatus("Initializing your Circle wallet...");

      try {
        const payload = (await postW3sAction("initializeUser", {
          userToken: authSession.userToken,
        })) as {
          challengeId?: string;
        };

        if (payload.challengeId) {
          setAuthStatus("Circle wallet challenge ready. Confirm it to finish setup.");
          await executeChallengeForSession(payload.challengeId, authSession);
          await new Promise((resolve) => {
            window.setTimeout(resolve, 1500);
          });
        }

        setAuthStatus("Loading Circle wallets...");
        await loadWallets(authSession);
        setAuthStatus("Circle wallet ready.");
        setIsLoginOpen(false);
        clearCircleOAuthBackups();
        clearStoredLoginConfig({ preserveGoogleCookies: true });
      } catch (error) {
        const code = (error as Error & { code?: number }).code;

        if (code === 155106) {
          setAuthStatus("Existing Circle wallet found. Loading wallets...");
          await loadWallets(authSession);
          setAuthStatus("Circle wallet restored.");
          setIsLoginOpen(false);
          clearCircleOAuthBackups();
          clearStoredLoginConfig({ preserveGoogleCookies: true });
          setIsAuthenticating(false);
          return;
        }

        setAuthError(getErrorMessage(error));
      } finally {
        authRequestInFlightRef.current = false;
        setIsAuthenticating(false);
      }
    },
    [clearStoredLoginConfig, executeChallengeForSession, loadWallets, postW3sAction]
  );

  const executeChallenge = useCallback(
    async (challengeId: string) => {
      if (!session) {
        throw new Error("Circle session is not available.");
      }

      return executeChallengeForSession(challengeId, session);
    },
    [executeChallengeForSession, session]
  );

  const createContractExecutionChallenge = useCallback(
    async (payload: Record<string, unknown>) => {
      if (isPasskeySession(session)) {
        const walletId =
          typeof payload.walletId === "string" && payload.walletId
            ? payload.walletId
            : null;
        const contractAddress = isHexValue(payload.contractAddress, 20)
          ? (payload.contractAddress as Address)
          : null;
        const callData = isHexValue(payload.callData)
          ? (payload.callData as Hex)
          : null;

        if (!walletId || !contractAddress || !callData) {
          throw new Error(
            "Passkey execution payload is missing the target wallet, contract, or calldata."
          );
        }

        const challengeId = createLocalChallengeId("passkey-contract");

        passkeyChallengeStoreRef.current.set(challengeId, {
          callData,
          contractAddress,
          kind: "contract",
          referenceId:
            typeof payload.refId === "string" && payload.refId ? payload.refId : null,
          walletId,
        });

        return {
          challengeId,
          raw: {
            challengeId,
            transactionId:
              typeof payload.refId === "string" && payload.refId ? payload.refId : null,
            walletId,
          },
        };
      }

      if (!session || isPasskeySession(session) || !session.userToken) {
        throw new Error("Circle session is not available.");
      }

      const response = await postW3sAction("createContractExecutionChallenge", {
        userToken: session.userToken,
        payload,
      });

      if (!isRecord(response)) {
        throw new Error("Circle did not return a valid challenge response.");
      }

      const challengeId = extractChallengeId(response);

      if (!challengeId) {
        throw new Error("Circle did not return a challenge identifier.");
      }

      return {
        challengeId,
        raw: response,
      };
    },
    [postW3sAction, session]
  );

  const createTypedDataChallenge = useCallback(
    async (payload: Record<string, unknown>) => {
      if (isPasskeySession(session)) {
        const walletId =
          typeof payload.walletId === "string" && payload.walletId
            ? payload.walletId
            : null;
        const typedDataJson =
          typeof payload.data === "string" && payload.data ? payload.data : null;

        if (!walletId || !typedDataJson) {
          throw new Error(
            "Passkey typed-data payload is missing the target wallet or payload."
          );
        }

        const challengeId = createLocalChallengeId("passkey-typed-data");

        passkeyChallengeStoreRef.current.set(challengeId, {
          kind: "typed-data",
          typedDataJson,
          walletId,
        });

        return {
          challengeId,
          raw: {
            challengeId,
            walletId,
          },
        };
      }

      if (!session || isPasskeySession(session) || !session.userToken) {
        throw new Error("Circle session is not available.");
      }

      const response = await postW3sAction("createTypedDataChallenge", {
        userToken: session.userToken,
        payload,
      });

      if (!isRecord(response)) {
        throw new Error("Circle did not return a valid sign challenge response.");
      }

      const challengeId = extractChallengeId(response);

      if (!challengeId) {
        throw new Error("Circle did not return a sign challenge identifier.");
      }

      return {
        challengeId,
        raw: response,
      };
    },
    [postW3sAction, session]
  );

  const getWalletBalances = useCallback(
    async (walletId: string) => {
      if (isPasskeySession(session)) {
        const runtime = passkeyRuntimeByWalletIdRef.current.get(walletId);

        if (!runtime) {
          throw new Error("Passkey wallet session is not ready.");
        }

        return getPasskeyTokenBalances(runtime);
      }

      if (!session || isPasskeySession(session) || !session.userToken) {
        throw new Error("Circle session is not available.");
      }

      const response = await postW3sAction("getWalletBalances", {
        userToken: session.userToken,
        walletId,
      });

      if (!isRecord(response) || !Array.isArray(response.tokenBalances)) {
        return [];
      }

      return response.tokenBalances
        .map((balance) => normalizeCircleWalletTokenBalance(balance))
        .filter((balance): balance is CircleWalletTokenBalance => balance !== null);
    },
    [postW3sAction, session]
  );

  useEffect(() => {
    const storedSession = readStoredJson<CircleSession>(SESSION_STORAGE_KEY);
    const storedLoginConfig = readStoredJson<StoredLoginConfig>(
      LOGIN_CONFIG_STORAGE_KEY
    );

    if (storedSession) {
      setSession(storedSession);
    }

    if (storedLoginConfig) {
      loginConfigRef.current = storedLoginConfig;
      setHasPendingEmailOtp(storedLoginConfig.loginMethod === "email");
    }
  }, []);

  useEffect(() => {
    setPasskeyUnavailableReason(getPasskeySupportError(PASSKEY_CONFIG));
  }, []);

  useEffect(() => {
    handleAuthFailureRef.current = handleAuthFailure;
  }, [handleAuthFailure]);

  useEffect(() => {
    initializeAndLoadWalletsRef.current = initializeAndLoadWallets;
  }, [initializeAndLoadWallets]);

  useEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  useEffect(() => {
    let cancelled = false;

    async function initializeSdk() {
      try {
        const sdkModule = (await import(
          "@circle-fin/w3s-pw-web-sdk"
        )) as unknown as W3SSdkModule;

        if (!sdkModule.W3SSdk) {
          throw new Error("Circle Web SDK did not expose W3SSdk.");
        }

        restoreCircleOAuthStateFromCookies();

        const restoredLoginConfig =
          loginConfigRef.current ??
          readStoredJson<StoredLoginConfig>(LOGIN_CONFIG_STORAGE_KEY) ??
          readGoogleLoginConfigFromCookies();

        if (restoredLoginConfig) {
          loginConfigRef.current = restoredLoginConfig;

          if (!cancelled) {
            setHasPendingEmailOtp(restoredLoginConfig.loginMethod === "email");
          }
        }

        googleOAuthDiagnosticsRef.current = getGoogleOAuthDiagnostics(restoredLoginConfig);

        const initialConfig: Record<string, unknown> = {
          appSettings: { appId: getRestoredCircleAppId() },
        };

        if (restoredLoginConfig?.loginConfigs) {
          initialConfig.loginConfigs = restoredLoginConfig.loginConfigs;
        }

        const sdk = new sdkModule.W3SSdk(initialConfig, (error, result) => {
          if (cancelled) {
            return;
          }

          if (error || !isW3SLoginCompleteResult(result)) {
            setIsAuthenticating(false);
            handleAuthFailureRef.current?.(
              error ?? new Error("Circle login did not return a valid auth payload.")
            );
            return;
          }

          googleOAuthDiagnosticsRef.current = null;

          const storedLoginConfigForCallback = loginConfigRef.current;
          const nextSession: CircleSession = {
            authMethod: storedLoginConfigForCallback?.loginMethod ?? "google",
            email: storedLoginConfigForCallback?.email ?? null,
            encryptionKey: result.encryptionKey,
            refreshToken: result.refreshToken,
            userToken: result.userToken,
          };

          setSession(nextSession);
          persistSessionRef.current?.(nextSession);

          if (initializeAndLoadWalletsRef.current) {
            void initializeAndLoadWalletsRef.current(nextSession);
          }
        });

        sdkRef.current = sdk;

        if (!cancelled) {
          setReady(true);
          setAuthStatus(null);
        }
      } catch (error) {
        if (!cancelled) {
          setReady(true);
          handleAuthFailureRef.current?.(error);
        }
      }
    }

    void initializeSdk();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || deviceId) {
      return;
    }

    let cancelled = false;

    async function fetchDeviceId() {
      try {
        await ensureDeviceId();

        if (!cancelled) {
          setAuthError((current) =>
            current === "Circle device ID is still loading. Try again in a moment."
              ? null
              : current
          );
        }
      } catch (error) {
        if (!cancelled) {
          handleAuthFailure(error);
        }
      }
    }

    void fetchDeviceId();

    return () => {
      cancelled = true;
    };
  }, [deviceId, ensureDeviceId, ready]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    async function hydrateWallets() {
      try {
        await loadWallets(session);
      } catch (error) {
        if (!cancelled) {
          handleAuthFailure(error);
          clearPasskeyState();
          setSession(null);
          persistSession(null);
          setWallets([]);
          setArcWallet(null);
          setSepoliaWallet(null);
        }
      }
    }

    if (wallets.length === 0) {
      void hydrateWallets();
    }

    return () => {
      cancelled = true;
    };
  }, [clearPasskeyState, loadWallets, persistSession, session, wallets.length]);

  const requestPasskeyRegistration = useCallback(
    async (username: string) => {
      const normalizedUsername = username.trim();
      const supportError = getPasskeySupportError(PASSKEY_CONFIG);

      if (supportError) {
        setAuthError(supportError);
        return;
      }

      if (!normalizedUsername) {
        setAuthError("Enter a username before creating a passkey.");
        return;
      }

      if (authRequestInFlightRef.current) {
        return;
      }

      authRequestInFlightRef.current = true;
      setAuthError(null);
      setAuthStatus("Creating your Circle passkey...");
      setIsAuthenticating(true);

      try {
        resetPasskeyRuntimeState();

        const result = await registerWithPasskey(
          normalizedUsername,
          PASSKEY_CONFIG
        );

        setAuthStatus("Preparing your Circle passkey wallet...");
        await finalizePasskeyAuthentication({
          credential: result.credential,
          username: normalizedUsername,
        });
      } catch (error) {
        resetPasskeyRuntimeState();
        handleAuthFailure(error);
      } finally {
        authRequestInFlightRef.current = false;
        setIsAuthenticating(false);
      }
    },
    [finalizePasskeyAuthentication, handleAuthFailure, resetPasskeyRuntimeState]
  );

  const requestPasskeyLogin = useCallback(async () => {
    const supportError = getPasskeySupportError(PASSKEY_CONFIG);

    if (supportError) {
      setAuthError(supportError);
      return;
    }

    if (authRequestInFlightRef.current) {
      return;
    }

    authRequestInFlightRef.current = true;
    setAuthError(null);
    setAuthStatus("Opening your passkey prompt...");
    setIsAuthenticating(true);

    try {
      resetPasskeyRuntimeState();

      const credential = await loginWithPasskey(PASSKEY_CONFIG);

      setAuthStatus("Restoring your Circle passkey wallet...");
      await finalizePasskeyAuthentication({
        credential,
        username: readStoredPasskeyUsername(),
      });
    } catch (error) {
      resetPasskeyRuntimeState();
      handleAuthFailure(error);
    } finally {
      authRequestInFlightRef.current = false;
      setIsAuthenticating(false);
    }
  }, [finalizePasskeyAuthentication, handleAuthFailure, resetPasskeyRuntimeState]);

  const requestGoogleLogin = useCallback(async () => {
    if (!CIRCLE_APP_ID) {
      setAuthError(
        "NEXT_PUBLIC_CIRCLE_APP_ID is missing. Configure Circle Wallets before signing in."
      );
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      setAuthError(
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing. Add your Circle-linked Google client ID first."
      );
      return;
    }

    const sdk = sdkRef.current;

    if (!sdk) {
      setAuthError("Circle Web SDK is not ready yet.");
      return;
    }

    if (authRequestInFlightRef.current) {
      return;
    }

    authRequestInFlightRef.current = true;

    setAuthError(null);
    setAuthStatus("Preparing Google sign-in...");
    setIsAuthenticating(true);

    try {
      googleOAuthDiagnosticsRef.current = null;
      clearCircleOAuthState();
      clearStoredLoginConfig({ preserveGoogleCookies: true });

      const cachedGoogleLoginConfig = readGoogleLoginConfigFromCookies();
      let loginConfigs: Record<string, unknown>;

      if (cachedGoogleLoginConfig) {
        loginConfigs = cachedGoogleLoginConfig.loginConfigs;
        setAuthStatus("Reusing Circle device registration...");
      } else {
        const resolvedDeviceId = await ensureDeviceId();
        const payload = (await postW3sAction("createDeviceToken", {
          deviceId: resolvedDeviceId,
        })) as {
          deviceEncryptionKey: string;
          deviceToken: string;
        };

        loginConfigs = buildGoogleLoginConfigs({
          deviceEncryptionKey: payload.deviceEncryptionKey,
          deviceToken: payload.deviceToken,
          googleClientId: GOOGLE_CLIENT_ID,
        });

        persistGoogleLoginCookies({
          appId: CIRCLE_APP_ID,
          deviceEncryptionKey: payload.deviceEncryptionKey,
          deviceToken: payload.deviceToken,
          googleClientId: GOOGLE_CLIENT_ID,
        });
      }

      storeLoginConfig({
        loginMethod: "google",
        loginConfigs,
      });

      const googleConfig =
        isRecord(loginConfigs.google) && typeof loginConfigs.google.clientId === "string"
          ? loginConfigs.google
          : null;
      const redirectUri =
        typeof googleConfig?.redirectUri === "string" && googleConfig.redirectUri
          ? googleConfig.redirectUri
          : window.location.origin;
      const googleClientId =
        typeof googleConfig?.clientId === "string" && googleConfig.clientId
          ? googleConfig.clientId
          : GOOGLE_CLIENT_ID;
      const oauthState = createOAuthRedirectValue();
      const oauthNonce = createOAuthRedirectValue();

      persistCircleOAuthState({
        nonce: oauthNonce,
        provider: SocialLoginProvider.GOOGLE,
        state: oauthState,
      });

      sdk.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID },
        loginConfigs,
      });

      setAuthStatus("Redirecting to Google...");
      window.location.assign(
        buildGoogleOAuthRedirectUrl({
          clientId: googleClientId,
          nonce: oauthNonce,
          redirectUri,
          selectAccountPrompt: googleConfig?.selectAccountPrompt === true,
          state: oauthState,
        })
      );
    } catch (error) {
      setIsAuthenticating(false);
      handleAuthFailure(error);
    }
  }, [ensureDeviceId, handleAuthFailure, postW3sAction, storeLoginConfig]);

  const requestEmailOtp = useCallback(
    async (email: string) => {
      if (!CIRCLE_APP_ID) {
        setAuthError(
          "NEXT_PUBLIC_CIRCLE_APP_ID is missing. Configure Circle Wallets before signing in."
        );
        return;
      }

      const normalizedEmail = email.trim();

      if (!normalizedEmail) {
        setAuthError("Enter your email address first.");
        return;
      }

      const sdk = sdkRef.current;

      if (!sdk) {
        setAuthError("Circle Web SDK is not ready yet.");
        return;
      }

      if (authRequestInFlightRef.current) {
        return;
      }

      authRequestInFlightRef.current = true;

      setAuthError(null);
      setAuthStatus("Requesting Circle email OTP...");
      setIsAuthenticating(true);

      try {
        const resolvedDeviceId = await ensureDeviceId();
        const payload = (await postW3sAction("requestEmailOtp", {
          deviceId: resolvedDeviceId,
          email: normalizedEmail,
        })) as {
          deviceEncryptionKey: string;
          deviceToken: string;
          otpToken: string;
        };

        const loginConfigs = {
          deviceToken: payload.deviceToken,
          deviceEncryptionKey: payload.deviceEncryptionKey,
          otpToken: payload.otpToken,
          email: {
            email: normalizedEmail,
          },
        };

        sdk.updateConfigs({
          appSettings: { appId: CIRCLE_APP_ID },
          loginConfigs,
        });

        storeLoginConfig({
          loginMethod: "email",
          loginConfigs,
          email: normalizedEmail,
        });

        setAuthStatus("OTP sent. Open the Circle OTP window to verify your email.");
      } catch (error) {
        handleAuthFailure(error);
      } finally {
        authRequestInFlightRef.current = false;
        setIsAuthenticating(false);
      }
    },
    [ensureDeviceId, handleAuthFailure, postW3sAction, storeLoginConfig]
  );

  const verifyEmailOtp = useCallback(() => {
    const sdk = sdkRef.current;

    if (!sdk) {
      setAuthError("Circle Web SDK is not ready yet.");
      return;
    }

    if (!hasPendingEmailOtp) {
      setAuthError("Request an email OTP before verifying it.");
      return;
    }

    setAuthError(null);
    setAuthStatus("Opening Circle email verification window...");
    setIsAuthenticating(true);
    sdk.verifyOtp();
  }, [hasPendingEmailOtp]);

  const logout = useCallback(() => {
    clearCircleOAuthState();
    clearStoredLoginConfig({ preserveGoogleCookies: true });
    clearPasskeyState();
    persistSession(null);
    setArcWallet(null);
    setAuthError(null);
    setAuthStatus(null);
    setHasPendingEmailOtp(false);
    setIsAuthenticating(false);
    setSession(null);
    setSepoliaWallet(null);
    setWallets([]);
  }, [clearPasskeyState, clearStoredLoginConfig, persistSession]);

  const primaryWallet = arcWallet ?? sepoliaWallet ?? wallets[0] ?? null;

  const getDevCredentials = useCallback(() => {
    const resolvedSession =
      session && !isPasskeySession(session)
        ? session
        : readStoredJson<CircleSession>(SESSION_STORAGE_KEY);

    if (
      !primaryWallet?.id ||
      !resolvedSession ||
      isPasskeySession(resolvedSession)
    ) {
      return null;
    }

    return {
      token: resolvedSession.userToken,
      key: resolvedSession.encryptionKey,
      walletId: primaryWallet.id,
    };
  }, [primaryWallet?.id, session]);

  const value = useMemo<CircleWalletContextValue>(
    () => ({
      arcWallet,
      authMethod: session?.authMethod ?? null,
      authError,
      authStatus,
      authenticated: Boolean(session),
      closeLogin: () => setIsLoginOpen(false),
      createContractExecutionChallenge,
      createTypedDataChallenge,
      executeChallenge,
      getDevCredentials,
      getWalletBalances,
      hasPendingEmailOtp,
      isAuthenticating,
      login: () => setIsLoginOpen(true),
      loginMethodLabel:
        session?.authMethod === "google"
          ? "Google"
          : session?.authMethod === "email"
            ? "Email"
            : session?.authMethod === "passkey"
              ? "Passkey"
            : "Circle",
      logout,
      primaryWallet,
      ready,
      refreshWallets: async () => {
        await loadWallets();
      },
      requestEmailOtp,
      requestGoogleLogin,
      requestPasskeyLogin,
      requestPasskeyRegistration,
      sepoliaWallet,
      userEmail: session?.email ?? null,
      verifyEmailOtp,
      wallets,
    }),
    [
      arcWallet,
      authError,
      authStatus,
      createContractExecutionChallenge,
      createTypedDataChallenge,
      executeChallenge,
      getDevCredentials,
      getWalletBalances,
      hasPendingEmailOtp,
      isAuthenticating,
      loadWallets,
      logout,
      primaryWallet,
      ready,
      requestEmailOtp,
      requestGoogleLogin,
      requestPasskeyLogin,
      requestPasskeyRegistration,
      sepoliaWallet,
      session,
      verifyEmailOtp,
      wallets,
    ]
  );

  return (
    <CircleWalletContext.Provider value={value}>
      {children}
      <CircleWalletLoginDialog
        authError={authError}
        authStatus={authStatus}
        canUseGoogle={Boolean(CIRCLE_APP_ID && GOOGLE_CLIENT_ID)}
        hasPendingEmailOtp={hasPendingEmailOtp}
        isDeviceReady={Boolean(deviceId)}
        isAuthenticating={isAuthenticating}
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onRequestEmailOtp={requestEmailOtp}
        onRequestGoogleLogin={requestGoogleLogin}
        onRequestPasskeyLogin={requestPasskeyLogin}
        onRequestPasskeyRegistration={requestPasskeyRegistration}
        onVerifyEmailOtp={verifyEmailOtp}
        passkeyUnavailableReason={passkeyUnavailableReason}
      />
    </CircleWalletContext.Provider>
  );
}

function CircleWalletLoginDialog({
  authError,
  authStatus,
  canUseGoogle,
  hasPendingEmailOtp,
  isDeviceReady,
  isAuthenticating,
  isOpen,
  onClose,
  onRequestEmailOtp,
  onRequestGoogleLogin,
  onRequestPasskeyLogin,
  onRequestPasskeyRegistration,
  onVerifyEmailOtp,
  passkeyUnavailableReason,
}: {
  authError: string | null;
  authStatus: string | null;
  canUseGoogle: boolean;
  hasPendingEmailOtp: boolean;
  isDeviceReady: boolean;
  isAuthenticating: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRequestEmailOtp: (email: string) => Promise<void>;
  onRequestGoogleLogin: () => Promise<void>;
  onRequestPasskeyLogin: () => Promise<void>;
  onRequestPasskeyRegistration: (username: string) => Promise<void>;
  onVerifyEmailOtp: () => void;
  passkeyUnavailableReason: string | null;
}) {
  const [email, setEmail] = useState("");
  const [passkeyUsername, setPasskeyUsername] = useState("");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setEmail("");
          setPasskeyUsername("");
          onClose();
        }
      }}
    >
      <DialogContent className="border-border/40 bg-background/95 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <Wallet className="h-4.5 w-4.5" />
            </div>
            Connect Circle Wallet
          </DialogTitle>
          <DialogDescription>
            Sign in with Circle using passkeys, Google, or email OTP. Passkey
            sign-in is bound to app.wizpay.xyz and keeps the Circle wallet session on
            this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Passkey</p>
            </div>
            <p className="text-sm text-muted-foreground/70">
              Use a platform passkey on desktop or mobile Chrome to register a new
              Circle session or restore an existing one.
            </p>
            <div className="mt-4 space-y-3">
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(event) => setPasskeyUsername(event.target.value)}
                placeholder="Choose a passkey username"
                value={passkeyUsername}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={
                    Boolean(passkeyUnavailableReason) ||
                    isAuthenticating ||
                    !passkeyUsername.trim()
                  }
                  variant="outline"
                  onClick={() => {
                    void onRequestPasskeyRegistration(passkeyUsername);
                  }}
                >
                  Create Passkey
                </Button>
                <Button
                  disabled={Boolean(passkeyUnavailableReason) || isAuthenticating}
                  onClick={() => {
                    void onRequestPasskeyLogin();
                  }}
                >
                  Sign in with Passkey
                </Button>
              </div>
            </div>
            {passkeyUnavailableReason ? (
              <p className="mt-2 text-xs text-muted-foreground/60">
                {passkeyUnavailableReason}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground/60">
                Works on desktop and Chrome for Android when the app is opened over
                HTTPS on app.wizpay.xyz.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <LogIn className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Google social login</p>
            </div>
            <p className="text-sm text-muted-foreground/70">
              Use the Circle-configured Google OAuth flow to restore the same user wallet.
            </p>
            <Button
              className="mt-4 w-full"
              disabled={!canUseGoogle || isAuthenticating || !isDeviceReady}
              onClick={() => {
                void onRequestGoogleLogin();
              }}
            >
              Continue with Google
            </Button>
            {!canUseGoogle ? (
              <p className="mt-2 text-xs text-muted-foreground/60">
                Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in.
              </p>
            ) : !isDeviceReady ? (
              <p className="mt-2 text-xs text-muted-foreground/60">
                Circle device is initializing. Login buttons will enable automatically.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Email OTP</p>
            </div>
            <div className="space-y-3">
              <Input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={isAuthenticating || !email.trim() || !isDeviceReady}
                  variant="outline"
                  onClick={() => {
                    void onRequestEmailOtp(email);
                  }}
                >
                  Send OTP
                </Button>
                <Button
                  disabled={!hasPendingEmailOtp || isAuthenticating}
                  onClick={onVerifyEmailOtp}
                >
                  Verify OTP
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Circle manages the wallet session</p>
                <p className="text-sm text-muted-foreground/70">
                  Sign-in creates or restores your Circle user wallet on Arc Testnet and Ethereum Sepolia.
                </p>
              </div>
            </div>
          </div>

          {authStatus ? (
            <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5 text-sm text-muted-foreground">
              {authStatus}
            </div>
          ) : null}

          {authError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {authError}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useCircleWallet() {
  const value = useContext(CircleWalletContext);

  if (!value) {
    throw new Error("useCircleWallet must be used inside CircleWalletProvider.");
  }

  return value;
}
