import { NextResponse } from "next/server";
import type { Address } from "viem";
import { upsertWalletInvestor } from "~~/services/coupons/deskState";
import { getAccountIdFromEvm } from "~~/services/coupons/mirrorNode";

/** Adds the connected wallet as `Your wallet`. Resolved from the mirror node; no signing needed. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const address = body.address as Address;
  if (!address) return NextResponse.json({ error: "address is required." }, { status: 400 });

  const accountId = await getAccountIdFromEvm(address);
  if (!accountId) {
    return NextResponse.json({ error: "This wallet has no Hedera account on testnet yet." }, { status: 404 });
  }

  const investor = { id: "wallet" as const, label: "Your wallet", accountId, evmAddress: address };
  upsertWalletInvestor(investor);
  return NextResponse.json({ investor });
}
