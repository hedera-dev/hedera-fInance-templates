import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { issueBond } from "~~/services/coupons/actions";
import { getDeskState, setCurrentBond } from "~~/services/coupons/deskState";
import { getOperatorConfig } from "~~/services/coupons/operator";

export async function POST(req: Request) {
  const operator = getOperatorConfig();
  if (!operator.ok) {
    return NextResponse.json({ error: operator.error ?? "Operator is not configured." }, { status: 400 });
  }

  const state = getDeskState();
  if (!state.stablecoin) {
    return NextResponse.json({ error: "Set up the desk first." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const faceValue = Number(body.faceValue);
  const couponRatePercent = Number(body.couponRatePercent);
  const periodMinutes = Number(body.periodMinutes);
  const couponCount = Number(body.couponCount);

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!Number.isFinite(faceValue) || faceValue <= 0 || !Number.isInteger(faceValue)) {
    return NextResponse.json({ error: "Face value must be a positive whole number." }, { status: 400 });
  }
  if (!Number.isFinite(couponRatePercent) || couponRatePercent < 0.01 || couponRatePercent > 20) {
    return NextResponse.json({ error: "Coupon rate must be between 0.01 and 20." }, { status: 400 });
  }
  if (!Number.isInteger(periodMinutes) || periodMinutes < 1 || periodMinutes > 60) {
    return NextResponse.json({ error: "Period must be a whole number of minutes, 1-60." }, { status: 400 });
  }
  if (!Number.isInteger(couponCount) || couponCount < 1 || couponCount > 12) {
    return NextResponse.json({ error: "Coupon count must be a whole number, 1-12." }, { status: 400 });
  }

  try {
    const faceValueUnits = parseUnits(faceValue.toString(), 6);
    const couponRateBps = Math.round(couponRatePercent * 100);
    const bondAddress = await issueBond({
      name,
      stablecoin: state.stablecoin.evmAddress,
      faceValueUnits,
      couponRateBps,
      periodSeconds: periodMinutes * 60,
      couponCount,
    });
    setCurrentBond(bondAddress);
    return NextResponse.json({ bond: bondAddress });
  } catch (e: any) {
    console.error("[api/coupons/issue]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "Failed to issue the bond." }, { status: 500 });
  }
}
