import { NextResponse } from "next/server";
import type { Address } from "viem";
import { allocate } from "~~/services/coupons/actions";
import { currentBond } from "~~/services/coupons/deskState";

export async function POST(req: Request) {
  const bond = currentBond();
  if (!bond) return NextResponse.json({ error: "No bond issued yet." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const investorAddress = body.investorAddress as Address;
  const units = Number(body.units);

  if (!investorAddress) return NextResponse.json({ error: "investorAddress is required." }, { status: 400 });
  if (!Number.isInteger(units) || units <= 0) {
    return NextResponse.json({ error: "units must be a positive whole number." }, { status: 400 });
  }

  try {
    await allocate(bond.address, investorAddress, BigInt(units));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/coupons/allocate]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "Failed to allocate." }, { status: 500 });
  }
}
