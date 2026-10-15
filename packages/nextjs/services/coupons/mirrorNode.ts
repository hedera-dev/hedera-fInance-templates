/** Thin wrappers around the Hedera testnet mirror node REST API. */

const MIRROR_BASE = process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com";

async function mirrorFetch(path: string): Promise<any | null> {
  const res = await fetch(`${MIRROR_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Mirror node request failed (${res.status}): ${path}`);
  }
  return res.json();
}

const hex0x = (value: string | null | undefined): `0x${string}` | null =>
  value ? (value.startsWith("0x") ? (value as `0x${string}`) : (`0x${value}` as `0x${string}`)) : null;

/** Resolves a Hedera account id (`0.0.n`) from an EVM address, or null if it doesn't exist yet. */
export async function getAccountIdFromEvm(evmAddress: string): Promise<string | null> {
  const data = await mirrorFetch(`/api/v1/accounts/${evmAddress}`);
  return data?.account ?? null;
}

/** HBAR balance in tinybars for an account id or EVM address. */
export async function getHbarBalanceTinybars(accountIdOrEvm: string): Promise<bigint> {
  const data = await mirrorFetch(`/api/v1/accounts/${accountIdOrEvm}`);
  const balance = data?.balance?.balance;
  return typeof balance === "number" ? BigInt(balance) : 0n;
}

/** Fungible token balance (smallest units) for an account id or EVM address. */
export async function getTokenBalance(accountIdOrEvm: string, tokenId: string): Promise<bigint> {
  const data = await mirrorFetch(`/api/v1/accounts/${accountIdOrEvm}/tokens?token.id=${tokenId}`);
  const entry = data?.tokens?.[0];
  return entry ? BigInt(entry.balance) : 0n;
}

/** Whether an account is associated with a token (any relationship, even with zero balance). */
export async function isTokenAssociated(accountIdOrEvm: string, tokenId: string): Promise<boolean> {
  const data = await mirrorFetch(`/api/v1/accounts/${accountIdOrEvm}/tokens?token.id=${tokenId}`);
  return Boolean(data?.tokens && data.tokens.length > 0);
}

/** Contract id (`0.0.n`) for a deployed contract's EVM address, or null if not found (yet). */
export async function getContractIdFromEvm(evmAddress: string): Promise<string | null> {
  const data = await mirrorFetch(`/api/v1/contracts/${evmAddress}`);
  return data?.contract_id ?? null;
}

export type MirrorLog = {
  data: `0x${string}`;
  topics: `0x${string}`[];
  transactionHash: `0x${string}`;
  timestamp: string; // Hedera consensus timestamp, "seconds.nanos"
};

/** Newest-first contract event logs for a bond, straight from the mirror node (not server memory). */
export async function getContractLogs(evmAddress: string, limit = 100): Promise<MirrorLog[]> {
  const data = await mirrorFetch(`/api/v1/contracts/${evmAddress}/results/logs?order=desc&limit=${limit}`);
  const logs = data?.logs ?? [];
  return logs
    .map((log: any) => ({
      data: hex0x(log.data) ?? "0x",
      topics: (log.topics ?? []).map((t: string) => hex0x(t)).filter(Boolean) as `0x${string}`[],
      transactionHash: hex0x(log.transaction_hash) ?? "0x",
      timestamp: log.timestamp,
    }))
    .filter((log: MirrorLog) => log.topics.length > 0);
}

/** Converts a Hedera consensus timestamp ("seconds.nanos") to an ISO string. */
export function consensusTimestampToIso(timestamp: string): string {
  const [seconds] = timestamp.split(".");
  return new Date(Number(seconds) * 1000).toISOString();
}
