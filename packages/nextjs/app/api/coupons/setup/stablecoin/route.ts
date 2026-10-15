import { NextResponse } from "next/server";
import { getOperatorConfig } from "~~/services/coupons/operator";
import { ensureStablecoin } from "~~/services/coupons/setup";

export async function POST() {
  const operator = getOperatorConfig();
  if (!operator.ok) {
    return NextResponse.json({ error: operator.error ?? `Missing ${operator.missing.join(", ")}` }, { status: 400 });
  }
  try {
    const stablecoin = await ensureStablecoin();
    return NextResponse.json({ stablecoin });
  } catch (e: any) {
    console.error("[api/coupons/setup/stablecoin]", e);
    return NextResponse.json({ error: e?.message ?? "Failed to create the stablecoin." }, { status: 500 });
  }
}
