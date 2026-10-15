import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
} from "@hiero-ledger/sdk";
import type { Address } from "viem";
import { Investor, addInvestor, getDeskState, setStablecoin } from "~~/services/coupons/deskState";
import { getOperatorConfig } from "~~/services/coupons/operator";
import { getSdkClient } from "~~/services/coupons/sdkClient";

/** Creates the HTS stablecoin paying coupons, 6 decimals, treasury the operator. Idempotent. */
export async function ensureStablecoin() {
  const existing = getDeskState().stablecoin;
  if (existing) return existing;

  const result = getOperatorConfig();
  if (!result.ok) throw new Error("Operator is not configured.");
  const client = getSdkClient();

  const tx = await new TokenCreateTransaction()
    .setTokenName("Acme Desk USD")
    .setTokenSymbol("ACUSD")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6)
    .setInitialSupply(10_000_000 * 10 ** 6)
    .setTreasuryAccountId(result.config.accountId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setAdminKey(result.config.sdkPrivateKey.publicKey)
    .setSupplyKey(result.config.sdkPrivateKey.publicKey)
    .freezeWith(client)
    .sign(result.config.sdkPrivateKey);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  const tokenId = receipt.tokenId;
  if (!tokenId) throw new Error("Stablecoin creation did not return a token id.");

  const evmAddress = `0x${tokenId.toEvmAddress()}` as Address;
  setStablecoin(tokenId.toString(), evmAddress);
  return { tokenId: tokenId.toString(), evmAddress };
}

/**
 * Creates one demo investor: an ECDSA-keyed Hedera account with an EVM address derived from
 * its public key and unlimited automatic token associations, so it can receive the stablecoin
 * without ever signing anything. At most 1 HBAR. The private key is used only to co-sign this
 * one creation (required because the account's alias is derived from it) and is then dropped.
 */
async function createDemoInvestor(id: "A" | "B", label: string): Promise<Investor> {
  const client = getSdkClient();
  const key = PrivateKey.generateECDSA();

  const tx = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key)
    .setInitialBalance(new Hbar(1))
    .setMaxAutomaticTokenAssociations(-1)
    .freezeWith(client)
    .sign(key);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  const accountId = receipt.accountId;
  if (!accountId) throw new Error(`Investor ${id} creation did not return an account id.`);

  const evmAddress = `0x${key.publicKey.toEvmAddress()}` as Address;
  const investor: Investor = { id, label, accountId: accountId.toString(), evmAddress };
  addInvestor(investor);
  return investor;
}

/** Creates Investor A and Investor B if they don't already exist. Idempotent. */
export async function ensureDemoInvestors(): Promise<Investor[]> {
  const state = getDeskState();
  const a = state.investors.find(i => i.id === "A") ?? (await createDemoInvestor("A", "Investor A"));
  const b = state.investors.find(i => i.id === "B") ?? (await createDemoInvestor("B", "Investor B"));
  return [a, b];
}
