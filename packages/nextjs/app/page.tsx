"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import { HashScanLink } from "~~/app/_components/dvp/HashScanLink";
import { SetupPanel } from "~~/app/_components/dvp/SetupPanel";
import { TradeChanges } from "~~/app/_components/dvp/TradeChanges";
import { useHederaWallet } from "~~/hooks/scaffold-hbar/useHederaWallet";
import * as dvp from "~~/services/hedera/dvpClient";
import {
  BUYER_INITIAL_PAYMENT,
  type BuyerChoice,
  type MarketSnapshot,
  SELLER_INITIAL_SECURITY,
  type WalletRole,
} from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type SigningMode = "demo" | "hashpack";

const WALLET_CONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

const Home: NextPage = () => {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [operatorConfigured, setOperatorConfigured] = useState(false);

  const [signingMode, setSigningMode] = useState<SigningMode>("demo");
  const [walletRole, setWalletRole] = useState<WalletRole>("seller");

  const [quantity, setQuantity] = useState(100);
  const [price, setPrice] = useState(10000);
  const [buyerChoice, setBuyerChoice] = useState<BuyerChoice>("buyer");

  const [busyPropose, setBusyPropose] = useState(false);
  const [busySign, setBusySign] = useState(false);
  const [busyOnboard, setBusyOnboard] = useState(false);
  const [busyWallet, setBusyWallet] = useState(false);

  const wallet = useHederaWallet(WALLET_CONNECT_PROJECT_ID);
  const trade = market?.trade ?? null;

  useEffect(() => {
    dvp
      .fetchConfig()
      .then(cfg => setOperatorConfigured(cfg.operatorConfigured))
      .finally(() => setConfigLoaded(true));
    dvp
      .fetchMarket()
      .then(setMarket)
      .catch(() => undefined);
  }, []);

  const handlePropose = useCallback(async () => {
    setBusyPropose(true);
    try {
      const next = market?.walletSeller
        ? await dvp.completeWalletSellerPropose(
            await wallet.signAndExecute(await dvp.prepareWalletSellerPropose(quantity, price, buyerChoice)),
          )
        : await dvp.proposeTrade(quantity, price, buyerChoice);
      setMarket(next);
      notification.success("Trade proposed. Waiting for the Buyer to sign.");
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusyPropose(false);
    }
  }, [market?.walletSeller, quantity, price, buyerChoice, wallet]);

  const handleBuyerSign = useCallback(async () => {
    setBusySign(true);
    try {
      const next = trade?.buyerIsWallet
        ? await (async () => {
            return dvp.completeWalletBuyerSign(await wallet.signAndExecute(await dvp.prepareWalletBuyerSign()));
          })()
        : await dvp.signTrade();
      setMarket(next);
      if (next.trade?.status === "SETTLED") notification.success("Trade settled: both legs moved together.");
      else if (next.trade?.status === "REJECTED") {
        notification.warning(`Trade rejected: ${next.trade.settlementResult}`);
      }
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusySign(false);
    }
  }, [trade?.buyerIsWallet, wallet]);

  const handleOnboard = useCallback(async () => {
    setBusyOnboard(true);
    try {
      // No transaction when the wallet already associated both tokens in its other role.
      const association = await dvp.prepareOnboardWallet(walletRole, wallet.accountId);
      if (association) await wallet.signAndExecute(association);
      setMarket(await dvp.completeOnboardWallet(walletRole, wallet.accountId));
      notification.success("Wallet onboarded.");
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusyOnboard(false);
    }
  }, [wallet, walletRole]);

  const handleConnectToggle = useCallback(async () => {
    setBusyWallet(true);
    try {
      if (wallet.isConnected) await wallet.disconnect();
      else await wallet.connect();
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusyWallet(false);
    }
  }, [wallet]);

  const onboardedForRole =
    walletRole === "seller"
      ? market?.walletSeller?.accountId === wallet.accountId
      : market?.walletBuyer?.accountId === wallet.accountId;

  const walletBlocksAction = signingMode === "hashpack" && !wallet.isConnected;
  // Wallet transactions are built with the onboarded account as payer, so HashPack must be on that account.
  const sellerWalletMismatch = market?.walletSeller != null && wallet.accountId !== market.walletSeller.accountId;
  const buyerWalletMismatch = trade?.buyerIsWallet === true && wallet.accountId !== market?.walletBuyer?.accountId;
  const proposeDisabled =
    busyPropose || !market || trade?.status === "PENDING" || sellerWalletMismatch || walletBlocksAction;
  const buyerSignDisabled =
    busySign || !trade || trade.status !== "PENDING" || buyerWalletMismatch || walletBlocksAction;
  const onboardDisabled = busyOnboard || !wallet.isConfigured || !wallet.isConnected || !market || onboardedForRole;

  const walletState = useMemo(() => {
    if (!wallet.isConfigured) return "Connect HashPack to continue (set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID first).";
    if (!wallet.isConnected) return "Connect HashPack to continue.";
    if (!market) return "Set up the market, then onboard your wallet.";
    const onboarded = walletRole === "seller" ? market.walletSeller : market.walletBuyer;
    if (onboarded && onboarded.accountId !== wallet.accountId) {
      return `Switch HashPack to ${onboarded.accountId}, the account onboarded as ${walletRole === "seller" ? "Seller" : "Buyer"}, or onboard this one.`;
    }
    if (!onboardedForRole)
      return `Onboard your wallet to take the ${walletRole === "seller" ? "Seller" : "Buyer"} role.`;
    if (walletRole === "seller") {
      return trade && trade.status === "PENDING" ? "Waiting for the Buyer to sign." : "Propose a trade as Seller.";
    }
    if (!trade) return "Waiting for a trade to be proposed.";
    if (trade.status === "SETTLED") return "Trade settled. Propose another trade when ready.";
    if (trade.status === "REJECTED")
      return `Trade rejected (${trade.settlementResult}); nothing moved. Propose another trade when ready.`;
    return trade.buyerIsWallet ? "Sign the trade as Buyer." : "This trade's Buyer is a demo account.";
  }, [wallet.isConfigured, wallet.isConnected, wallet.accountId, market, onboardedForRole, walletRole, trade]);

  return (
    <div className="flex items-center flex-col grow px-5 py-10 gap-8 max-w-4xl mx-auto w-full">
      <section>
        <h1 className="text-3xl font-bold mb-2">DvP settlement desk</h1>
        <p className="text-base-content/80">
          Delivery-versus-payment (DvP) settles a security-for-stablecoin trade in a single Hedera transaction: a
          scheduled transfer carrying both legs. Either the security and the stablecoin both change hands, or neither
          does — there is no escrow contract, just a native transaction the Seller and the Buyer sign at different
          times.
        </p>
      </section>

      <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
        <h2 className="font-bold text-lg mb-4">Signing</h2>
        <label className="block text-sm text-base-content/70 mb-1" htmlFor="signing-mode">
          Sign with
        </label>
        <select
          id="signing-mode"
          className="select select-bordered w-full max-w-xs mb-4"
          value={signingMode}
          onChange={e => setSigningMode(e.target.value as SigningMode)}
        >
          <option value="demo">Demo accounts</option>
          <option value="hashpack">HashPack</option>
        </select>

        {signingMode === "hashpack" && (
          <div className="flex flex-col gap-3 items-start">
            {!wallet.isConfigured && (
              <p id="wallet-config-error" className="text-warning text-sm">
                Set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID to enable HashPack.
              </p>
            )}

            <button
              id="connect-hashpack"
              className="btn btn-primary btn-sm"
              disabled={!wallet.isConfigured || busyWallet}
              onClick={handleConnectToggle}
            >
              {busyWallet ? "Working…" : wallet.isConnected ? "Disconnect HashPack" : "Connect HashPack"}
            </button>

            {wallet.isConnected && (
              <p>
                Connected account:{" "}
                <HashScanLink htmlId="wallet-account-id" hederaId={wallet.accountId} kind="account" />
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm text-base-content/70" htmlFor="wallet-role">
                Wallet acts as
              </label>
              <select
                id="wallet-role"
                className="select select-bordered w-full max-w-xs"
                value={walletRole}
                onChange={e => setWalletRole(e.target.value as WalletRole)}
              >
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
              </select>
            </div>

            <button
              id="onboard-wallet"
              className="btn btn-secondary btn-sm"
              disabled={onboardDisabled}
              onClick={handleOnboard}
            >
              {busyOnboard ? "Onboarding…" : "Onboard wallet"}
            </button>

            <p id="wallet-state" className="text-sm text-base-content/70">
              {walletState}
            </p>
          </div>
        )}
      </section>

      <SetupPanel configLoaded={configLoaded} operatorConfigured={operatorConfigured} onMarket={setMarket} />

      {market && (
        <>
          <section
            id="market"
            className="card bg-base-100 shadow-md border border-base-300 p-6 w-full overflow-x-auto scroll-mt-24"
          >
            <h2 className="font-bold text-lg mb-4">Market</h2>
            <div className="flex flex-wrap gap-6 mb-4 text-sm">
              <span>
                Security token:{" "}
                <HashScanLink htmlId="security-token-id" hederaId={market.securityTokenId} kind="token" />
              </span>
              <span>
                Stablecoin: <HashScanLink htmlId="payment-token-id" hederaId={market.paymentTokenId} kind="token" />
              </span>
            </div>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Account</th>
                  <th>Security</th>
                  <th>Stablecoin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Seller</td>
                  <td>
                    <HashScanLink htmlId="seller-account-id" hederaId={market.seller.accountId} kind="account" />
                  </td>
                  <td id="balance-seller-security">{market.seller.balances.security}</td>
                  <td id="balance-seller-payment">{market.seller.balances.payment}</td>
                </tr>
                <tr>
                  <td>Buyer</td>
                  <td>
                    <HashScanLink htmlId="buyer-account-id" hederaId={market.buyer.accountId} kind="account" />
                  </td>
                  <td id="balance-buyer-security">{market.buyer.balances.security}</td>
                  <td id="balance-buyer-payment">{market.buyer.balances.payment}</td>
                </tr>
                <tr>
                  <td>Unverified buyer</td>
                  <td>
                    <HashScanLink
                      htmlId="unverified-buyer-account-id"
                      hederaId={market.unverifiedBuyer.accountId}
                      kind="account"
                    />
                  </td>
                  <td id="balance-unverified-buyer-security">{market.unverifiedBuyer.balances.security}</td>
                  <td id="balance-unverified-buyer-payment">{market.unverifiedBuyer.balances.payment}</td>
                </tr>
                {market.walletSeller && (
                  <tr>
                    <td>Wallet (Seller)</td>
                    <td>
                      <HashScanLink
                        htmlId="wallet-seller-account-id"
                        hederaId={market.walletSeller.accountId}
                        kind="account"
                      />
                    </td>
                    <td>{market.walletSeller.balances.security}</td>
                    <td>{market.walletSeller.balances.payment}</td>
                  </tr>
                )}
                {market.walletBuyer && (
                  <tr>
                    <td>Wallet (Buyer)</td>
                    <td>
                      <HashScanLink
                        htmlId="wallet-buyer-account-id"
                        hederaId={market.walletBuyer.accountId}
                        kind="account"
                      />
                    </td>
                    <td>{market.walletBuyer.balances.security}</td>
                    <td>{market.walletBuyer.balances.payment}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <span id="starting-position" className="text-xs text-base-content/60 mt-3">
              Setup gave the Seller {SELLER_INITIAL_SECURITY} security and each Buyer{" "}
              {BUYER_INITIAL_PAYMENT.toLocaleString()} stablecoin. A trade moves tokens between parties; it never
              creates any.
            </span>
          </section>

          <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
            <h2 className="font-bold text-lg mb-4">Trade ticket</h2>
            <div className="flex flex-wrap gap-4 items-end mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-base-content/70" htmlFor="trade-quantity">
                  Quantity (security)
                </label>
                <input
                  id="trade-quantity"
                  type="number"
                  min={1}
                  className="input input-bordered w-32"
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-base-content/70" htmlFor="trade-price">
                  Price (stablecoin)
                </label>
                <input
                  id="trade-price"
                  type="number"
                  min={1}
                  className="input input-bordered w-40"
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-base-content/70" htmlFor="trade-buyer">
                  Buyer
                </label>
                <select
                  id="trade-buyer"
                  className="select select-bordered"
                  value={buyerChoice}
                  onChange={e => setBuyerChoice(e.target.value as BuyerChoice)}
                >
                  <option value="buyer">Buyer</option>
                  <option value="unverifiedBuyer">Unverified Buyer</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              <button id="propose-trade" className="btn btn-primary" disabled={proposeDisabled} onClick={handlePropose}>
                {busyPropose ? "Proposing…" : "Propose trade (Seller signs)"}
              </button>
              <button
                id="buyer-sign"
                className="btn btn-secondary"
                disabled={buyerSignDisabled}
                onClick={handleBuyerSign}
              >
                {busySign ? "Signing…" : "Sign as Buyer"}
              </button>
            </div>

            {trade && (
              <div className="text-sm flex flex-col gap-1">
                <span>
                  Schedule: <HashScanLink htmlId="schedule-id" hederaId={trade.scheduleId} kind="schedule" />
                </span>
                <span>
                  Status: <span id="trade-status">{trade.status}</span>
                </span>
                {trade.settlementResult && (
                  <span>
                    Settlement result: <span id="settlement-result">{trade.settlementResult}</span>
                  </span>
                )}
                <TradeChanges trade={trade} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Home;
