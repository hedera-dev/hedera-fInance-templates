"use client";

import { hederaTestnet } from "viem/chains";
import { useBalance, useReadContracts } from "wagmi";
import { BOND_STATUS, couponBondAbi } from "~~/utils/coupons/abi";

export type BondData = {
  name: string;
  status: (typeof BOND_STATUS)[number];
  statusIndex: number;
  faceValue: bigint;
  couponRateBps: bigint;
  periodSeconds: bigint;
  couponCount: bigint;
  currentCoupon: bigint;
  dueTime: bigint;
  currentSchedule: `0x${string}`;
  holdersCount: number;
  stablecoinNeeded: bigint;
  stablecoinAddress: `0x${string}`;
  hbarBalance: bigint;
};

const fields = [
  "name",
  "status",
  "faceValue",
  "couponRateBps",
  "periodSeconds",
  "couponCount",
  "currentCoupon",
  "dueTime",
  "currentSchedule",
  "holdersCount",
  "stablecoinNeeded",
  "stablecoin",
] as const;

/** Reads a bond's full terms and live state, polling every few seconds. */
export function useBond(address?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: fields.map(functionName => ({ address, abi: couponBondAbi, functionName }) as const),
    allowFailure: false,
    query: { enabled: Boolean(address), refetchInterval: 4000 },
  });

  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    chainId: hederaTestnet.id,
    query: { enabled: Boolean(address), refetchInterval: 4000 },
  });

  const refetchAll = () => {
    refetch();
    refetchBalance();
  };

  if (!address || !data) {
    return { isLoading, data: undefined as BondData | undefined, refetch: refetchAll };
  }

  const [
    name,
    status,
    faceValue,
    couponRateBps,
    periodSeconds,
    couponCount,
    currentCoupon,
    dueTime,
    currentSchedule,
    holdersCount,
    stablecoinNeeded,
    stablecoinAddress,
  ] = data as unknown as [
    string,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
    bigint,
    bigint,
    `0x${string}`,
  ];

  const bondData: BondData = {
    name,
    status: BOND_STATUS[status],
    statusIndex: status,
    faceValue,
    couponRateBps,
    periodSeconds,
    couponCount,
    currentCoupon,
    dueTime,
    currentSchedule,
    holdersCount: Number(holdersCount),
    stablecoinNeeded,
    stablecoinAddress,
    hbarBalance: balance?.value ?? 0n,
  };

  return { isLoading, data: bondData, refetch: refetchAll };
}
