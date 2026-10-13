const HASHSCAN_TESTNET = "https://hashscan.io/testnet";

type HashScanLinkProps = {
  /** The `id` attribute the checker looks for, e.g. "security-token-id". */
  htmlId: string;
  /** The Hedera id to display and link, e.g. "0.0.1234". */
  hederaId: string;
  kind: "account" | "token" | "schedule";
};

/** A Hedera id rendered as text and linked to its HashScan testnet page. */
export const HashScanLink = ({ htmlId, hederaId, kind }: HashScanLinkProps) => (
  <a id={htmlId} href={`${HASHSCAN_TESTNET}/${kind}/${hederaId}`} target="_blank" rel="noreferrer" className="link">
    {hederaId}
  </a>
);
