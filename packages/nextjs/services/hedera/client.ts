import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";
import { getOperatorCredentials } from "~~/services/hedera/env";

/**
 * Builds a fresh testnet client bound to the operator account. Server-only:
 * the operator's private key never leaves this process.
 */
export function getOperatorClient(): Client {
  const credentials = getOperatorCredentials();
  if (!credentials) {
    throw new Error("Operator is not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.");
  }
  const operatorId = AccountId.fromString(credentials.operatorId);
  const operatorKey = PrivateKey.fromStringECDSA(credentials.operatorKey);
  return Client.forTestnet().setOperator(operatorId, operatorKey);
}
