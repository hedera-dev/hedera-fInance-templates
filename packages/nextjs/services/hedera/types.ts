/**
 * Shapes shared between the DvP server logic and the client page. Pure types only —
 * safe to import from a client component, unlike `~~/services/hedera/dvp` or `store`.
 */

export type BuyerChoice = "buyer" | "unverifiedBuyer";
export type WalletRole = "seller" | "buyer";
export type TradeStatus = "PENDING" | "SETTLED" | "REJECTED";

export type PartyBalances = { security: string; payment: string };
export type PartySnapshot = { accountId: string; balances: PartyBalances };

/** What setup hands out: shared by the server (which funds) and the page (which explains it). */
export const SELLER_INITIAL_SECURITY = 200;
export const BUYER_INITIAL_PAYMENT = 10000;

export type TradeSnapshot = {
  scheduleId: string;
  status: TradeStatus;
  settlementResult: string | null;
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  sellerIsWallet: boolean;
  buyerIsWallet: boolean;
};

export type MarketSnapshot = {
  securityTokenId: string;
  paymentTokenId: string;
  seller: PartySnapshot;
  buyer: PartySnapshot;
  unverifiedBuyer: PartySnapshot;
  walletSeller: PartySnapshot | null;
  walletBuyer: PartySnapshot | null;
  trade: TradeSnapshot | null;
};
