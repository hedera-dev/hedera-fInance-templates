import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { couponBondAbi } from "~~/services/coupons/abi";
import { getBondSnapshot } from "~~/services/coupons/bond";
import { currentBond, getDeskState } from "~~/services/coupons/deskState";
import { getFactory } from "~~/services/coupons/factory";
import { getHbarBalanceTinybars, getTokenBalance, isTokenAssociated } from "~~/services/coupons/mirrorNode";
import { getOperatorConfig } from "~~/services/coupons/operator";
import { publicClient } from "~~/services/coupons/viemClients";

/** Full desk snapshot: everything the page polls every few seconds lives in this one response. */
export async function GET() {
  const operator = getOperatorConfig();
  const factory = getFactory();
  const state = getDeskState();
  const bondRecord = currentBond();

  const investors = await Promise.all(
    state.investors.map(async investor => {
      const [hbarTinybars, stablecoinRaw, units, isAssociated] = await Promise.all([
        getHbarBalanceTinybars(investor.accountId),
        state.stablecoin ? getTokenBalance(investor.accountId, state.stablecoin.tokenId) : Promise.resolve(0n),
        bondRecord
          ? (publicClient.readContract({
              address: bondRecord.address,
              abi: couponBondAbi,
              functionName: "unitsOf",
              args: [investor.evmAddress],
            }) as Promise<bigint>)
          : Promise.resolve(0n),
        state.stablecoin ? isTokenAssociated(investor.accountId, state.stablecoin.tokenId) : Promise.resolve(false),
      ]);
      return {
        id: investor.id,
        label: investor.label,
        accountId: investor.accountId,
        evmAddress: investor.evmAddress,
        units: units.toString(),
        hbarBalance: formatUnits(hbarTinybars * 10n ** 10n, 18),
        stablecoinBalance: formatUnits(stablecoinRaw, 6),
        isAssociated,
      };
    }),
  );

  const bond = bondRecord ? await getBondSnapshot(bondRecord.address, state.stablecoin?.tokenId ?? null) : null;

  return NextResponse.json({
    config: operator.ok ? { ok: true } : { ok: false, missing: operator.missing, error: operator.error },
    factory: factory ? { address: factory.address } : null,
    stablecoin: state.stablecoin,
    investors,
    bond,
  });
}
