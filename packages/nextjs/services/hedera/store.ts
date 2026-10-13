/**
 * In-memory DvP market state. Server-only — demo account private keys live
 * here and must never be serialized into an API response. Surviving a
 * server restart is explicitly not required.
 */
import type { BuyerChoice, TradeStatus, WalletRole } from "~~/services/hedera/types";

export type { BuyerChoice, TradeStatus, WalletRole };

export type DemoParty = {
  accountId: string;
  /** Hex-encoded ECDSA private key. Never put this on an API response. */
  privateKey: string;
};

export type WalletParty = {
  accountId: string;
};

export type Trade = {
  scheduleId: string;
  scheduledTransactionId: string;
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  /** True once the seller leg was signed by a connected wallet instead of the demo seller. */
  sellerIsWallet: boolean;
  /** True once the buyer leg is to be signed by a connected wallet instead of the demo buyer. */
  buyerIsWallet: boolean;
  status: TradeStatus;
  settlementResult: string | null;
};

export type Market = {
  securityTokenId: string;
  paymentTokenId: string;
  seller: DemoParty;
  buyer: DemoParty;
  unverifiedBuyer: DemoParty;
  walletSeller: WalletParty | null;
  walletBuyer: WalletParty | null;
  trade: Trade | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __dvpMarket: Market | undefined;
}

export function getMarket(): Market | null {
  return globalThis.__dvpMarket ?? null;
}

export function requireMarket(): Market {
  const market = getMarket();
  if (!market) throw new Error("No market has been set up yet. Press Set up market first.");
  return market;
}

export function setMarket(market: Market): void {
  globalThis.__dvpMarket = market;
}

export const SECURITY_DECIMALS = 0;
export const PAYMENT_DECIMALS = 6;
