/**
 * Shapes shared between the DvP server logic and the client page. Pure types only —
 * safe to import from a client component, unlike `~~/services/hedera/dvp` or `store`.
 */

export type BuyerChoice = "buyer" | "unverifiedBuyer";
export type WalletRole = "seller" | "buyer";
export type TradeStatus = "PENDING" | "SETTLED" | "REJECTED";

export type PartyBalances = { security: string; payment: string };
export type PartySnapshot = { accountId: string; balances: PartyBalances };

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
