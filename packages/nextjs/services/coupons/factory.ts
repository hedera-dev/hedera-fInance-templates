import type { Address } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { couponBondFactoryAbi } from "~~/services/coupons/abi";

const HEDERA_TESTNET_CHAIN_ID = 296;

/**
 * The one factory the template ships with, deployed by `yarn coupons:deploy`. The address comes
 * from the generated deployedContracts.ts; the ABI is our own hand-written constant (identical
 * to what got generated) so call sites get full type inference instead of `any`.
 */
export function getFactory(): { address: Address; abi: typeof couponBondFactoryAbi } | null {
  const chain = (deployedContracts as any)[HEDERA_TESTNET_CHAIN_ID];
  const factory = chain?.CouponBondFactory;
  if (!factory) return null;
  return { address: factory.address as Address, abi: couponBondFactoryAbi };
}
