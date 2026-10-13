import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { completeWalletBuyerSign, prepareWalletBuyerSign } from "~~/services/hedera/dvp";

type Body = { stage: "prepare" | "complete" };

/**
 * Buyer is a connected wallet: `prepare` returns the unsigned schedule-sign transaction for
 * HashPack to sign and submit; `complete` reads back the settlement result.
 */
export async function POST(req: Request) {
  try {
    const { stage } = (await req.json()) as Body;
    if (stage === "prepare") {
      const transaction = await prepareWalletBuyerSign();
      return NextResponse.json({ transaction });
    }
    if (stage === "complete") {
      const market = await completeWalletBuyerSign();
      return NextResponse.json({ market });
    }
    throw new Error('stage must be "prepare" or "complete"');
  } catch (e) {
    return errorResponse(e);
  }
}
