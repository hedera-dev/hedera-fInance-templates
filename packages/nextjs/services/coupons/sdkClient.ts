import { Client } from "@hiero-ledger/sdk";
import { getOperatorConfig } from "~~/services/coupons/operator";

let client: Client | null = null;

/** Shared Hedera SDK client, used only to create the stablecoin and the demo investor accounts. */
export function getSdkClient(): Client {
  if (client) return client;
  const result = getOperatorConfig();
  if (!result.ok) throw new Error("Operator is not configured.");
  client = Client.forTestnet().setOperator(result.config.accountId, result.config.sdkPrivateKey);
  return client;
}
