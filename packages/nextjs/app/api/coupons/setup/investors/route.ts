import { NextResponse } from "next/server";
import { getOperatorConfig } from "~~/services/coupons/operator";
import { ensureDemoInvestors } from "~~/services/coupons/setup";

export async function POST() {
  const operator = getOperatorConfig();
  if (!operator.ok) {
    return NextResponse.json({ error: operator.error ?? `Missing ${operator.missing.join(", ")}` }, { status: 400 });
  }
  try {
    const investors = await ensureDemoInvestors();
    return NextResponse.json({ investors });
  } catch (e: any) {
    console.error("[api/coupons/setup/investors]", e);
    return NextResponse.json({ error: e?.message ?? "Failed to create the demo investors." }, { status: 500 });
  }
}
