/**
 * Client-side fetch wrappers for the DvP API routes. No Hedera SDK import here — just JSON
 * over fetch, so this module is safe to use from any client component.
 */
import type { BuyerChoice, MarketSnapshot, WalletRole } from "~~/services/hedera/types";

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request to ${url} failed`);
  return data as T;
}

export type ConfigResponse = { operatorConfigured: boolean; missingEnvVars: string[] };

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/hedera/dvp/config");
  return res.json();
}

export async function fetchMarket(): Promise<MarketSnapshot | null> {
  const res = await fetch("/api/hedera/dvp/market");
  const data = await res.json();
  return data.market ?? null;
}

export async function setupMarket(): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/market", {});
  return market;
}

export async function proposeTrade(quantity: number, price: number, buyerChoice: BuyerChoice): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade", {
    quantity,
    price,
    buyerChoice,
  });
  return market;
}

export async function signTrade(): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/sign", {});
  return market;
}

export async function prepareWalletSellerPropose(
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/trade/wallet-seller", {
    stage: "prepare",
    quantity,
    price,
    buyerChoice,
  });
  return transaction;
}

export async function completeWalletSellerPropose(
  transactionId: string,
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/wallet-seller", {
    stage: "complete",
    transactionId,
    quantity,
    price,
    buyerChoice,
  });
  return market;
}

export async function prepareWalletBuyerSign(): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/trade/wallet-buyer", {
    stage: "prepare",
  });
  return transaction;
}

export async function completeWalletBuyerSign(): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/trade/wallet-buyer", {
    stage: "complete",
  });
  return market;
}

export async function prepareOnboardWallet(accountId: string): Promise<string> {
  const { transaction } = await postJson<{ transaction: string }>("/api/hedera/dvp/wallet/onboard", {
    stage: "prepare",
    accountId,
  });
  return transaction;
}

export async function completeOnboardWallet(role: WalletRole, accountId: string): Promise<MarketSnapshot> {
  const { market } = await postJson<{ market: MarketSnapshot }>("/api/hedera/dvp/wallet/onboard", {
    stage: "complete",
    role,
    accountId,
  });
  return market;
}
