import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { fundBond } from "~~/services/coupons/actions";
import { getBondSnapshot } from "~~/services/coupons/bond";
import { currentBond, getDeskState } from "~~/services/coupons/deskState";

/** Sends the requested stablecoin (defaulting to what's still missing) and whatever HBAR the
 * bond still needs for its own schedules, in one action. */
export async function POST(req: Request) {
  const bondRecord = currentBond();
  const state = getDeskState();
  if (!bondRecord || !state.stablecoin) {
    return NextResponse.json({ error: "No bond issued yet." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const snapshot = await getBondSnapshot(bondRecord.address, state.stablecoin.tokenId);

  const neededStablecoin = Number(snapshot.stablecoinNeeded);
  const heldStablecoin = Number(snapshot.stablecoinHeld);
  const missingStablecoin = Math.max(0, neededStablecoin - heldStablecoin);
  const requestedStablecoin = body.stablecoinAmount !== undefined ? Number(body.stablecoinAmount) : missingStablecoin;

  const neededHbar = Number(snapshot.hbarNeededHbar);
  const heldHbar = Number(snapshot.hbarHeldHbar);
  const missingHbar = Math.max(0, neededHbar - heldHbar);

  if (!Number.isFinite(requestedStablecoin) || requestedStablecoin < 0) {
    return NextResponse.json({ error: "Invalid stablecoin amount." }, { status: 400 });
  }

  try {
    await fundBond({
      bond: bondRecord.address,
      stablecoin: state.stablecoin.evmAddress,
      stablecoinAmount: parseUnits(requestedStablecoin.toFixed(6), 6),
      hbarAmount: parseUnits(missingHbar.toFixed(18), 18),
    });
    return NextResponse.json({ ok: true, sentStablecoin: requestedStablecoin, sentHbar: missingHbar });
  } catch (e: any) {
    console.error("[api/coupons/fund]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "Failed to fund the bond." }, { status: 500 });
  }
}
