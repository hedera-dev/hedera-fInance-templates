/**
 * Desk state (stablecoin id, demo investors, current bond) lives in server memory, as allowed
 * by the spec. Kept on `globalThis` so it survives Next.js dev-server module reloads.
 */

export type DemoInvestor = {
  id: "A" | "B";
  label: "Investor A" | "Investor B";
  accountId: string;
  evmAddress: `0x${string}`;
  defaultUnits: number;
};

export type Stablecoin = {
  tokenId: string;
  evmAddress: `0x${string}`;
  decimals: number;
  symbol: string;
};

export type DeskState = {
  stablecoin?: Stablecoin;
  investors: DemoInvestor[];
  currentBond?: `0x${string}`;
  bonds: `0x${string}`[];
};

const KEY = "__couponDeskState__" as const;

export function getDeskState(): DeskState {
  const g = globalThis as unknown as Record<string, DeskState>;
  if (!g[KEY]) g[KEY] = { investors: [], bonds: [] };
  return g[KEY];
}

export function setStablecoin(stablecoin: Stablecoin) {
  getDeskState().stablecoin = stablecoin;
}

export function setInvestors(investors: DemoInvestor[]) {
  getDeskState().investors = investors;
}

export function setCurrentBond(address: `0x${string}`) {
  const state = getDeskState();
  state.currentBond = address;
  state.bonds.push(address);
}
