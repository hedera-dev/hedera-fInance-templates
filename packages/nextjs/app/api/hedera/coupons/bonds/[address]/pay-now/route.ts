import { NextResponse } from "next/server";
import { callBond, getOperatorConfigError } from "~~/services/coupons/operator";
import { couponBondAbi } from "~~/utils/coupons/abi";

/**
 * `payCoupon()` may be called by anyone once a coupon is due; this is the server-signed path
 * for the `#pay-now` fallback button (no wallet is required to press it).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const { address } = await params;
  try {
    const hash = await callBond(address as `0x${string}`, couponBondAbi, "payCoupon");
    return NextResponse.json({ txHash: hash });
  } catch (e) {
    console.error("[api/hedera/coupons/bonds/[address]/pay-now]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to pay the coupon" }, { status: 500 });
  }
}
