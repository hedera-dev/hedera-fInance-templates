import { PrivateKey } from "@hiero-ledger/sdk";

/**
 * Parses and validates HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY once per server process.
 *
 * The operator key must be ECDSA: raw hex (32 bytes, with or without `0x`) or DER-encoded
 * ECDSA. An ED25519 key cannot sign EVM transactions, so it is refused here rather than
 * failing confusingly later when viem tries to use it.
 */
export type OperatorConfig = {
  accountId: string;
  /** Raw secp256k1 private key, for viem's privateKeyToAccount. */
  privateKeyHex: `0x${string}`;
  /** Same key, for @hiero-ledger/sdk's Client.setOperator and AccountCreateTransaction signing. */
  sdkPrivateKey: PrivateKey;
};

export type OperatorConfigResult =
  | { ok: true; config: OperatorConfig }
  | { ok: false; missing: string[]; error?: string };

function normalizeEcdsaHex(raw: string): string | null {
  const hex = raw.trim().replace(/^0x/i, "");
  if (/^[0-9a-f]{64}$/i.test(hex)) return hex.toLowerCase();
  try {
    const parsed = PrivateKey.fromStringDer(hex);
    if (parsed.type !== "secp256k1") return null;
    return parsed.toStringRaw();
  } catch {
    return null;
  }
}

let cached: OperatorConfigResult | null = null;

export function getOperatorConfig(): OperatorConfigResult {
  if (cached) return cached;

  const accountId = process.env.HEDERA_OPERATOR_ID;
  const rawKey = process.env.HEDERA_OPERATOR_KEY;
  const missing: string[] = [];
  if (!accountId) missing.push("HEDERA_OPERATOR_ID");
  if (!rawKey) missing.push("HEDERA_OPERATOR_KEY");
  if (missing.length > 0) {
    cached = { ok: false, missing };
    return cached;
  }

  const hex = normalizeEcdsaHex(rawKey as string);
  if (!hex) {
    cached = {
      ok: false,
      missing: [],
      error: "HEDERA_OPERATOR_KEY must be an ECDSA key (raw hex or DER-encoded); ED25519 keys are not supported.",
    };
    return cached;
  }

  cached = {
    ok: true,
    config: {
      accountId: accountId as string,
      privateKeyHex: `0x${hex}`,
      sdkPrivateKey: PrivateKey.fromStringECDSA(hex),
    },
  };
  return cached;
}
