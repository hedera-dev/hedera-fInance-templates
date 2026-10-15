import { type Address, decodeEventLog, formatUnits } from "viem";
import { BOND_STATUS, couponBondAbi } from "~~/services/coupons/abi";
import {
  getContractIdFromEvm,
  getContractLogs,
  getHbarBalanceTinybars,
  getTokenBalance,
} from "~~/services/coupons/mirrorNode";
import { publicClient } from "~~/services/coupons/viemClients";

const STABLECOIN_DECIMALS = 6;
/** Hedera's JSON-RPC relay represents native balances with 18 decimals; the mirror node's are
 * tinybars (8 decimals). 1 HBAR = 10^8 tinybars = 10^18 of the relay's units. */
const TINYBAR_TO_RELAY_WEI = 10n ** 10n;

export type CouponEntry = {
  couponNumber: number;
  consensusTime: string; // ISO
  outcome: "PAID" | "PRINCIPAL REPAID" | "MISSED";
  totalPaid: string; // human stablecoin units, "0" for a miss
  transactionHash: `0x${string}`;
};

export type BondSnapshot = {
  address: Address;
  contractId: string | null;
  name: string;
  faceValue: string; // human stablecoin units
  couponRatePercent: string;
  periodMinutes: string;
  couponCount: number;
  currentCoupon: number;
  status: (typeof BOND_STATUS)[number];
  nextCouponDue: number | null; // unix seconds, only meaningful while RUNNING
  scheduleAddress: Address | null;
  stablecoinNeeded: string; // human units, remaining to maturity
  hbarNeededHbar: string; // human HBAR, remaining to maturity
  stablecoinHeld: string; // human units
  hbarHeldHbar: string; // human HBAR
  holders: Address[];
  coupons: CouponEntry[];
};

async function readBondTerms(address: Address) {
  const read = <T>(functionName: string) =>
    publicClient.readContract({ address, abi: couponBondAbi, functionName: functionName as any }) as Promise<T>;

  const [
    name,
    faceValue,
    couponRateBps,
    periodSeconds,
    couponCount,
    currentCoupon,
    nextCouponDue,
    currentSchedule,
    status,
    stablecoinNeeded,
    hbarNeeded,
    holders,
  ] = await Promise.all([
    read<string>("bondName"),
    read<bigint>("faceValue"),
    read<number>("couponRateBps"),
    read<number>("periodSeconds"),
    read<number>("couponCount"),
    read<number>("currentCoupon"),
    read<bigint>("nextCouponDue"),
    read<Address>("currentSchedule"),
    read<number>("status"),
    read<bigint>("stablecoinNeeded"),
    read<bigint>("hbarNeeded"),
    read<Address[]>("getHolders"),
  ]);

  return {
    name,
    faceValue,
    couponRateBps,
    periodSeconds,
    couponCount,
    currentCoupon,
    nextCouponDue,
    currentSchedule,
    status,
    stablecoinNeeded,
    hbarNeeded,
    holders,
  };
}

function decodeCoupons(logs: Awaited<ReturnType<typeof getContractLogs>>): CouponEntry[] {
  const entries: CouponEntry[] = [];
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: couponBondAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "CouponPaid") {
        const args = decoded.args as { couponNumber: number; totalPaid: bigint; principalRepaid: boolean };
        entries.push({
          couponNumber: Number(args.couponNumber),
          consensusTime: isoFromConsensus(log.timestamp),
          outcome: args.principalRepaid ? "PRINCIPAL REPAID" : "PAID",
          totalPaid: formatUnits(args.totalPaid, STABLECOIN_DECIMALS),
          transactionHash: log.transactionHash,
        });
      } else if (decoded.eventName === "CouponMissed") {
        const args = decoded.args as { couponNumber: number };
        entries.push({
          couponNumber: Number(args.couponNumber),
          consensusTime: isoFromConsensus(log.timestamp),
          outcome: "MISSED",
          totalPaid: "0",
          transactionHash: log.transactionHash,
        });
      }
    } catch {
      // Not one of our decoded events (or malformed); skip it.
    }
  }
  return entries;
}

function isoFromConsensus(timestamp: string): string {
  const [seconds] = timestamp.split(".");
  return new Date(Number(seconds) * 1000).toISOString();
}

export async function getBondSnapshot(address: Address, stablecoinTokenId: string | null): Promise<BondSnapshot> {
  const [terms, contractId, logs, stablecoinHeldRaw, hbarHeldTinybars] = await Promise.all([
    readBondTerms(address),
    getContractIdFromEvm(address),
    getContractLogs(address),
    stablecoinTokenId ? getTokenBalance(address, stablecoinTokenId) : Promise.resolve(0n),
    getHbarBalanceTinybars(address),
  ]);

  const status = BOND_STATUS[terms.status] ?? "CREATED";
  const hbarHeldWei = hbarHeldTinybars * TINYBAR_TO_RELAY_WEI;

  return {
    address,
    contractId,
    name: terms.name,
    faceValue: formatUnits(terms.faceValue, STABLECOIN_DECIMALS),
    couponRatePercent: (terms.couponRateBps / 100).toString(),
    periodMinutes: (terms.periodSeconds / 60).toString(),
    couponCount: terms.couponCount,
    currentCoupon: terms.currentCoupon,
    status,
    nextCouponDue: status === "RUNNING" ? Number(terms.nextCouponDue) : null,
    scheduleAddress:
      status === "RUNNING" && terms.currentSchedule !== "0x0000000000000000000000000000000000000000"
        ? terms.currentSchedule
        : null,
    stablecoinNeeded: formatUnits(terms.stablecoinNeeded, STABLECOIN_DECIMALS),
    hbarNeededHbar: formatUnits(terms.hbarNeeded, 18),
    stablecoinHeld: formatUnits(stablecoinHeldRaw, STABLECOIN_DECIMALS),
    hbarHeldHbar: formatUnits(hbarHeldWei, 18),
    holders: terms.holders,
    coupons: decodeCoupons(logs),
  };
}
