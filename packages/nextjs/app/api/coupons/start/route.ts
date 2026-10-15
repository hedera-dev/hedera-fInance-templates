import { NextResponse } from "next/server";
import { startBond } from "~~/services/coupons/actions";
import { currentBond } from "~~/services/coupons/deskState";

export async function POST() {
  const bond = currentBond();
  if (!bond) return NextResponse.json({ error: "No bond issued yet." }, { status: 400 });

  try {
    await startBond(bond.address);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/coupons/start]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "Failed to start coupons." }, { status: 500 });
  }
}
