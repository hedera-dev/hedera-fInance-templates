# DvP settlement

Replace the home page at `/` with a delivery-versus-payment (DvP) settlement
desk. A seller sells a security token to a buyer for a stablecoin, and both
legs settle in **one** Hedera transaction: either the security and the
stablecoin both change hands, or neither does. There is no escrow contract —
settlement is a native `TransferTransaction` carrying both legs, wrapped in a
scheduled transaction so the seller and the buyer can sign at different times.

Three parties appear on the page:

- **Issuer** — the operator account the app runs with. Creates the tokens,
  grants KYC, and funds the other two.
- **Seller** — holds the security, proposes the trade, signs first.
- **Buyer** — holds the stablecoin, signs second. There are two buyers: one
  KYC-approved on the security, and one that is not.

The Seller and both Buyers are demo accounts the app creates and signs for on
the server, so the whole flow runs from one browser tab with no wallet.

## What a user sees

**An explanation.** A short paragraph at the top says what DvP is and that both
legs settle together or not at all.

**Setup.** A control `#setup-market`, labelled `Set up market`. When the app has
no operator configured, `#setup-market` is disabled and `#config-error` names
the two environment variables to set: `HEDERA_OPERATOR_ID` and
`HEDERA_OPERATOR_KEY`.

After setup completes, the page shows:

- `#security-token-id` — the security token id, e.g. `0.0.1234`
- `#payment-token-id` — the stablecoin token id
- `#seller-account-id`, `#buyer-account-id`, `#unverified-buyer-account-id`
- a balance for each of the three parties in each token, in elements
  `#balance-seller-security`, `#balance-seller-payment`,
  `#balance-buyer-security`, `#balance-buyer-payment`,
  `#balance-unverified-buyer-security`, `#balance-unverified-buyer-payment`.
  Each holds a plain number in whole token units: digits, an optional decimal
  point, no separators, no symbol.

Every token id and account id links to its page on HashScan testnet.

**A trade ticket.** After setup:

- `#trade-quantity` — number of security tokens, defaulting to `100`
- `#trade-price` — total stablecoin to pay, defaulting to `10000`
- `#trade-buyer` — choice between the Buyer and the unverified Buyer
- `#propose-trade` — labelled `Propose trade (Seller signs)`
- `#buyer-sign` — labelled `Sign as Buyer`, enabled only while a proposed trade
  is waiting for the buyer's signature

**The trade's state.** Once a trade is proposed:

- `#schedule-id` — the schedule id, linked to HashScan
- `#trade-status` — exactly one of `PENDING`, `SETTLED`, `REJECTED`
- `#settlement-result` — after the buyer signs, the network's result code for
  the settlement, e.g. `SUCCESS` or `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`

## Behaviour

**The market starts in a known state.** Right after setup: the Seller holds
`200` security and `0` stablecoin; the Buyer holds `0` security and `10000`
stablecoin; the unverified Buyer holds `0` security and `10000` stablecoin. The
security token has a KYC key and a freeze key. The Seller and the Buyer are
granted KYC on the security; the unverified Buyer is associated with both tokens
but is **not** granted KYC. The stablecoin has 6 decimals and no KYC key; the
security has 0 decimals.

**Nothing moves on one signature.** After `#propose-trade`, `#trade-status` is
`PENDING`, the schedule exists on the network unexecuted, and every balance is
exactly what it was before.

**Both legs settle together.** With the Buyer selected, `#buyer-sign` makes the
schedule execute. `#trade-status` becomes `SETTLED`, `#settlement-result` is
`SUCCESS`, and with the default ticket the Seller ends with `100` security and
`10000` stablecoin while the Buyer ends with `100` security and `0` stablecoin.
On the mirror node, the settlement is a single transaction whose token
transfers include both the security leg and the stablecoin leg.

**A failed leg fails both.** With the unverified Buyer selected, after both
signatures `#trade-status` is `REJECTED`, `#settlement-result` is
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, and **no** balance has changed — the
unverified Buyer still holds all of its stablecoin even though only the
security leg failed the KYC check.

**The desk can trade again.** After a settled or rejected trade, a new trade can
be proposed without setting up a new market. Setting up a new market creates
new tokens and accounts and resets the page to them.

**Balances are read from the network.** Displayed balances agree with the mirror
node for the same accounts once the mirror node has caught up, and refresh after
each step without a page reload.

**Private keys never reach the browser.** No response the server sends to the
page contains the operator key or any demo account's private key.

**Nothing half-rendered is ever shown.** At no point does any element above
display `undefined`, `NaN`, `null`, or an empty value while visible. While a
step is in progress its control shows that it is working and cannot be pressed
twice.

## How this will be checked

1. Open `/`. Read the explanation and confirm `#setup-market` is present.
2. Press `#setup-market`. Read every id and balance, then confirm on the mirror
   node: both tokens exist, the security has a KYC key and a freeze key, the
   balances match, and the unverified Buyer has no KYC on the security.
3. With the Buyer selected and the default ticket, press `#propose-trade`. Read
   `#schedule-id` and `#trade-status`; confirm on the mirror node that the
   schedule exists and has not executed, and that balances are unchanged.
4. Press `#buyer-sign`. Confirm `SETTLED` and `SUCCESS`, the new balances on the
   page and on the mirror node, and that the schedule's executed transaction
   carries both legs.
5. Select the unverified Buyer, propose a trade for `10` security at `1000`
   stablecoin, and sign as Buyer. Confirm `REJECTED`,
   `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, and that no balance changed — on the
   page and on the mirror node.
6. Inspect the responses the page received during all of the above for any
   private key.

## Constraints

- Hedera native services only, through `@hiero-ledger/sdk`, which the project
  already depends on. No Solidity, no smart contracts, no escrow.
- The operator comes from the server-side environment variables
  `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`. The key is an ECDSA private
  key in hex and may carry a `0x` prefix.
- All signing happens in server routes under `packages/nextjs/app/api/`,
  following the existing pattern in `packages/nextjs/app/api/hedera/`. The
  browser only ever calls those routes.
- Keeping the market — token ids, account ids and demo keys — in server memory
  is fine; it does not need to survive a server restart.
- Testnet only.
- No new dependencies.

## Out of scope

- Signing with a browser wallet (HashPack, MetaMask). Demo accounts only.
- Settling on a future date (`waitForExpiry`), partial fills, order books.
- Real USDC; the stablecoin is a token the app creates.
- Logging trades to the Hedera Consensus Service.
- Persisting the market across server restarts.
