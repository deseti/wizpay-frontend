# Circle Wallet Migration Plan

## Recommendation

Use Circle User-Controlled Wallets as the replacement for Privy in the WizPay frontend.

Recommended target for this repo:

- Auth: Google social login as primary, email OTP as fallback
- Wallet type: User-Controlled
- Account type: SCA on ARC-TESTNET and ETH-SEPOLIA
- Transaction model: server-created Circle challenges plus client-side Web SDK execution

This keeps the current product model intact: end users sign in inside the app and approve their own actions. It does not change WizPay into a custodial or developer-controlled wallet product.

## Why this is the right target

- It matches the current Privy product semantics better than Circle Developer-Controlled Wallets.
- The Circle Console screenshots already point to User Controlled wallet setup.
- Official Arc quickstarts for "Circle Wallets" bridge flows use developer-controlled wallets and require `CIRCLE_API_KEY` plus `CIRCLE_ENTITY_SECRET`; that pattern cannot be moved into the browser.
- Circle user-controlled wallets support the Web2-style onboarding the app already wants: social login, email OTP, confirmation UIs, and user approval for every write.

## Hard constraints discovered from the docs

- Circle User-Controlled Wallets are not a drop-in replacement for the current `wagmi` signer flow.
- The current frontend writes through `useWalletClient()`, `useWriteContract()`, and Privy smart-wallet clients.
- Circle User-Controlled Wallets use a challenge flow instead:
  1. frontend or server requests a Circle action
  2. Circle returns a `challengeId`
  3. client-side Web SDK executes the challenge after user approval
  4. completion is tracked through status polling or webhooks
- The official `@circle-fin/adapter-circle-wallets` bridge quickstart targets developer-controlled wallets, not the user-controlled Web SDK path.

## Target architecture

### Server

- Keep `CIRCLE_API_KEY` server-side only
- Add explicit route handlers under `app/api/w3s/*` or similar for:
  - create social device token or request email OTP
  - initialize user
  - refresh user token
  - list wallets
  - fetch balances
  - create transfer challenge
  - create contract execution challenge
  - create sign typed-data challenge
  - check transaction status
- Prefer explicit handlers over a generic Circle proxy
- Add Circle webhook handling for transaction status if production reliability matters

### Client

- Add a `CircleWalletProvider` for Web SDK lifecycle and session state
- Store the active `userToken`, `encryptionKey`, wallet list, and active wallet selection in one place
- Keep read-only chain access on public viem or wagmi clients
- Replace direct wallet writes with a shared challenge executor:
  - server creates challenge
  - client calls `sdk.execute(challengeId)`
  - client or server watches status until confirmed

### Session model

- Use `NEXT_PUBLIC_CIRCLE_APP_ID` on the client
- Keep refresh flow server-backed so login sessions survive reloads and normal browsing
- Prefer httpOnly cookie or encrypted server session storage for refresh-token handling
- Keep the short-lived `encryptionKey` in a client-managed session layer only as long as needed for SDK execution

## File-by-file impact

- `frontend/app/providers.tsx`
  - remove `PrivyProvider`, `SmartWalletsProvider`, and the Privy-driven wagmi config coupling
  - add `CircleWalletProvider`

- `frontend/lib/wagmi.ts`
  - replace `createConfig` from `@privy-io/wagmi` with plain wagmi config or viem-only public clients

- `frontend/components/dashboard/ConnectWalletCard.tsx`
  - replace `usePrivy().login` with Circle login entrypoints

- `frontend/components/dashboard/DashboardHeader.tsx`
  - replace Privy user state, export wallet actions, embedded wallet labels, and smart-wallet address logic

- `frontend/app/page.tsx`
  - replace `usePrivy` auth gating
  - update copy that references Privy smart wallet behavior

- `frontend/app/dashboard/page.tsx`
  - replace `usePrivy` auth gating

- `frontend/app/bridge/page.tsx`
  - replace `usePrivy` auth gating

- `frontend/app/swap/page.tsx`
  - replace `usePrivy` auth gating

- `frontend/hooks/useSmartWalletAddress.ts`
  - delete or replace with Circle wallet metadata hook

- `frontend/hooks/wizpay/useWizPayContract.ts`
  - replace `useWalletClient` and `useWriteContract` writes with Circle contract-execution challenges

- `frontend/hooks/wizpay/useBatchPayroll.ts`
  - remove the Privy smart-wallet multicall path
  - redesign around Circle challenge execution

- `frontend/components/dashboard/BridgeScreen.tsx`
  - replace Privy smart-wallet and external-wallet-first execution logic

- `frontend/lib/circle-bridge-kit.ts`
  - either rewrite around a custom user-controlled execution layer or retire it in favor of a custom bridge orchestrator

- `frontend/app/api/circle/proxy/route.ts`
  - keep it focused on App Kit and attestation traffic
  - do not stretch it into a generic W3S wallet proxy

## Migration phases

### Phase 1 - Circle auth and wallet creation

- Install `@circle-fin/w3s-pw-web-sdk`
- If using social login, also add whatever minimal cookie or redirect state helper is needed
- Add env vars:
  - `CIRCLE_API_KEY`
  - `NEXT_PUBLIC_CIRCLE_APP_ID`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` if Google is enabled
- Implement server routes for:
  - create device token or request email OTP
  - initialize user
  - list wallets
  - refresh token
  - read balances
- Create wallets on both `ARC-TESTNET` and `ETH-SEPOLIA`
- Prefer `accountType: "SCA"` on testnets to stay closer to the current smart-wallet UX
- If Ethereum mainnet is added later, re-evaluate SCA vs EOA there because Circle recommends EOA on Ethereum mainnet for cost reasons

### Phase 2 - Replace the app shell and auth gates

- Remove Privy from the root provider tree
- Replace login, logout, and session checks in the dashboard and route shells
- Replace wallet-address display logic in the header and faucet helpers
- Make the app work with Circle session state before touching complex transaction flows

### Phase 3 - Keep reads, replace writes

- Keep contract reads on public clients first
- Introduce one shared write abstraction:
  - server route creates the Circle challenge
  - client executes it with the Web SDK
  - status comes back through polling or webhook-backed refresh
- Migrate writes in this order:
  1. token approval
  2. standard payroll submit
  3. simple transfer actions
  4. typed-data signing actions

### Phase 4 - Payroll migration

- In `useWizPayContract.ts`:
  - turn approve into a Circle `contractExecution` challenge
  - turn the main submit path into a Circle `contractExecution` challenge
- In `useBatchPayroll.ts`:
  - do not port the current Privy multicall implementation directly
  - the current flow depends on wallet-side batched calls via the Privy smart wallet
- Recommended v1 behavior:
  - ship basic payroll first with explicit approve then submit
  - temporarily stop calling it "1-click" until the atomic path is rebuilt
- Recommended v2 behavior for true one-click payroll:
  - either confirm Circle User-Controlled SCA batch support with Circle
  - or add a single on-chain entrypoint so Circle only needs one challenge instead of wallet-side multicall

The second option is usually the cleaner long-term fix because it moves the complexity into one contract call instead of depending on wallet-specific batching behavior.

### Phase 5 - Bridge migration

- Treat bridge as a separate project after auth and basic payroll are stable
- Do not adopt `@circle-fin/adapter-circle-wallets` for this frontend path; the official quickstart is developer-controlled
- Recommended bridge direction for this repo:
  - keep the existing quote and status UX ideas where useful
  - replace execution with a server-orchestrated user-controlled flow:
    1. create source-chain contract-execution challenge or transfer challenge
    2. execute challenge in the Circle Web SDK
    3. wait for Circle or CCTP or Gateway status
    4. create destination-chain challenge if finalize or mint is needed
- If Bridge Kit UI is still desired later, build a custom adapter only after user-controlled transaction primitives are stable

This is the hardest part of the migration because the current bridge implementation assumes a direct signer adapter, while Circle User-Controlled Wallets are challenge-based.

### Phase 6 - Cleanup and Privy removal

- Remove dependencies:
  - `@privy-io/react-auth`
  - `@privy-io/wagmi`
  - `permissionless` if no longer used anywhere
- Replace any Privy-driven wagmi helpers with plain wagmi or direct viem public clients
- Delete old smart-wallet helpers, Privy copy, and Privy-specific UI IDs once the new flow is stable

## Recommended implementation order for this repo

1. Land Circle auth and wallet creation first
2. Replace dashboard auth gates and the account header
3. Migrate standard payroll submit on Arc
4. Decide the redesign for true one-click payroll
5. Rebuild bridge on top of user-controlled challenges
6. Remove Privy packages last

## Non-negotiable server-side boundaries

- Never expose `CIRCLE_API_KEY` to the browser
- Do not add a generic open proxy for all `api.circle.com` paths
- Validate payloads on every W3S route
- Use webhook or server polling for transaction state instead of trusting only client-side optimistic state

## Success criteria

- A user can sign in with Circle social login or email
- The app can create or restore the same user wallet set on Arc and Sepolia
- The dashboard can read balances and history without Privy
- Standard payroll submit works end-to-end through Circle challenges
- Bridge no longer depends on Privy or embedded-wallet chain switching
- Privy packages can be removed without auth or write-path regressions