import { NextResponse } from "next/server";
import { callBond, getOperatorConfigError } from "~~/services/coupons/operator";
import { couponBondAbi } from "~~/utils/coupons/abi";

/** Issuer calls `stop()`: cancels the pending schedule and halts the bond. */
export async function POST(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const configError = getOperatorConfigError();
  if (configError) return NextResponse.json({ error: configError }, { status: 400 });

  const { address } = await params;
  try {
    const hash = await callBond(address as `0x${string}`, couponBondAbi, "stop");
    return NextResponse.json({ txHash: hash });
  } catch (e) {
    console.error("[api/hedera/coupons/bonds/[address]/stop]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to stop the bond" }, { status: 500 });
  }
}
