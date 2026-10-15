import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { getOperatorConfig } from "~~/services/coupons/operator";

const RPC_URL = process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api";

export const publicClient = createPublicClient({
  chain: hederaTestnet,
  transport: http(RPC_URL),
});

/** A fresh wallet client signing with the operator key; issuer (and `#pay-now`) calls go through this. */
export function getOperatorWalletClient() {
  const result = getOperatorConfig();
  if (!result.ok) throw new Error("Operator is not configured.");
  const account = privateKeyToAccount(result.config.privateKeyHex);
  return createWalletClient({ account, chain: hederaTestnet, transport: http(RPC_URL) });
}
