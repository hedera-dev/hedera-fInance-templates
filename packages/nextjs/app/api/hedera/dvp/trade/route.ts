import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { proposeTradeDemo } from "~~/services/hedera/dvp";
import type { BuyerChoice, SettlementMode } from "~~/services/hedera/store";

type ProposeBody = {
  quantity: number;
  price: number;
  buyerChoice: BuyerChoice;
  settlementMode: SettlementMode;
  settlementDelayMinutes?: number;
  useWalletBuyer?: boolean;
};

function parseProposeBody(body: unknown): ProposeBody {
  const { quantity, price, buyerChoice, settlementMode, settlementDelayMinutes, useWalletBuyer } = (body ??
    {}) as Partial<ProposeBody>;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error("price must be a positive number");
  }
  if (buyerChoice !== "buyer" && buyerChoice !== "unverifiedBuyer") {
    throw new Error('buyerChoice must be "buyer" or "unverifiedBuyer"');
  }
  if (settlementMode !== "onSignature" && settlementMode !== "atTime") {
    throw new Error('settlementMode must be "onSignature" or "atTime"');
  }
  if (settlementMode === "atTime" && typeof settlementDelayMinutes !== "number") {
    throw new Error("settlementDelayMinutes is required when settlementMode is atTime");
  }
  if (useWalletBuyer != null && typeof useWalletBuyer !== "boolean") {
    throw new Error("useWalletBuyer must be a boolean");
  }
  return { quantity, price, buyerChoice, settlementMode, settlementDelayMinutes, useWalletBuyer };
}

/** Seller (demo account) proposes and signs the two-leg scheduled transfer. */
export async function POST(req: Request) {
  try {
    const { quantity, price, buyerChoice, settlementMode, settlementDelayMinutes, useWalletBuyer } = parseProposeBody(
      await req.json(),
    );
    const market = await proposeTradeDemo(
      quantity,
      price,
      buyerChoice,
      settlementMode,
      settlementDelayMinutes,
      useWalletBuyer === true,
    );
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
