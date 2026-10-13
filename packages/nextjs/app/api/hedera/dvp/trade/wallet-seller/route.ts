import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { completeWalletSellerPropose, prepareWalletSellerPropose } from "~~/services/hedera/dvp";
import type { BuyerChoice } from "~~/services/hedera/store";

type Body =
  | { stage: "prepare"; quantity: number; price: number; buyerChoice: BuyerChoice }
  | { stage: "complete"; transactionId: string; quantity: number; price: number; buyerChoice: BuyerChoice };

/**
 * Seller is a connected wallet: `prepare` returns the unsigned schedule-create transaction for
 * HashPack to sign and submit; `complete` records the schedule HashPack just created.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (body.stage === "prepare") {
      const transaction = await prepareWalletSellerPropose(body.quantity, body.price, body.buyerChoice);
      return NextResponse.json({ transaction });
    }
    if (body.stage === "complete") {
      const market = await completeWalletSellerPropose(body.transactionId, body.quantity, body.price, body.buyerChoice);
      return NextResponse.json({ market });
    }
    throw new Error('stage must be "prepare" or "complete"');
  } catch (e) {
    return errorResponse(e);
  }
}
