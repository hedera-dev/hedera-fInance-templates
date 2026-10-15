/** Client-side mirror of the JSON shape returned by /api/coupons/desk. Kept separate from the
 * server-only services/coupons modules so nothing server-only (viem wallet clients, the Hedera
 * SDK) ends up in the browser bundle. */

export type Investor = {
  id: "A" | "B" | "wallet";
  label: string;
  accountId: string;
  evmAddress: `0x${string}`;
  units: string;
  hbarBalance: string;
  stablecoinBalance: string;
  isAssociated: boolean;
};

export type CouponEntry = {
  couponNumber: number;
  consensusTime: string;
  outcome: "PAID" | "PRINCIPAL REPAID" | "MISSED";
  totalPaid: string;
  transactionHash: `0x${string}`;
};

export type BondStatus = "CREATED" | "RUNNING" | "MATURED" | "STOPPED";

export type Bond = {
  address: `0x${string}`;
  contractId: string | null;
  name: string;
  faceValue: string;
  couponRatePercent: string;
  periodMinutes: string;
  couponCount: number;
  currentCoupon: number;
  status: BondStatus;
  nextCouponDue: number | null;
  scheduleAddress: `0x${string}` | null;
  stablecoinNeeded: string;
  hbarNeededHbar: string;
  stablecoinHeld: string;
  hbarHeldHbar: string;
  holders: `0x${string}`[];
  coupons: CouponEntry[];
};

export type Desk = {
  config: { ok: boolean; missing?: string[]; error?: string };
  factory: { address: `0x${string}` } | null;
  stablecoin: { tokenId: string; evmAddress: `0x${string}` } | null;
  investors: Investor[];
  bond: Bond | null;
};

export type StepStatus = "pending" | "active" | "done" | "failed";
