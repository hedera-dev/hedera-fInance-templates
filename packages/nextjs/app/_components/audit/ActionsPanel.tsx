"use client";

import { useState } from "react";
import type { TokenAction } from "~~/services/hcsAudit/types";

type ActionsPanelProps = {
  disabled: boolean;
  busyAction: TokenAction | null;
  actionError: string | null;
  onAction: (action: TokenAction, amount?: number) => void;
};

export const ActionsPanel = ({ disabled, busyAction, actionError, onAction }: ActionsPanelProps) => {
  const [amount, setAmount] = useState("100");

  const anyBusy = busyAction !== null;

  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300">
      <h3 className="font-bold text-lg mb-3">Token actions</h3>
      <div className="flex flex-col gap-3">
        <button
          id="action-grant-kyc"
          className="btn btn-sm btn-outline"
          disabled={disabled || anyBusy}
          onClick={() => onAction("grant_kyc")}
        >
          {busyAction === "grant_kyc" ? "Granting KYC…" : "Grant KYC"}
        </button>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="transfer-amount" className="text-xs font-medium text-base-content/70">
              Amount
            </label>
            <input
              id="transfer-amount"
              type="number"
              min={1}
              step={1}
              className="input input-sm input-bordered w-28"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={disabled || anyBusy}
            />
          </div>
          <button
            id="action-transfer"
            className="btn btn-sm btn-outline"
            disabled={disabled || anyBusy}
            onClick={() => onAction("transfer", Number(amount))}
          >
            {busyAction === "transfer" ? "Transferring…" : "Transfer"}
          </button>
        </div>

        <button
          id="action-freeze"
          className="btn btn-sm btn-outline"
          disabled={disabled || anyBusy}
          onClick={() => onAction("freeze")}
        >
          {busyAction === "freeze" ? "Freezing…" : "Freeze holder"}
        </button>

        <button
          id="action-unfreeze"
          className="btn btn-sm btn-outline"
          disabled={disabled || anyBusy}
          onClick={() => onAction("unfreeze")}
        >
          {busyAction === "unfreeze" ? "Unfreezing…" : "Unfreeze holder"}
        </button>
      </div>

      {actionError && <p className="text-sm text-error mt-3">{actionError}</p>}
    </div>
  );
};
