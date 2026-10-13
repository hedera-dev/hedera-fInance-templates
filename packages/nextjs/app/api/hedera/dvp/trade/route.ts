import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { proposeTradeDemo } from "~~/services/hedera/dvp";
import type { BuyerChoice } from "~~/services/hedera/store";

type ProposeBody = { quantity: number; price: number; buyerChoice: BuyerChoice };

function parseProposeBody(body: unknown): ProposeBody {
  const { quantity, price, buyerChoice } = (body ?? {}) as Partial<ProposeBody>;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error("price must be a positive number");
  }
  if (buyerChoice !== "buyer" && buyerChoice !== "unverifiedBuyer") {
    throw new Error('buyerChoice must be "buyer" or "unverifiedBuyer"');
  }
  return { quantity, price, buyerChoice };
}

/** Seller (demo account) proposes and signs the two-leg scheduled transfer. */
export async function POST(req: Request) {
  try {
    const { quantity, price, buyerChoice } = parseProposeBody(await req.json());
    const market = await proposeTradeDemo(quantity, price, buyerChoice);
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
