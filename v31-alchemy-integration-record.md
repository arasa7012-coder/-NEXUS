# Nexus V3.1 — Alchemy On-Chain Integration Record

## Implemented integration

Nexus now uses a server-only Alchemy adapter as its active, provider-neutral on-chain source. The adapter is registered behind a shared provider contract, so a future Moralis or alternate adapter can be added without rewriting the wallet, persistence, entitlement, or UI layers. Only the adapter reads `ALCHEMY_API_KEY`; the browser, database records, API payloads, and pages receive provider statuses and normalized public observations, never the credential.

| Capability | V3.1 status | Verified behavior |
|---|---|---|
| Ethereum public-wallet lookup | **Connected** | Native balance, token-balance rows, and normalized inbound/outbound transfer observations are requested from Alchemy and saved with provider, chain, address, block, hash, and timestamps. |
| Base public-wallet lookup | **Connected** | Native balance and transfer observations are requested and persisted under a Base-isolated wallet identity. |
| Storage and cache | **Connected** | TiDB records wallet, balance snapshot, token balance, transfer, sync receipt, score, and user watchlist rows. A 45-second provider-isolated cache avoids unnecessary repeat requests. |
| Smart Money score | **Connected, observational** | Nexus computes an explainable proprietary activity score from retained transfer count, distinct active days, and observation span. It is not an Alchemy score or profitability claim. |
| Copilot context | **Connected, owned wallets only** | After a user adds a public wallet to their own watchlist, Copilot can include its stored provider evidence, score, and limitations. |
| Admin integration view | **Connected, admin only** | Admin → Integrations shows Alchemy health, verified networks, last sync, requests, errors, rate limits, and Webhook readiness without secrets. |
| Watchlist interaction | **Connected, user owned** | A saved wallet can be reopened from the user’s watchlist, refreshed through the same Alchemy/entitlement path, and then passed to Copilot by internal watchlist identifier only. |

## Real-provider verification

A server-side Alchemy smoke run used a public Ethereum address on both supported EVM networks and persisted the results. Ethereum returned a verified native balance, **97** token-balance rows, and **20** transfer rows. Base returned a verified native balance, **0** token-balance rows, and **20** transfer rows. Both writes produced a wallet identifier and persisted their observations in TiDB. The persisted Ethereum transfer history crossed Nexus's minimum evidence threshold and produced a `WEAK` activity classification with a score and confidence; the classification is an observed-activity result, not a claim that the address is profitable or institutionally managed.

## Data integrity rules

Every transfer stores its transaction hash, chain, block number, wallet address context, observed timestamp, provider, and normalized source fields. A deterministic hash prevents duplicate transfer writes. Wallets are public EVM addresses only; ENS names, private keys, seed phrases, signatures, and credentials are rejected or never accepted. User watchlists are scoped to the signed-in owner, and an on-chain Copilot evidence request rejects wallet identifiers absent from that owner’s watchlist.

| Analytics field | Current result | Reason |
|---|---|---|
| Historical P&L | **DATA SOURCE NOT AVAILABLE** | Transfer observations do not establish cost basis, realized sale value, or complete valuation. |
| Win rate | **DATA SOURCE NOT AVAILABLE** | Transfers cannot be safely classified as closed trades or outcomes. |
| Drawdown | **DATA SOURCE NOT AVAILABLE** | The integration has no verified historical portfolio valuation series. |
| Position sizing | **DATA SOURCE NOT AVAILABLE** | Token units cannot be converted to a complete reliable valuation in this provider-only calculation. |
| Early-entry behavior | **DATA SOURCE NOT AVAILABLE** | Token-launch and first-liquidity evidence is not in the current verified input set. |
| NFT data and contract-interaction classification | **DATA SOURCE NOT AVAILABLE** | The current Alchemy adapter has not activated the separate NFT or receipt/trace normalization path. |
| Solana | **DATA SOURCE NOT AVAILABLE** | V3.1’s active public-wallet contract is EVM-only and has verified only Ethereum and Base. |
| Webhook delivery | **Endpoint ready; dashboard activation pending** | `/api/webhooks/alchemy` preserves the raw body, verifies Alchemy HMAC, rejects invalid signatures before parsing, deduplicates provider events, and re-syncs only already watched public wallets. A real dashboard delivery remains pending until the Alchemy Webhook is pointed at the deployed endpoint. |

## Validation

| Gate | Result |
|---|---|
| Alchemy credentials | Server-only `eth_chainId` verification passed; no key was emitted. |
| Provider tests | Ethereum and Base health plus public-wallet normalization passed against Alchemy. |
| Analytics tests | Sparse evidence returns `INSUFFICIENT_DATA`; sufficient retained transfer history yields an explainable non-P&L score. |
| Copilot safety tests | Existing evidence fallback and Copilot router tests pass after adding optional owned-wallet context. |
| Full Vitest | **86 files, 268 tests passed.** |
| TypeScript | Passed with `pnpm exec tsc --noEmit`. |
| Production build | Passed. The existing Copilot chunk remains an advisory-size warning. |

## References

[1] [Alchemy Docs — Webhooks Quickstart](https://www.alchemy.com/docs/reference/notify-api-quickstart) documents Address Activity Webhooks and raw-body HMAC SHA-256 signature verification with a separate signing key.
