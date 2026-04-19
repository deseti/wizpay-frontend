# Migrating to a New Circle Console Project

## Short Answer

Yes. For this repo, creating a brand-new Circle project is the most practical way to restore the current flow when the previous entity secret and recovery file are no longer available.

You cannot swap only `CIRCLE_ENTITY_SECRET` and expect the integration to recover. This repo ties together multiple Circle credentials and app-level resources:

- `CIRCLE_API_KEY`
- `NEXT_PUBLIC_CIRCLE_APP_ID`
- Google OAuth configuration for the active Circle app
- `CIRCLE_ENTITY_SECRET`
- developer-controlled wallet sets used by the bridge

If the original Circle project is no longer recoverable, the safe assumption is that you are rebuilding the Circle side from scratch and reconnecting the existing frontend and backend to the new project.

## What Survives and What Must Be Recreated

### Can Be Reused

- The current frontend and backend code
- The existing Circle W3S login architecture
- The current server-side bridge architecture
- The wallet bootstrap endpoints already implemented in the repo

### Must Be Recreated

- A new Circle test project or account
- A new `TEST_API_KEY`
- A new Circle User-Controlled Wallet app and `NEXT_PUBLIC_CIRCLE_APP_ID`
- Google OAuth attached to that new Circle app
- A new raw `CIRCLE_ENTITY_SECRET` and its recovery file
- A new bridge wallet set
- New bridge source wallets for `ETH-SEPOLIA` and or `ARC-TESTNET`
- Fresh balances for the new bridge wallets

### Do Not Assume These Will Carry Over

- The previous developer-controlled wallet set
- The previous raw entity secret
- The previous recovery file
- Old W3S login sessions
- Old user wallets automatically appearing under the new Circle app

## Circle Surfaces Used by This Repo

This repo uses Circle in three separate places:

1. User-Controlled Wallets for login and user wallets
   - main variables: `CIRCLE_API_KEY`, `NEXT_PUBLIC_CIRCLE_APP_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
2. Developer-Controlled Wallets for the server-side bridge source wallet
   - main variables: `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`
3. Optional kit-based flows
   - optional variables: `CIRCLE_KIT_KEY`, `NEXT_PUBLIC_CIRCLE_KIT_KEY`

Because the W3S proxy and the bridge runtime both depend on `CIRCLE_API_KEY`, the cleanest migration is to move the whole Circle integration to the new project at the same time.

## Recommended Migration Order

1. Back up the current frontend env file.
2. Create a new Circle test project.
3. Create a new API key.
4. Create a new W3S app.
5. Attach Google OAuth to the new app.
6. Register a new entity secret for developer-controlled wallets.
7. Refill `frontend/.env.local`.
8. Verify the Circle runtime locally.
9. Sign in again so new user wallets are created under the new app.
10. Bootstrap new bridge wallets.
11. Fund the new bridge wallets.
12. Test the bridge in both directions.

## Detailed Steps

### 1. Back Up the Existing Env File

From the repo root:

```powershell
Copy-Item .\frontend\.env.local .\frontend\.env.local.before-new-circle
```

Keep that backup until the migration is complete.

### 2. Create a New Circle Test Project

In Circle Console:

- create a new project for the test environment
- make sure it is meant for testnet use, since this repo targets `ARC-TESTNET` and `ETH-SEPOLIA`
- create a new API key with the `TEST_API_KEY` prefix

Important notes:

- do not mix a `LIVE_API_KEY` into this testnet setup
- this repo expects the API key and selected chains to match correctly

### 3. Create a New W3S App

In the new Circle project:

- enable User-Controlled Wallets
- create a new app
- store its App ID for `NEXT_PUBLIC_CIRCLE_APP_ID`
- enable the login methods you want to support:
  - Google social login
  - email OTP as fallback

### 4. Configure Google OAuth for the New App

This repo builds the Google login flow with `redirectUri = window.location.origin`, so your local origin must be allowed.

At minimum, the Google OAuth client used by this app should allow:

- `http://localhost:3000`
- your production domain later on

Then confirm in Circle Console that the Google provider is enabled on the same W3S app referenced by `NEXT_PUBLIC_CIRCLE_APP_ID`.

Do not reuse a Google Client ID from the previous app unless you have verified it is enabled on the new Circle app.

### 5. Register a New Entity Secret

The safest path in this repo is to use the existing frontend helper script.

Safe order:

1. fill in the new `CIRCLE_API_KEY` inside `frontend/.env.local`
2. leave `CIRCLE_ENTITY_SECRET` empty
3. run the secret registration script

```powershell
npm --prefix d:\wizpay-contract\frontend run circle:entity-secret:rotate
```

Even though the script name says `rotate`, it also supports first-time registration for a new entity. On success it will:

- generate a new raw 64-character lowercase hex entity secret
- register that secret with Circle
- write the new `CIRCLE_ENTITY_SECRET` into `frontend/.env.local`
- save a recovery artifact under `frontend/output/circle-entity-secret/`

Immediately after that:

- store the raw `CIRCLE_ENTITY_SECRET` in a password manager or secret manager
- move the `recovery_file_*.dat` to a secure location outside the workspace and back it up

Critical warnings:

- never paste the recovery file contents into `CIRCLE_ENTITY_SECRET`
- do not discard the new recovery file
- do not rely on `.env.local` as the only surviving copy of the secret

### 6. Fill `frontend/.env.local`

Minimal template aligned with the current code:

```dotenv
NEXT_PUBLIC_USE_REAL_STABLEFX=true

CIRCLE_API_KEY=TEST_API_KEY:replace-me
CIRCLE_BASE_URL=https://api.circle.com
CIRCLE_ENTITY_SECRET=replace-with-64-char-lowercase-hex

NEXT_PUBLIC_CIRCLE_APP_ID=replace-with-new-circle-app-id
NEXT_PUBLIC_GOOGLE_CLIENT_ID=replace-with-google-oauth-client-id

CIRCLE_WALLETS_BASE_URL=https://api.circle.com
CIRCLE_TRANSFER_BLOCKCHAIN=ETH-SEPOLIA
CIRCLE_TRANSFER_TOKEN_ADDRESS=
CIRCLE_TRANSFER_FEE_LEVEL=MEDIUM
CIRCLE_BRIDGE_TRANSFER_SPEED=FAST

CIRCLE_WALLET_SET_ID_ARC=
CIRCLE_WALLET_ID_ARC=
CIRCLE_WALLET_ADDRESS_ARC=
CIRCLE_WALLET_SET_ID_SEPOLIA=
CIRCLE_WALLET_ID_SEPOLIA=
CIRCLE_WALLET_ADDRESS_SEPOLIA=

CIRCLE_KIT_KEY=
NEXT_PUBLIC_CIRCLE_KIT_KEY=

BACKEND_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_API_BASE_URL=http://localhost:4000

NEXT_PUBLIC_ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Bridge wallet notes:

- set `CIRCLE_WALLET_ID_SEPOLIA` to the Ethereum Sepolia wallet ID from Circle Console
- set `CIRCLE_WALLET_ID_ARC` to the Arc Testnet wallet ID from Circle Console
- leave the per-chain wallet set and wallet address fields empty during the first setup unless you intentionally want to pin them too
- the bootstrap routes in this repo can create and discover new wallets from scratch

Current default bridge token mapping:

- `ARC-TESTNET` USDC: `0x3600000000000000000000000000000000000000`
- `ETH-SEPOLIA` USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

If `CIRCLE_TRANSFER_TOKEN_ADDRESS` stays blank, the repo uses the current chain default.

### 7. Verify the Env and the Build

```powershell
npm --prefix d:\wizpay-contract\frontend run circle:entity-secret:doctor
npm --prefix d:\wizpay-contract\frontend run build
```

What you want to see from the doctor output:

- API key prefix = `TEST_API_KEY`
- `entitySecret.length = 64`
- `isLowerHex64 = true`
- no base64-like payload warning

### 8. Start the App Locally

```powershell
npm --prefix d:\wizpay-contract\frontend run dev
```

The local app runs on `http://localhost:3000` by default.

### 9. Sign In Again to Create New User Wallets

Because this is a new Circle app, treat every sign-in as a new user from Circle's perspective.

After sign-in succeeds:

- the repo's initialization flow requests wallets on `ARC-TESTNET` and `ETH-SEPOLIA`
- the frontend loads the wallet list from the new Circle app

If Google sign-in fails, check these first:

- `NEXT_PUBLIC_CIRCLE_APP_ID` really belongs to the new app
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` matches the Google client enabled on that same Circle app
- `http://localhost:3000` is allowed in the OAuth configuration

### 10. Bootstrap New Bridge Wallets

This repo already includes routes to create bridge source wallets.

Bootstrap a Sepolia bridge wallet:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers/wallet/bootstrap" -Method Post -ContentType "application/json" -Body '{"blockchain":"ETH-SEPOLIA"}'
```

Bootstrap an Arc bridge wallet:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers/wallet/bootstrap" -Method Post -ContentType "application/json" -Body '{"blockchain":"ARC-TESTNET"}'
```

Inspect the resulting wallets:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers/wallet?blockchain=ETH-SEPOLIA" -Method Get
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers/wallet?blockchain=ARC-TESTNET" -Method Get
```

Important note:

- the first bootstrap can create a brand-new wallet set automatically
- only store `CIRCLE_WALLET_SET_ID_SEPOLIA`, `CIRCLE_WALLET_ADDRESS_SEPOLIA`, `CIRCLE_WALLET_SET_ID_ARC`, and `CIRCLE_WALLET_ADDRESS_ARC` later if you intentionally want to pin them

### 11. Fund the New Bridge Source Wallets

The current official bridge flow is server-side and uses the source wallet on the opposite chain.

Chain mapping in this repo:

- destination `ARC-TESTNET` -> source wallet must exist on `ETH-SEPOLIA`
- destination `ETH-SEPOLIA` -> source wallet must exist on `ARC-TESTNET`

Required balances:

- USDC on the source chain
- the gas asset needed for that chain's bridge execution

Practical guidance:

- source `ETH-SEPOLIA`: prepare Sepolia ETH for gas and Sepolia testnet USDC for the transfer amount
- source `ARC-TESTNET`: prepare enough balance for the new Arc wallet; in this repo Arc currently surfaces its gas label as USDC

### 12. Test the Bridge

Example bridge test to Arc:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers" -Method Post -ContentType "application/json" -Body '{"destinationAddress":"0xYourDestinationAddress","amount":"1","blockchain":"ARC-TESTNET"}'
```

Example bridge test to Sepolia:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/transfers" -Method Post -ContentType "application/json" -Body '{"destinationAddress":"0xYourDestinationAddress","amount":"1","blockchain":"ETH-SEPOLIA"}'
```

Important behavior:

- the `blockchain` field on `/api/transfers` is the destination chain, not the source chain
- the source chain is chosen automatically as the opposite side of the route

### 13. When to Persist Wallet IDs in Env

After bootstrap succeeds and you are confident the selected wallets are correct, you may optionally persist these values for more stable resolution:

- `CIRCLE_WALLET_ID_SEPOLIA`
- `CIRCLE_WALLET_SET_ID_SEPOLIA`
- `CIRCLE_WALLET_ADDRESS_SEPOLIA`
- `CIRCLE_WALLET_ID_ARC`
- `CIRCLE_WALLET_SET_ID_ARC`
- `CIRCLE_WALLET_ADDRESS_ARC`

This is optional. For the initial migration, it is safer to leave them empty.

## Success Checklist

You can consider the migration complete when all of the following are true:

- `npm run circle:entity-secret:doctor` reports a 64-character hex secret
- the frontend build passes
- Google login or email OTP succeeds in the new Circle app
- user wallets appear for `ARC-TESTNET` and `ETH-SEPOLIA`
- bridge wallet bootstrap succeeds
- the bridge wallets are funded sufficiently
- `POST /api/transfers` no longer fails with `CIRCLE_ENTITY_SECRET_INVALID`

## Key Risks and Decisions

### Biggest Risk

If you lose the new raw entity secret and the new recovery file again, you will recreate the same dead end.

### Recommended Decisions

- use a fresh Circle test project dedicated to this repo
- migrate all Circle credentials together
- leave bridge wallet identifiers blank during the first bootstrap
- back up the raw secret and recovery file outside the workspace on the same day

## Fastest Recovery Path

If your goal is to restore the current architecture as quickly as possible, follow this exact sequence:

1. create a new Circle test project
2. add the new `CIRCLE_API_KEY`
3. run `circle:entity-secret:rotate` for first-time registration
4. set `NEXT_PUBLIC_CIRCLE_APP_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
5. run build and dev
6. sign in again
7. bootstrap new bridge wallets
8. fund the bridge wallets
9. test the bridge

That is the shortest path to preserving the current repo architecture without rewriting the bridge into a user-wallet or MetaMask model.
