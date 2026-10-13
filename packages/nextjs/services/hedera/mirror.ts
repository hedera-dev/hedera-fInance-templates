/**
 * Balance reads go through the mirror node's REST API rather than a consensus-node query:
 * it's the same source of truth the checker cross-references, and unlike a consensus query it
 * isn't subject to a testnet node's free-query throttling.
 */

const MIRROR_BASE = process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com";

type TokenBalancesResponse = { tokens?: { balance: number | string }[] };

async function fetchTokenBalance(accountId: string, tokenId: string): Promise<bigint> {
  const url = `${MIRROR_BASE}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Mirror node request for ${accountId} failed with status ${res.status}`);
  const data = (await res.json()) as TokenBalancesResponse;
  const entry = data.tokens?.[0];
  return entry ? BigInt(entry.balance) : 0n;
}

export type MirrorBalances = { security: bigint; payment: bigint };

/** Reads an account's balance of the two DvP tokens from the mirror node. */
export async function fetchPartyBalances(
  accountId: string,
  securityTokenId: string,
  paymentTokenId: string,
): Promise<MirrorBalances> {
  const [security, payment] = await Promise.all([
    fetchTokenBalance(accountId, securityTokenId),
    fetchTokenBalance(accountId, paymentTokenId),
  ]);
  return { security, payment };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** "0.0.1234@1690000000.123456789" (SDK) -> "0.0.1234-1690000000-123456789" (mirror node). */
function toMirrorTransactionId(sdkTransactionId: string): string {
  const [payer, time] = sdkTransactionId.split("@");
  const [seconds, nanos] = time.split(".");
  return `${payer}-${seconds}-${nanos}`;
}

/**
 * Blocks until the mirror node has indexed the given (SDK-formatted) transaction id, so a
 * balance read issued right after is never stale. Gives up quietly after a few seconds — the
 * caller's balances may then lag by a beat, but will catch up on the next refresh.
 */
export async function waitForMirrorIndexing(sdkTransactionId: string, maxAttempts = 8, delayMs = 1000): Promise<void> {
  const mirrorId = toMirrorTransactionId(sdkTransactionId);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${MIRROR_BASE}/api/v1/transactions/${mirrorId}`, { cache: "no-store" });
    if (res.ok) return;
    await sleep(delayMs);
  }
}
