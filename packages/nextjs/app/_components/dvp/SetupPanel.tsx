"use client";

import { useState } from "react";
import * as dvp from "~~/services/hedera/dvpClient";
import { SETUP_STEPS, type SetupStepId } from "~~/services/hedera/setupSteps";
import type { MarketSnapshot } from "~~/services/hedera/types";
import { notification } from "~~/utils/scaffold-hbar/notification";

type StepState = { status: "pending" | "active" | "done" | "failed"; detail?: string };
type Progress = Record<SetupStepId, StepState>;

const idle = (): Progress => Object.fromEntries(SETUP_STEPS.map(s => [s.id, { status: "pending" }])) as Progress;

const StepIcon = ({ status }: { status: StepState["status"] }) => {
  if (status === "active")
    return <span className="loading loading-spinner loading-sm text-primary" aria-label="running" />;
  if (status === "done")
    return (
      <span className="text-success font-bold" aria-label="done">
        ✓
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-error font-bold" aria-label="failed">
        ✕
      </span>
    );
  return <span className="w-4 h-4 rounded-full border border-base-content/30 inline-block" aria-label="pending" />;
};

type Props = {
  configLoaded: boolean;
  operatorConfigured: boolean;
  onMarket: (market: MarketSnapshot) => void;
};

/**
 * Explains what `Set up market` does, then shows each step's progress while it runs: a spinner
 * on the running step, a check (and the ids it created) on finished ones, a cross on a failure.
 */
export const SetupPanel = ({ configLoaded, operatorConfigured, onMarket }: Props) => {
  const [progress, setProgress] = useState<Progress>(idle);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  const run = async () => {
    setBusy(true);
    setStarted(true);
    setProgress(idle());
    try {
      const market = await dvp.setupMarket(({ step, status, detail }) =>
        setProgress(p => ({ ...p, [step]: { status, detail } })),
      );
      onMarket(market);
      notification.success("Market set up.");
    } catch (e) {
      const step = e instanceof dvp.SetupError ? e.step : null;
      if (step) setProgress(p => ({ ...p, [step]: { status: "failed" } }));
      notification.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card bg-base-100 shadow-md border border-base-300 p-6 w-full">
      <h2 className="font-bold text-lg mb-2">Setup</h2>
      <p className="text-sm text-base-content/70 mb-4">
        Setting up a market creates everything a trade needs, from scratch, on Hedera testnet. You are the issuer: your
        operator account signs and pays for each step. It takes about a minute and costs roughly 31 HBAR, almost all of
        it the network fee for creating two tokens. Running it again starts a fresh market.
      </p>

      <ol className="flex flex-col gap-3 mb-5">
        {SETUP_STEPS.map((s, i) => {
          const state = progress[s.id];
          return (
            <li key={s.id} id={`setup-step-${s.id}`} data-status={state.status} className="flex gap-3 items-start">
              <span className="mt-0.5 w-5 flex justify-center">
                {started ? <StepIcon status={state.status} /> : <span className="text-sm opacity-60">{i + 1}.</span>}
              </span>
              <div className="text-sm">
                <p className={state.status === "active" ? "font-semibold" : "font-medium"}>{s.label}</p>
                <p className="text-base-content/70">{s.explanation}</p>
                {state.detail && <p className="font-mono text-xs mt-1">{state.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {configLoaded && !operatorConfigured && (
        <p id="config-error" className="text-error text-sm mb-3">
          Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to configure the operator.
        </p>
      )}
      <button
        id="setup-market"
        className="btn btn-primary w-fit"
        disabled={!configLoaded || !operatorConfigured || busy}
        onClick={run}
      >
        {busy && <span className="loading loading-spinner loading-sm" />}
        {busy ? "Setting up…" : "Set up market"}
      </button>
    </section>
  );
};
