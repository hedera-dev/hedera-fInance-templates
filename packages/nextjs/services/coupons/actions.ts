import { type Address, type Hash, parseEventLogs } from "viem";
import { couponBondAbi, erc20Abi } from "~~/services/coupons/abi";
import { getFactory } from "~~/services/coupons/factory";
import { getOperatorWalletClient, publicClient } from "~~/services/coupons/viemClients";

/**
 * All issuer actions (and `#pay-now`, open to anyone but simplest to route through the same
 * server-signed path) go through here: sign with the operator key, send, wait for the receipt.
 * Never returns or logs the key itself.
 */
async function sendAndWait(request: { address: Address; abi: any; functionName: string; args: any[] }) {
  const wallet = getOperatorWalletClient();
  const hash: Hash = await wallet.writeContract(request as any);
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function issueBond(params: {
  name: string;
  stablecoin: Address;
  faceValueUnits: bigint; // smallest stablecoin units
  couponRateBps: number;
  periodSeconds: number;
  couponCount: number;
}): Promise<Address> {
  const factory = getFactory();
  if (!factory) throw new Error("CouponBondFactory is not deployed. Run `yarn coupons:deploy`.");

  const receipt = await sendAndWait({
    address: factory.address,
    abi: factory.abi,
    functionName: "createBond",
    args: [
      params.name,
      params.stablecoin,
      params.faceValueUnits,
      params.couponRateBps,
      params.periodSeconds,
      params.couponCount,
    ],
  });

  const [event] = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "BondCreated" });
  if (!event) throw new Error("Bond creation did not emit BondCreated.");
  return (event.args as { issuer: Address; bond: Address }).bond;
}

export async function allocate(bond: Address, holder: Address, units: bigint) {
  await sendAndWait({ address: bond, abi: couponBondAbi, functionName: "allocate", args: [holder, units] });
}

export async function startBond(bond: Address) {
  await sendAndWait({ address: bond, abi: couponBondAbi, functionName: "start", args: [] });
}

export async function stopBond(bond: Address) {
  await sendAndWait({ address: bond, abi: couponBondAbi, functionName: "stop", args: [] });
}

export async function payNow(bond: Address) {
  await sendAndWait({ address: bond, abi: couponBondAbi, functionName: "payCoupon", args: [] });
}

export async function fundBond(params: {
  bond: Address;
  stablecoin: Address;
  stablecoinAmount: bigint;
  hbarAmount: bigint;
}) {
  if (params.stablecoinAmount > 0n) {
    await sendAndWait({
      address: params.stablecoin,
      abi: erc20Abi,
      functionName: "transfer",
      args: [params.bond, params.stablecoinAmount],
    });
  }
  if (params.hbarAmount > 0n) {
    const wallet = getOperatorWalletClient();
    const hash = await wallet.sendTransaction({ to: params.bond, value: params.hbarAmount });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}
