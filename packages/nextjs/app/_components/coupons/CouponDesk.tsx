"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hederaTestnet } from "viem/chains";
import { useAccount, useWriteContract } from "wagmi";
import { hashscanAddressLink, hashscanContractLink, hashscanTxLink } from "~~/app/_components/coupons/links";
import type { Bond, Desk, Investor, StepStatus } from "~~/app/_components/coupons/types";

const POLL_MS = 4000;

const hrc719AssociateAbi = [
  { type: "function", name: "associate", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

async function postJson<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request to ${url} failed.`);
  return data;
}

function StepRow({ id, status, label, detail }: { id: string; status: StepStatus; label: string; detail?: string }) {
  return (
    <div id={id} data-status={status} className="flex items-center gap-2 text-sm py-1">
      {status === "active" && <span className="loading loading-spinner loading-xs" aria-hidden />}
      {status === "done" && <span className="text-success">✓</span>}
      {status === "failed" && <span className="text-error">✕</span>}
      {status === "pending" && <span className="opacity-40">○</span>}
      <span>{label}</span>
      {detail && <span className="opacity-70 text-xs">— {detail}</span>}
    </div>
  );
}

function statusBadgeClass(status: Bond["status"]) {
  switch (status) {
    case "RUNNING":
      return "badge-success";
    case "MATURED":
      return "badge-neutral";
    case "STOPPED":
      return "badge-error";
    default:
      return "badge-warning";
  }
}

export function CouponDesk() {
  const { address: walletAddress, isConnected, chainId: connectedChainId } = useAccount();
  const { writeContractAsync: writeAssociate } = useWriteContract();

  const [desk, setDesk] = useState<Desk | null>(null);
  const [deskLoadError, setDeskLoadError] = useState<string | null>(null);

  const fetchDesk = useCallback(async () => {
    try {
      const res = await fetch("/api/coupons/desk", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load desk state.");
      const data: Desk = await res.json();
      setDesk(data);
      setDeskLoadError(null);
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to load desk state.");
    }
  }, []);

  useEffect(() => {
    fetchDesk();
    const interval = setInterval(fetchDesk, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchDesk]);

  // --- setup ---
  const [stablecoinStep, setStablecoinStep] = useState<StepStatus>("pending");
  const [investorsStep, setInvestorsStep] = useState<StepStatus>("pending");
  const [stablecoinDetail, setStablecoinDetail] = useState<string | undefined>(undefined);
  const [investorsDetail, setInvestorsDetail] = useState<string | undefined>(undefined);
  const [setupRunning, setSetupRunning] = useState(false);

  useEffect(() => {
    if (desk?.stablecoin && stablecoinStep !== "active") {
      setStablecoinStep("done");
      setStablecoinDetail(desk.stablecoin.tokenId);
    }
    if (desk && desk.investors.filter(i => i.id === "A" || i.id === "B").length === 2 && investorsStep !== "active") {
      setInvestorsStep("done");
      setInvestorsDetail(
        desk.investors
          .filter(i => i.id === "A" || i.id === "B")
          .map(i => i.accountId)
          .join(", "),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk?.stablecoin, desk?.investors]);

  async function handleSetupDesk() {
    setSetupRunning(true);
    try {
      if (stablecoinStep !== "done") {
        setStablecoinStep("active");
        const result = await postJson<{ stablecoin: { tokenId: string } }>("/api/coupons/setup/stablecoin");
        setStablecoinDetail(result.stablecoin.tokenId);
        setStablecoinStep("done");
      }
      if (investorsStep !== "done") {
        setInvestorsStep("active");
        const result = await postJson<{ investors: Investor[] }>("/api/coupons/setup/investors");
        setInvestorsDetail(result.investors.map(i => i.accountId).join(", "));
        setInvestorsStep("done");
      }
      await fetchDesk();
    } catch (e: any) {
      if (stablecoinStep === "active") setStablecoinStep("failed");
      else if (investorsStep === "active") setInvestorsStep("failed");
      setDeskLoadError(e?.message ?? "Setup failed.");
    } finally {
      setSetupRunning(false);
    }
  }

  // --- issue form ---
  const [bondName, setBondName] = useState("Acme Coupon Bond");
  const [faceValue, setFaceValue] = useState("1000");
  const [couponRate, setCouponRate] = useState("1");
  const [periodMinutes, setPeriodMinutes] = useState("2");
  const [couponCount, setCouponCount] = useState("3");
  const [issuePending, setIssuePending] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  async function handleIssueBond() {
    setIssuePending(true);
    setIssueError(null);
    try {
      await postJson("/api/coupons/issue", {
        name: bondName,
        faceValue: Number(faceValue),
        couponRatePercent: Number(couponRate),
        periodMinutes: Number(periodMinutes),
        couponCount: Number(couponCount),
      });
      await fetchDesk();
    } catch (e: any) {
      setIssueError(e?.message ?? "Failed to issue the bond.");
    } finally {
      setIssuePending(false);
    }
  }

  // --- allocation ---
  const [allocateUnits, setAllocateUnits] = useState<Record<string, string>>({});
  const [allocatePending, setAllocatePending] = useState<Record<string, boolean>>({});
  const initializedAllocation = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!desk) return;
    setAllocateUnits(prev => {
      const next = { ...prev };
      for (const investor of desk.investors) {
        if (!initializedAllocation.current.has(investor.id)) {
          initializedAllocation.current.add(investor.id);
          next[investor.id] = investor.id === "A" ? "10" : investor.id === "B" ? "5" : "1";
        }
      }
      return next;
    });
  }, [desk]);

  async function handleAllocate(investor: Investor) {
    setAllocatePending(prev => ({ ...prev, [investor.id]: true }));
    try {
      await postJson("/api/coupons/allocate", {
        investorAddress: investor.evmAddress,
        units: Number(allocateUnits[investor.id] ?? 0),
      });
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to allocate.");
    } finally {
      setAllocatePending(prev => ({ ...prev, [investor.id]: false }));
    }
  }

  // --- funding ---
  const [fundAmount, setFundAmount] = useState("");
  const [fundTouched, setFundTouched] = useState(false);
  const [fundPending, setFundPending] = useState(false);
  const lastBondAddress = useRef<string | null>(null);

  const missingStablecoin = desk?.bond
    ? Math.max(0, Number(desk.bond.stablecoinNeeded) - Number(desk.bond.stablecoinHeld))
    : 0;

  useEffect(() => {
    const addr = desk?.bond?.address ?? null;
    if (addr !== lastBondAddress.current) {
      lastBondAddress.current = addr;
      setFundTouched(false);
    }
    if (!fundTouched && desk?.bond) {
      setFundAmount(trimTrailingZeros(missingStablecoin));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk?.bond?.address, desk?.bond?.stablecoinNeeded, desk?.bond?.stablecoinHeld, fundTouched]);

  async function handleFundBond() {
    setFundPending(true);
    try {
      await postJson("/api/coupons/fund", { stablecoinAmount: Number(fundAmount) });
      setFundTouched(false);
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to fund the bond.");
    } finally {
      setFundPending(false);
    }
  }

  // --- schedule controls ---
  const [startPending, setStartPending] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [payNowPending, setPayNowPending] = useState(false);

  async function handleStart() {
    setStartPending(true);
    try {
      await postJson("/api/coupons/start");
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to start coupons.");
    } finally {
      setStartPending(false);
    }
  }

  async function handleStop() {
    setStopPending(true);
    try {
      await postJson("/api/coupons/stop");
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to stop the schedule.");
    } finally {
      setStopPending(false);
    }
  }

  async function handlePayNow() {
    setPayNowPending(true);
    try {
      await postJson("/api/coupons/pay-now");
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to pay the due coupon.");
    } finally {
      setPayNowPending(false);
    }
  }

  // --- wallet investor ---
  const [addWalletPending, setAddWalletPending] = useState(false);
  const [associatePending, setAssociatePending] = useState(false);
  const walletInvestor = desk?.investors.find(i => i.id === "wallet");
  const onHederaTestnet = connectedChainId === hederaTestnet.id;

  async function handleAddWalletInvestor() {
    if (!walletAddress) return;
    setAddWalletPending(true);
    try {
      await postJson("/api/coupons/wallet-investor", { address: walletAddress });
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to add your wallet.");
    } finally {
      setAddWalletPending(false);
    }
  }

  async function handleAssociate() {
    if (!desk?.stablecoin) return;
    setAssociatePending(true);
    try {
      await writeAssociate({
        address: desk.stablecoin.evmAddress,
        abi: hrc719AssociateAbi,
        functionName: "associate",
        chainId: hederaTestnet.id,
      });
      await fetchDesk();
    } catch (e: any) {
      setDeskLoadError(e?.message ?? "Failed to associate the stablecoin.");
    } finally {
      setAssociatePending(false);
    }
  }

  const walletState = (() => {
    if (!isConnected) return "Connect your wallet to add it as an investor.";
    if (!onHederaTestnet) return "Switch to Hedera testnet to continue.";
    if (!walletInvestor) return "Add your wallet as an investor to receive coupons.";
    if (!walletInvestor.isAssociated) return "Associate the stablecoin so your wallet can receive coupons.";
    return "You’re set — coupons will arrive automatically, nobody needs to press anything else.";
  })();

  if (!desk) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg" aria-hidden />
      </div>
    );
  }

  const bond = desk.bond;
  const hasFactory = Boolean(desk.factory);
  const setupDone = stablecoinStep === "done" && investorsStep === "done";
  const canAllocate = bond?.status === "CREATED";
  const canStart =
    bond?.status === "CREATED" && bond.holders.length > 0 && Number(bond.hbarHeldHbar) >= Number(bond.hbarNeededHbar);
  const canStop = bond?.status === "RUNNING";

  return (
    <div className="flex flex-col flex-1">
      <section className="w-full max-w-5xl mx-auto px-5 pt-10 pb-6 text-center">
        <h1 className="text-3xl font-bold mb-3">Coupon bond desk</h1>
        <p className="text-base-content/70 max-w-3xl mx-auto">
          A coupon is a periodic interest payment a bond makes to its holders. Usually a paying agent, or on other
          chains a keeper network such as Chainlink Automation, has to trigger each payment. Here the bond schedules its
          own payments through the Hedera Schedule Service (HIP-1215): once started, the network itself calls the bond
          at each due date — no keeper, bot, or cron job involved.
        </p>
      </section>

      {deskLoadError && (
        <div className="w-full max-w-5xl mx-auto px-5">
          <div className="alert alert-error text-sm mb-4">{deskLoadError}</div>
        </div>
      )}

      <section className="w-full max-w-5xl mx-auto px-5 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: what the learner does */}
        <div className="flex flex-col gap-6">
          {/* Setup */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Set up desk</h2>
              <p className="text-sm opacity-70 m-0">Creates the stablecoin that pays coupons and two demo investors.</p>

              {!desk.config.ok && (
                <div id="config-error" className="alert alert-error text-sm mt-2">
                  {desk.config.error ??
                    `Set ${(desk.config.missing ?? ["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"]).join(" and ")} to configure the operator.`}
                </div>
              )}

              {desk.config.ok && !hasFactory && (
                <div id="factory-missing" className="alert alert-warning text-sm mt-2">
                  No factory is deployed yet. Run <code>yarn coupons:deploy</code> to deploy one.
                </div>
              )}

              {hasFactory && desk.factory && (
                <p className="text-sm mt-2">
                  Factory:{" "}
                  <a
                    id="factory-address"
                    href={hashscanAddressLink(desk.factory.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary"
                  >
                    {desk.factory.address}
                  </a>
                </p>
              )}

              <div className="mt-3 flex flex-col">
                <StepRow
                  id="setup-step-stablecoin"
                  status={stablecoinStep}
                  label="Create the stablecoin"
                  detail={stablecoinDetail}
                />
                <StepRow
                  id="setup-step-investors"
                  status={investorsStep}
                  label="Create the demo investors"
                  detail={investorsDetail}
                />
              </div>

              <button
                id="setup-desk"
                className="btn btn-primary btn-sm mt-3 w-fit"
                disabled={!desk.config.ok || setupRunning || setupDone}
                onClick={handleSetupDesk}
              >
                {setupRunning ? <span className="loading loading-spinner loading-xs" /> : null}
                Set up desk
              </button>
            </div>
          </div>

          {/* Issue form */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Issue a bond</h2>
              <p className="text-sm opacity-70 m-0">
                Creates a new coupon bond through the factory, owned by the issuer.
              </p>

              <div className="flex flex-col gap-3 mt-2">
                <label className="flex flex-col gap-1 text-sm">
                  Name
                  <input
                    id="bond-name"
                    className="input input-bordered input-sm"
                    value={bondName}
                    onChange={e => setBondName(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Face value per unit (stablecoin)
                  <input
                    id="bond-face-value"
                    type="number"
                    step={1}
                    min={1}
                    className="input input-bordered input-sm"
                    value={faceValue}
                    onChange={e => setFaceValue(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Coupon rate per period (% of face value)
                  <input
                    id="bond-coupon-rate"
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={20}
                    className="input input-bordered input-sm"
                    value={couponRate}
                    onChange={e => setCouponRate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Minutes between coupons
                  <input
                    id="bond-period-minutes"
                    type="number"
                    step={1}
                    min={1}
                    max={60}
                    className="input input-bordered input-sm"
                    value={periodMinutes}
                    onChange={e => setPeriodMinutes(e.target.value)}
                  />
                  <span className="text-xs opacity-60">
                    Stands in for a real coupon period (e.g. six months), shortened so it can be watched.
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Number of coupons
                  <input
                    id="bond-coupon-count"
                    type="number"
                    step={1}
                    min={1}
                    max={12}
                    className="input input-bordered input-sm"
                    value={couponCount}
                    onChange={e => setCouponCount(e.target.value)}
                  />
                </label>
              </div>

              {issueError && <div className="alert alert-error text-sm mt-2">{issueError}</div>}

              <button
                id="issue-bond"
                className="btn btn-primary btn-sm mt-3 w-fit"
                disabled={!hasFactory || !desk.stablecoin || issuePending}
                onClick={handleIssueBond}
              >
                {issuePending ? <span className="loading loading-spinner loading-xs" /> : null}
                Issue bond
              </button>
            </div>
          </div>

          {/* Positions and funding */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Positions and funding</h2>
              <p className="text-sm opacity-70 m-0">
                Allocate units to each investor, then fund the bond so it can pay them.
              </p>

              <div id="investors" className="flex flex-col gap-2 mt-2">
                {desk.investors.length === 0 && (
                  <p className="text-sm opacity-60">Set up the desk to create investors.</p>
                )}
                {desk.investors.map(investor => (
                  <div
                    key={investor.id}
                    className="investor-row flex flex-col gap-1 border border-base-300 rounded-lg p-2 text-sm"
                    data-address={investor.evmAddress}
                  >
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-semibold">{investor.label}</span>
                      <span className="opacity-60 text-xs">{investor.accountId}</span>
                    </div>
                    <span className="opacity-60 text-xs break-all">{investor.evmAddress}</span>
                    <div className="flex justify-between flex-wrap gap-2">
                      <span>Allocated units: {investor.units}</span>
                      <span>Balance: {investor.stablecoinBalance} ACUSD</span>
                    </div>
                    {canAllocate && (
                      <div className="flex gap-2 items-center mt-1">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="investor-units input input-bordered input-xs w-20"
                          value={allocateUnits[investor.id] ?? ""}
                          onChange={e => setAllocateUnits(prev => ({ ...prev, [investor.id]: e.target.value }))}
                        />
                        <button
                          className="investor-allocate btn btn-outline btn-xs"
                          disabled={Boolean(allocatePending[investor.id])}
                          onClick={() => handleAllocate(investor)}
                        >
                          {allocatePending[investor.id] ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : null}
                          Allocate
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {bond && (
                <div id="funding" className="mt-3 text-sm flex flex-col gap-1">
                  <span>
                    Needs {bond.stablecoinNeeded} ACUSD and {bond.hbarNeededHbar} HBAR in total; holds{" "}
                    {bond.stablecoinHeld} ACUSD and {bond.hbarHeldHbar} HBAR.
                  </span>
                  <div className="flex gap-2 items-center mt-1">
                    <label className="flex flex-col gap-1">
                      Stablecoin to send
                      <input
                        id="fund-amount"
                        type="number"
                        min={0}
                        step={1}
                        className="input input-bordered input-sm w-32"
                        value={fundAmount}
                        onChange={e => {
                          setFundTouched(true);
                          setFundAmount(e.target.value);
                        }}
                      />
                    </label>
                    <button
                      id="fund-bond"
                      className="btn btn-outline btn-sm mt-5"
                      disabled={fundPending}
                      onClick={handleFundBond}
                    >
                      {fundPending ? <span className="loading loading-spinner loading-xs" /> : null}
                      Fund bond
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Schedule controls */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Schedule controls</h2>
              <p className="text-sm opacity-70 m-0">Starts and stops the bond’s self-scheduling coupons.</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  id="start-schedule"
                  className="btn btn-primary btn-sm"
                  disabled={!canStart || startPending}
                  onClick={handleStart}
                >
                  {startPending ? <span className="loading loading-spinner loading-xs" /> : null}
                  Start coupons
                </button>
                <button
                  id="stop-schedule"
                  className="btn btn-error btn-sm"
                  disabled={!canStop || stopPending}
                  onClick={handleStop}
                >
                  {stopPending ? <span className="loading loading-spinner loading-xs" /> : null}
                  Stop schedule
                </button>
                <button
                  id="pay-now"
                  className="btn btn-outline btn-sm"
                  disabled={bond?.status !== "RUNNING" || payNowPending}
                  onClick={handlePayNow}
                >
                  {payNowPending ? <span className="loading loading-spinner loading-xs" /> : null}
                  Pay due coupon
                </button>
              </div>
            </div>
          </div>

          {/* Wallet investor */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Your wallet</h2>
              <p className="text-sm opacity-70 m-0">Add your connected wallet as an investor to receive coupons too.</p>
              <p id="wallet-state" className="text-sm mt-2">
                {walletState}
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  id="add-wallet-investor"
                  className="btn btn-outline btn-sm"
                  disabled={!isConnected || !onHederaTestnet || Boolean(walletInvestor) || addWalletPending}
                  onClick={handleAddWalletInvestor}
                >
                  {addWalletPending ? <span className="loading loading-spinner loading-xs" /> : null}
                  Add my wallet as an investor
                </button>
                <button
                  id="associate-stablecoin"
                  className="btn btn-outline btn-sm"
                  disabled={!walletInvestor || walletInvestor.isAssociated || associatePending}
                  onClick={handleAssociate}
                >
                  {associatePending ? <span className="loading loading-spinner loading-xs" /> : null}
                  Associate the stablecoin
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: what the network shows */}
        <div className="flex flex-col gap-6">
          {!bond && (
            <div className="card bg-base-100 border border-base-300 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-base">The bond</h2>
                <p className="text-sm opacity-70 m-0">
                  Once you issue a bond, its terms, status, schedule and coupon history will appear here.
                </p>
              </div>
            </div>
          )}

          {bond && (
            <div className="card bg-base-100 border border-base-300 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-base flex items-center gap-2">
                  {bond.name}
                  <span id="bond-status" className={`badge badge-sm ${statusBadgeClass(bond.status)}`}>
                    {bond.status}
                  </span>
                </h2>
                <p className="text-sm opacity-70 m-0">The bond, read back from the contract.</p>

                <div className="text-sm mt-2 flex flex-col gap-1">
                  <span>
                    Address:{" "}
                    <a
                      id="bond-address"
                      href={hashscanAddressLink(bond.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="link link-primary break-all"
                    >
                      {bond.address}
                    </a>
                  </span>
                  {bond.contractId && (
                    <span>
                      Contract id:{" "}
                      <a
                        id="bond-contract-id"
                        href={hashscanContractLink(bond.contractId)}
                        target="_blank"
                        rel="noreferrer"
                        className="link link-primary"
                      >
                        {bond.contractId}
                      </a>
                    </span>
                  )}
                  <span>
                    Face value {bond.faceValue} · Coupon {bond.couponRatePercent}% · Every {bond.periodMinutes} min ·{" "}
                    {bond.couponCount} coupons
                  </span>

                  {bond.status === "RUNNING" && bond.nextCouponDue && (
                    <span id="next-coupon">
                      Coupon {bond.currentCoupon} of {bond.couponCount} due{" "}
                      {new Date(bond.nextCouponDue * 1000).toLocaleString()}
                    </span>
                  )}

                  {bond.status === "RUNNING" && bond.scheduleAddress && (
                    <span>
                      Schedule:{" "}
                      <a
                        id="schedule-address"
                        href={hashscanAddressLink(bond.scheduleAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="link link-primary break-all"
                      >
                        {bond.scheduleAddress}
                      </a>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body">
              <h2 className="card-title text-base">Coupon history</h2>
              <p className="text-sm opacity-70 m-0">
                Read from the bond’s events on the mirror node — payments appear here on their own.
              </p>

              <div id="coupons" className="flex flex-col gap-2 mt-2">
                {(!bond || bond.coupons.length === 0) && <p className="text-sm opacity-60">No coupons yet.</p>}
                {bond?.coupons.map(coupon => (
                  <div
                    key={`${coupon.couponNumber}-${coupon.transactionHash}`}
                    className="coupon-entry flex justify-between items-center flex-wrap gap-2 border border-base-300 rounded-lg p-2 text-sm"
                  >
                    <span>Coupon {coupon.couponNumber}</span>
                    <span className="opacity-70">{new Date(coupon.consensusTime).toLocaleString()}</span>
                    <span
                      className={`badge badge-sm ${
                        coupon.outcome === "MISSED"
                          ? "badge-error"
                          : coupon.outcome === "PRINCIPAL REPAID"
                            ? "badge-neutral"
                            : "badge-success"
                      }`}
                    >
                      {coupon.outcome}
                    </span>
                    <span>{coupon.totalPaid} ACUSD</span>
                    <a
                      href={hashscanTxLink(coupon.transactionHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="link link-primary text-xs"
                    >
                      View tx
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function trimTrailingZeros(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? value.toString() : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
