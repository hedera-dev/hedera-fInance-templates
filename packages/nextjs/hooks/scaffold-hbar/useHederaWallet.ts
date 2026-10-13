"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type HederaWalletAccount,
  disconnectHederaWallet,
  getConnectedAccount,
  getHederaAppKit,
  openHederaConnectModal,
  signAndExecuteWithWallet,
  subscribeToAccount,
} from "~~/services/walletconnect/hederaWallet";

const NOT_CONNECTED: HederaWalletAccount = { accountId: "", isConnected: false };

/**
 * Connects the page to HashPack over WalletConnect. `projectId` comes from
 * `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`; when it is empty the hook reports
 * `isConfigured: false` and every action is a no-op.
 */
export function useHederaWallet(projectId: string) {
  const [account, setAccount] = useState<HederaWalletAccount>(NOT_CONNECTED);
  const isConfigured = projectId.length > 0;

  useEffect(() => {
    if (!isConfigured) return;
    const kit = getHederaAppKit(projectId);
    if (!kit) return;
    setAccount(getConnectedAccount(kit));
    return subscribeToAccount(kit, setAccount);
  }, [projectId, isConfigured]);

  const connect = useCallback(async () => {
    const kit = getHederaAppKit(projectId);
    if (!kit) return;
    await openHederaConnectModal(kit);
  }, [projectId]);

  const disconnect = useCallback(async () => {
    const kit = getHederaAppKit(projectId);
    if (!kit) return;
    await disconnectHederaWallet(kit);
    setAccount(NOT_CONNECTED);
  }, [projectId]);

  const signAndExecute = useCallback(
    async (transactionBase64: string) => {
      const kit = getHederaAppKit(projectId);
      if (!kit || !account.accountId) throw new Error("HashPack is not connected.");
      return signAndExecuteWithWallet(kit, account.accountId, transactionBase64);
    },
    [projectId, account.accountId],
  );

  return { ...account, isConfigured, connect, disconnect, signAndExecute };
}
