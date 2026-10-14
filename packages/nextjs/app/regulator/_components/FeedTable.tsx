"use client";

import { hashscanAccountUrl, hashscanTransactionUrl } from "~~/services/hcsAudit/mirror";
import type { FeedRow } from "~~/services/hcsAudit/verify";

function CheckMark({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-success" : "text-error"}>{ok ? "✓" : "✕"}</span>;
}

export const FeedTable = ({ rows }: { rows: FeedRow[] }) => {
  if (rows.length === 0) return null;

  return (
    <div id="feed" className="overflow-x-auto mt-4">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>#</th>
            <th>Consensus time</th>
            <th>Event</th>
            <th>Result</th>
            <th>Transaction</th>
            <th>Published by</th>
            <th>Sequence</th>
            <th>Chain</th>
            <th>Transaction check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.sequenceNumber} className="feed-entry" data-sequence={row.sequenceNumber}>
              <td>{row.sequenceNumber}</td>
              <td>{row.consensusTimestamp}</td>
              <td>{row.entry?.event ?? "(unreadable)"}</td>
              <td>{row.entry?.result ?? "—"}</td>
              <td>
                {row.entry ? (
                  <a
                    href={hashscanTransactionUrl(row.entry.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="link link-primary"
                  >
                    {row.entry.tx}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <a
                  href={hashscanAccountUrl(row.payerAccountId)}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary"
                >
                  {row.payerAccountId}
                </a>
              </td>
              <td>
                <CheckMark ok={row.checks.sequence} />
              </td>
              <td>
                <CheckMark ok={row.checks.chain} />
              </td>
              <td>
                <CheckMark ok={row.checks.transaction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
