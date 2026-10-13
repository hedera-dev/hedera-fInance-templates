import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { signTradeDemo } from "~~/services/hedera/dvp";

/** Buyer (demo account) signs the pending schedule, which executes both legs together. */
export async function POST() {
  try {
    const market = await signTradeDemo();
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
