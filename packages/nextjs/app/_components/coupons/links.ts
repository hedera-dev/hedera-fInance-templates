const HASHSCAN_BASE = "https://hashscan.io/testnet";

export const hashscanAddressLink = (address: string) => `${HASHSCAN_BASE}/account/${address}`;
export const hashscanContractLink = (contractId: string) => `${HASHSCAN_BASE}/contract/${contractId}`;
export const hashscanTxLink = (txHash: string) => `${HASHSCAN_BASE}/transaction/${txHash}`;
