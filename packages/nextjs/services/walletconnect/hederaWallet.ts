/**
 * Client-only HashPack connectivity via WalletConnect / Reown AppKit. The app never holds the
 * wallet's key: every signature is a `hedera_signAndExecuteTransaction` request relayed through
 * WalletConnect to HashPack. Only import this from client components.
 */
import { HederaAdapter, HederaChainDefinition, hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { type AppKit, createAppKit } from "@reown/appkit";

const HEDERA_TESTNET = HederaChainDefinition.Native.Testnet;

// `@reown/appkit`'s public types predate custom (non-eip155) namespaces, so its namespace
// parameters are typed as a fixed union that doesn't include "hedera". The adapter and provider
// both accept it at runtime; this alias documents the cast instead of sprinkling `as any`.
type Namespace = NonNullable<Parameters<AppKit["getAccount"]>[0]>;
const HEDERA_NS = hederaNamespace as unknown as Namespace;

type HederaRequestProvider = {
  hedera_signAndExecuteTransaction: (params: { signerAccountId: string; transaction: string[] }) => Promise<{
    transactionId?: string;
    nodeId?: string;
  }>;
};

let appKit: AppKit | null = null;
let appKitProjectId: string | null = null;

/** Lazily creates the AppKit instance. Returns null until a project id is configured. */
export function getHederaAppKit(projectId: string | undefined | null): AppKit | null {
  if (!projectId) return null;
  if (appKit && appKitProjectId === projectId) return appKit;

  const adapter = new HederaAdapter({
    projectId,
    networks: [HEDERA_TESTNET],
    namespace: hederaNamespace,
  });

  appKit = createAppKit({
    adapters: [adapter],
    networks: [HEDERA_TESTNET],
    defaultNetwork: HEDERA_TESTNET,
    projectId,
    metadata: {
      name: "Hedera DvP Desk",
      description: "Delivery-versus-payment settlement demo",
      url: typeof window !== "undefined" ? window.location.origin : "https://hedera.com",
      icons: [],
    },
    features: { analytics: false, email: false, socials: [] },
  });
  appKitProjectId = projectId;
  return appKit;
}

export type HederaWalletAccount = { accountId: string; isConnected: boolean };

/** Reads the currently connected Hedera account, if any. */
export function getConnectedAccount(kit: AppKit): HederaWalletAccount {
  const account = kit.getAccount(HEDERA_NS);
  const caipAddress = account?.caipAddress;
  const accountId = caipAddress ? (caipAddress.split(":").pop() ?? "") : "";
  return { accountId, isConnected: Boolean(account?.isConnected && accountId) };
}

/** Subscribes to connection changes; returns an unsubscribe function. */
export function subscribeToAccount(kit: AppKit, callback: (account: HederaWalletAccount) => void): () => void {
  return kit.subscribeAccount(() => callback(getConnectedAccount(kit)), HEDERA_NS);
}

export async function openHederaConnectModal(kit: AppKit): Promise<void> {
  await kit.open({ view: "Connect", namespace: HEDERA_NS });
}

export async function disconnectHederaWallet(kit: AppKit): Promise<void> {
  await kit.disconnect(HEDERA_NS);
}

/**
 * Asks HashPack (via WalletConnect) to sign and submit a frozen, unsigned transaction built by
 * the server. Returns the network transaction id so the server can look up what happened.
 */
export async function signAndExecuteWithWallet(
  kit: AppKit,
  accountId: string,
  transactionBase64: string,
): Promise<string> {
  const provider = kit.getProvider<HederaRequestProvider>(HEDERA_NS);
  if (!provider) throw new Error("HashPack is not connected.");

  const result = await provider.hedera_signAndExecuteTransaction({
    signerAccountId: `hedera:testnet:${accountId}`,
    transaction: [transactionBase64],
  });

  if (!result.transactionId) throw new Error("HashPack did not return a transaction id.");
  return result.transactionId;
}
