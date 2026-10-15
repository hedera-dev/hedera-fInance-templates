import type { Address } from "viem";

export type InvestorId = "A" | "B" | "wallet";

export type Investor = {
  id: InvestorId;
  label: string;
  accountId: string;
  evmAddress: Address;
};

export type BondRecord = {
  address: Address;
};

type DeskState = {
  stablecoin: { tokenId: string; evmAddress: Address } | null;
  investors: Investor[];
  bonds: BondRecord[];
};

/**
 * Desk state lives in server memory, as the spec allows: the stablecoin id, the demo
 * investors, and which bond is current. Nothing dynamic (balances, bond status, coupon
 * history) is cached here — those always come from the mirror node / RPC on each request.
 * Private keys are never stored: demo investors sign nothing, so none is kept past creation.
 *
 * Anchored on `globalThis` rather than a plain module-level variable: Next.js compiles each
 * `app/api/.../route.ts` into its own bundle, so a plain top-level `const` here would end up
 * as a separate instance per route (and per dev-server hot reload) instead of one shared store.
 */
declare global {
  var __couponDeskState: DeskState | undefined;
}

function initialState(): DeskState {
  return { stablecoin: null, investors: [], bonds: [] };
}

const state: DeskState = (globalThis.__couponDeskState ??= initialState());

export function getDeskState(): DeskState {
  return state;
}

export function setStablecoin(tokenId: string, evmAddress: Address) {
  state.stablecoin = { tokenId, evmAddress };
}

export function addInvestor(investor: Investor) {
  if (state.investors.some(i => i.id === investor.id)) return;
  state.investors.push(investor);
}

export function upsertWalletInvestor(investor: Investor) {
  const existingIndex = state.investors.findIndex(i => i.id === "wallet");
  if (existingIndex >= 0) {
    state.investors[existingIndex] = investor;
  } else {
    state.investors.push(investor);
  }
}

export function setCurrentBond(address: Address) {
  state.bonds.push({ address });
}

export function currentBond(): BondRecord | null {
  return state.bonds.length > 0 ? state.bonds[state.bonds.length - 1] : null;
}
