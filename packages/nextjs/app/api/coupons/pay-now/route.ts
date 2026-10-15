import { NextResponse } from "next/server";
import { payNow } from "~~/services/coupons/actions";
import { currentBond } from "~~/services/coupons/deskState";

/** `payCoupon()` is open to anyone; this just signs the trigger server-side for convenience. */
export async function POST() {
  const bond = currentBond();
  if (!bond) return NextResponse.json({ error: "No bond issued yet." }, { status: 400 });

  try {
    await payNow(bond.address);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/coupons/pay-now]", e);
    return NextResponse.json(
      { error: e?.shortMessage ?? e?.message ?? "Failed to pay the due coupon." },
      { status: 500 },
    );
  }
}
