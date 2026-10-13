import { NextResponse } from "next/server";
import { errorResponse } from "~~/services/hedera/apiError";
import { getSnapshot, setupMarket } from "~~/services/hedera/dvp";

/** Current market snapshot, or `{ market: null }` before setup has run. */
export async function GET() {
  try {
    const market = await getSnapshot();
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Sets up a brand new market: tokens, demo accounts, KYC grants and opening balances. */
export async function POST() {
  try {
    const market = await setupMarket();
    return NextResponse.json({ market });
  } catch (e) {
    return errorResponse(e);
  }
}
