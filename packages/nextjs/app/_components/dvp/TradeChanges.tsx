import type { TradeSnapshot } from "~~/services/hedera/types";

const signed = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString()}`;

/**
 * What a finished trade changed for each party. Settlement is atomic, so a settled trade moved
 * exactly its quantity and price and a rejected one moved nothing: no balance re-read is needed.
 */
export const TradeChanges = ({ trade }: { trade: TradeSnapshot }) => {
  if (trade.status === "PENDING") return null;

  if (trade.status === "REJECTED") {
    return (
      <span id="trade-changes" className="text-base-content/70">
        Nothing moved: the network rejected both legs together.
      </span>
    );
  }

  const seller = trade.sellerIsWallet ? "Seller (wallet)" : "Seller";
  const buyer = trade.buyerIsWallet
    ? "Buyer (wallet)"
    : trade.buyerChoice === "unverifiedBuyer"
      ? "Unverified buyer"
      : "Buyer";

  return (
    <span id="trade-changes" className="flex flex-col">
      <span>
        {seller}: <span className="text-error">{signed(-trade.quantity)} security</span>,{" "}
        <span className="text-success">{signed(trade.price)} stablecoin</span>
      </span>
      <span>
        {buyer}: <span className="text-success">{signed(trade.quantity)} security</span>,{" "}
        <span className="text-error">{signed(-trade.price)} stablecoin</span>
      </span>
    </span>
  );
};
