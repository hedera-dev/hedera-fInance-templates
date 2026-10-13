"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import { HashScanLink } from "~~/app/_components/dvp/HashScanLink";
import { useHederaWallet } from "~~/hooks/scaffold-hbar/useHederaWallet";
import * as dvp from "~~/services/hedera/dvpClient";
import type { BuyerChoice, MarketSnapshot, WalletRole } from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type SigningMode = "demo" | "hashpack";

const OPERATOR_ENV_VARS = "HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY";
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

  const [busySetup, setBusySetup] = useState(false);
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

  const handleSetup = useCallback(async () => {
    setBusySetup(true);
    try {
      setMarket(await dvp.setupMarket());
      notification.success("Market set up.");
    } catch (e) {
      notification.error(errorMessage(e));
    } finally {
      setBusySetup(false);
    }
  }, []);

  const handlePropose = useCallback(async () => {
    setBusyPropose(true);
    try {
      const next = market?.walletSeller
        ? await dvp.completeWalletSellerPropose(
            await wallet.signAndExecute(await dvp.prepareWalletSellerPropose(quantity, price, buyerChoice)),
            quantity,
            price,
            buyerChoice,
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
            await wallet.signAndExecute(await dvp.prepareWalletBuyerSign());
            return dvp.completeWalletBuyerSign();
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
      await wallet.signAndExecute(await dvp.prepareOnboardWallet(wallet.accountId));
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
  const proposeDisabled =
    busyPropose ||
    !market ||
    trade?.status === "PENDING" ||
    (market?.walletSeller != null && !wallet.isConnected) ||
    walletBlocksAction;
  const buyerSignDisabled =
    busySign ||
    !trade ||
    trade.status !== "PENDING" ||
    (trade.buyerIsWallet && !wallet.isConnected) ||
    walletBlocksAction;
  const onboardDisabled = busyOnboard || !wallet.isConfigured || !wallet.isConnected || !market || onboardedForRole;

  const walletState = useMemo(() => {
    if (!wallet.isConfigured) return "Connect HashPack to continue (set NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID first).";
    if (!wallet.isConnected) return "Connect HashPack to continue.";
    if (!market) return "Set up the market, then onboard your wallet.";
    if (!onboardedForRole)
      return `Onboard your wallet to take the ${walletRole === "seller" ? "Seller" : "Buyer"} role.`;
    if (walletRole === "seller") {
      return trade && trade.status === "PENDING" ? "Waiting for the Buyer to sign." : "Propose a trade as Seller.";
    }
    if (!trade) return "Waiting for a trade to be proposed.";
    if (trade.status !== "PENDING") return "Trade settled. Propose another trade when ready.";
    return trade.buyerIsWallet ? "Sign the trade as Buyer." : "This trade's Buyer is a demo account.";
  }, [wallet.isConfigured, wallet.isConnected, market, onboardedForRole, walletRole, trade]);

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
        <label className="label" htmlFor="signing-mode">
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

            <div>
              <label className="label" htmlFor="wallet-role">
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

      <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
        <h2 className="font-bold text-lg mb-4">Setup</h2>
        {configLoaded && !operatorConfigured && (
          <p id="config-error" className="text-error text-sm mb-3">
            Set {OPERATOR_ENV_VARS} to configure the operator.
          </p>
        )}
        <button
          id="setup-market"
          className="btn btn-primary w-fit"
          disabled={!configLoaded || !operatorConfigured || busySetup}
          onClick={handleSetup}
        >
          {busySetup ? "Setting up…" : "Set up market"}
        </button>
      </section>

      {market && (
        <>
          <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full overflow-x-auto">
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
          </section>

          <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
            <h2 className="font-bold text-lg mb-4">Trade ticket</h2>
            <div className="flex flex-wrap gap-4 items-end mb-4">
              <div>
                <label className="label" htmlFor="trade-quantity">
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
              <div>
                <label className="label" htmlFor="trade-price">
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
              <div>
                <label className="label" htmlFor="trade-buyer">
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
                <p>
                  Schedule: <HashScanLink htmlId="schedule-id" hederaId={trade.scheduleId} kind="schedule" />
                </p>
                <p>
                  Status: <span id="trade-status">{trade.status}</span>
                </p>
                {trade.settlementResult && (
                  <p>
                    Settlement result: <span id="settlement-result">{trade.settlementResult}</span>
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Home;
