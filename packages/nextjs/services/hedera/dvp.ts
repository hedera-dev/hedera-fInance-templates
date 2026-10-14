// Deep import, not the package root: the root re-exports a Reown/AppKit (ethers-dependent) tree
// that this server-only module has no use for and shouldn't pull into the API route bundle.
import { transactionToBase64String } from "@hashgraph/hedera-wallet-connect/dist/lib/shared/utils.js";
import {
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  ScheduleSignTransaction,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenGrantKycTransaction,
  TokenMintTransaction,
  TransactionId,
  TransactionReceiptQuery,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { getOperatorClient } from "~~/services/hedera/client";
import { formatBaseUnits, toBaseUnits } from "~~/services/hedera/format";
import { fetchPartyBalances, waitForMirrorIndexing } from "~~/services/hedera/mirror";
import type { SetupStepId } from "~~/services/hedera/setupSteps";
import {
  BuyerChoice,
  DemoParty,
  Market,
  PAYMENT_DECIMALS,
  SECURITY_DECIMALS,
  WalletRole,
  getMarket,
  requireMarket,
  setMarket,
} from "~~/services/hedera/store";
import {
  BUYER_INITIAL_PAYMENT,
  type MarketSnapshot,
  type PartySnapshot,
  SELLER_INITIAL_SECURITY,
} from "~~/services/hedera/types";

// Hedera refuses a schedule whose body matches one that still exists (executed schedules
// linger until expiry), so an identical repeat trade needs a distinct memo.
const tradeMemo = () => `DvP trade ${Date.now()}`;
// The operator pays every fee; demo accounts only co-sign, so they need almost no HBAR.
const DEMO_ACCOUNT_OPENING_BALANCE = new Hbar(1);

async function partySnapshot(accountId: string, market: Market): Promise<PartySnapshot> {
  const balances = await fetchPartyBalances(accountId, market.securityTokenId, market.paymentTokenId);
  return {
    accountId,
    balances: {
      security: formatBaseUnits(balances.security, SECURITY_DECIMALS),
      payment: formatBaseUnits(balances.payment, PAYMENT_DECIMALS),
    },
  };
}

async function buildSnapshot(market: Market): Promise<MarketSnapshot> {
  const [seller, buyer, unverifiedBuyer, walletSeller, walletBuyer] = await Promise.all([
    partySnapshot(market.seller.accountId, market),
    partySnapshot(market.buyer.accountId, market),
    partySnapshot(market.unverifiedBuyer.accountId, market),
    market.walletSeller ? partySnapshot(market.walletSeller.accountId, market) : Promise.resolve(null),
    market.walletBuyer ? partySnapshot(market.walletBuyer.accountId, market) : Promise.resolve(null),
  ]);

  return {
    securityTokenId: market.securityTokenId,
    paymentTokenId: market.paymentTokenId,
    seller,
    buyer,
    unverifiedBuyer,
    walletSeller,
    walletBuyer,
    trade: market.trade
      ? {
          scheduleId: market.trade.scheduleId,
          status: market.trade.status,
          settlementResult: market.trade.settlementResult,
          quantity: market.trade.quantity,
          price: market.trade.price,
          buyerChoice: market.trade.buyerChoice,
          sellerIsWallet: market.trade.sellerIsWallet,
          buyerIsWallet: market.trade.buyerIsWallet,
        }
      : null,
  };
}

/** Resolves the account that plays the chosen buyer side for a new trade. */
function resolveBuyerAccountId(market: Market, buyerChoice: BuyerChoice): string {
  if (buyerChoice === "unverifiedBuyer") return market.unverifiedBuyer.accountId;
  return market.walletBuyer?.accountId ?? market.buyer.accountId;
}

async function createDemoAccount(client: Client): Promise<DemoParty> {
  const key = PrivateKey.generateECDSA();
  const receipt = await (
    await new AccountCreateTransaction()
      .setKeyWithoutAlias(key.publicKey)
      .setInitialBalance(DEMO_ACCOUNT_OPENING_BALANCE)
      .execute(client)
  ).getReceipt(client);
  if (!receipt.accountId) throw new Error("Account creation did not return an account id");
  return { accountId: receipt.accountId.toString(), privateKey: key.toStringRaw() };
}

async function createSecurityToken(client: Client, treasury: string): Promise<string> {
  const operatorKey = client.operatorPublicKey;
  if (!operatorKey) throw new Error("Operator key is not available on the client");
  const receipt = await (
    await new TokenCreateTransaction()
      .setTokenName("DvP Security")
      .setTokenSymbol("DVPS")
      .setDecimals(SECURITY_DECIMALS)
      .setInitialSupply(SELLER_INITIAL_SECURITY)
      .setTreasuryAccountId(treasury)
      .setAdminKey(operatorKey)
      .setSupplyKey(operatorKey)
      .setKycKey(operatorKey)
      .setFreezeKey(operatorKey)
      .execute(client)
  ).getReceipt(client);
  if (!receipt.tokenId) throw new Error("Security token creation did not return a token id");
  return receipt.tokenId.toString();
}

async function createPaymentToken(client: Client, treasury: string): Promise<string> {
  const operatorKey = client.operatorPublicKey;
  if (!operatorKey) throw new Error("Operator key is not available on the client");
  const totalSupply = toBaseUnits(BUYER_INITIAL_PAYMENT * 2, PAYMENT_DECIMALS);
  const receipt = await (
    await new TokenCreateTransaction()
      .setTokenName("DvP Stablecoin")
      .setTokenSymbol("DVPC")
      .setDecimals(PAYMENT_DECIMALS)
      .setInitialSupply(totalSupply)
      .setTreasuryAccountId(treasury)
      .setAdminKey(operatorKey)
      .setSupplyKey(operatorKey)
      .execute(client)
  ).getReceipt(client);
  if (!receipt.tokenId) throw new Error("Stablecoin creation did not return a token id");
  return receipt.tokenId.toString();
}

async function associateBoth(
  client: Client,
  party: DemoParty,
  securityTokenId: string,
  paymentTokenId: string,
): Promise<void> {
  const key = PrivateKey.fromStringECDSA(party.privateKey);
  const tx = new TokenAssociateTransaction()
    .setAccountId(party.accountId)
    .setTokenIds([securityTokenId, paymentTokenId])
    .freezeWith(client);
  const signed = await tx.sign(key);
  const response = await signed.execute(client);
  await response.getReceipt(client);
}

async function grantSecurityKyc(client: Client, securityTokenId: string, accountId: string): Promise<void> {
  const response = await new TokenGrantKycTransaction()
    .setTokenId(securityTokenId)
    .setAccountId(accountId)
    .execute(client);
  await response.getReceipt(client);
}

/** Creates fresh demo accounts and tokens, and resets the page to them. */
/**
 * Runs each setup step in order, reporting it to `onStep` as it starts and finishes so the page
 * can show progress. `detail` carries the ids a step created.
 */
export async function setupMarket(
  onStep: (step: SetupStepId, status: "active" | "done", detail?: string) => void = () => undefined,
): Promise<MarketSnapshot> {
  const client = getOperatorClient();
  const step = async <T>(id: SetupStepId, run: () => Promise<T>, detail?: (result: T) => string): Promise<T> => {
    onStep(id, "active");
    const result = await run();
    onStep(id, "done", detail?.(result));
    return result;
  };
  try {
    const operatorId = client.operatorAccountId;
    if (!operatorId) throw new Error("Operator account id is not available on the client");

    // One transaction at a time: submitting several from the same payer in the same instant
    // can draw a transient BUSY response from a testnet node, even though each is independent.
    const [seller, buyer, unverifiedBuyer] = await step(
      "accounts",
      async () => [await createDemoAccount(client), await createDemoAccount(client), await createDemoAccount(client)],
      accounts => accounts.map(a => a.accountId).join(", "),
    );

    const securityTokenId = await step(
      "security",
      () => createSecurityToken(client, operatorId.toString()),
      id => id,
    );
    const paymentTokenId = await step(
      "stablecoin",
      () => createPaymentToken(client, operatorId.toString()),
      id => id,
    );

    await step("associate", async () => {
      for (const party of [seller, buyer, unverifiedBuyer]) {
        await associateBoth(client, party, securityTokenId, paymentTokenId);
      }
    });

    await step("kyc", async () => {
      await grantSecurityKyc(client, securityTokenId, seller.accountId);
      await grantSecurityKyc(client, securityTokenId, buyer.accountId);
    });

    await step("fund", async () => {
      const securityAmount = toBaseUnits(SELLER_INITIAL_SECURITY, SECURITY_DECIMALS);
      const paymentAmount = toBaseUnits(BUYER_INITIAL_PAYMENT, PAYMENT_DECIMALS);
      const fundingResponse = await new TransferTransaction()
        .addTokenTransfer(securityTokenId, operatorId.toString(), -securityAmount)
        .addTokenTransfer(securityTokenId, seller.accountId, securityAmount)
        .addTokenTransfer(paymentTokenId, operatorId.toString(), -(paymentAmount * 2n))
        .addTokenTransfer(paymentTokenId, buyer.accountId, paymentAmount)
        .addTokenTransfer(paymentTokenId, unverifiedBuyer.accountId, paymentAmount)
        .execute(client);
      await fundingResponse.getReceipt(client);
      await waitForMirrorIndexing(fundingResponse.transactionId.toString());
    });

    const market: Market = {
      securityTokenId,
      paymentTokenId,
      seller,
      buyer,
      unverifiedBuyer,
      walletSeller: null,
      walletBuyer: null,
      trade: null,
      pendingWalletProposal: null,
    };
    setMarket(market);

    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}

/** Current market snapshot, or null if no market has been set up yet in this server process. */
export async function getSnapshot(): Promise<MarketSnapshot | null> {
  const market = getMarket();
  if (!market) return null;
  return await buildSnapshot(market);
}

function buildTransferTransaction(
  market: Market,
  sellerAccountId: string,
  buyerAccountId: string,
  quantity: number,
  price: number,
): TransferTransaction {
  const quantityBase = toBaseUnits(quantity, SECURITY_DECIMALS);
  const priceBase = toBaseUnits(price, PAYMENT_DECIMALS);
  return new TransferTransaction()
    .addTokenTransfer(market.securityTokenId, sellerAccountId, -quantityBase)
    .addTokenTransfer(market.securityTokenId, buyerAccountId, quantityBase)
    .addTokenTransfer(market.paymentTokenId, buyerAccountId, -priceBase)
    .addTokenTransfer(market.paymentTokenId, sellerAccountId, priceBase)
    .setTransactionMemo("DvP settlement");
}

/**
 * The security has 0 decimals and the stablecoin 6, so a fractional quantity or a price below
 * one micro-unit would be silently rounded by `toBaseUnits` into a different trade than shown.
 */
function assertValidTerms(quantity: number, price: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be a whole number of at least 1.");
  if (!(price > 0) || Math.round(price * 10 ** PAYMENT_DECIMALS) !== price * 10 ** PAYMENT_DECIMALS) {
    throw new Error(`Price must be positive, with at most ${PAYMENT_DECIMALS} decimals.`);
  }
}

function assertNoPendingTrade(market: Market): void {
  if (market.trade && market.trade.status === "PENDING") {
    throw new Error("A trade is already pending a signature.");
  }
}

/** Seller (demo account) proposes and signs the scheduled two-leg transfer. */
export async function proposeTradeDemo(
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
): Promise<MarketSnapshot> {
  const market = requireMarket();
  if (market.walletSeller) throw new Error("Seller is a connected wallet; use the wallet signing flow.");
  assertNoPendingTrade(market);
  assertValidTerms(quantity, price);

  const client = getOperatorClient();
  try {
    const sellerAccountId = market.seller.accountId;
    const buyerAccountId = resolveBuyerAccountId(market, buyerChoice);
    const sellerKey = PrivateKey.fromStringECDSA(market.seller.privateKey);

    const scheduleTx = buildTransferTransaction(market, sellerAccountId, buyerAccountId, quantity, price)
      .schedule()
      .setScheduleMemo(tradeMemo())
      .freezeWith(client);
    const signed = await scheduleTx.sign(sellerKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.scheduleId || !receipt.scheduledTransactionId) {
      throw new Error("Schedule creation did not return a schedule id");
    }

    market.trade = {
      scheduleId: receipt.scheduleId.toString(),
      scheduledTransactionId: receipt.scheduledTransactionId.toString(),
      quantity,
      price,
      buyerChoice,
      sellerIsWallet: false,
      buyerIsWallet: buyerChoice === "buyer" && market.walletBuyer != null,
      status: "PENDING",
      settlementResult: null,
    };

    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}

/** Buyer (demo account) signs the pending schedule, triggering execution. */
export async function signTradeDemo(): Promise<MarketSnapshot> {
  const market = requireMarket();
  const trade = market.trade;
  if (!trade) throw new Error("No trade has been proposed yet.");
  if (trade.status !== "PENDING") throw new Error("Trade is not pending a signature.");
  if (trade.buyerIsWallet) throw new Error("Buyer is a connected wallet; use the wallet signing flow.");

  const client = getOperatorClient();
  try {
    const buyerKeyHex =
      trade.buyerChoice === "unverifiedBuyer" ? market.unverifiedBuyer.privateKey : market.buyer.privateKey;
    const buyerKey = PrivateKey.fromStringECDSA(buyerKeyHex);

    const signTx = new ScheduleSignTransaction().setScheduleId(trade.scheduleId).freezeWith(client);
    const signed = await signTx.sign(buyerKey);
    const response = await signed.execute(client);
    await response.getReceipt(client);

    await finalizeTrade(trade, client);
    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}

async function finalizeTrade(trade: NonNullable<Market["trade"]>, client: Client): Promise<void> {
  const settleReceipt = await new TransactionReceiptQuery()
    .setTransactionId(trade.scheduledTransactionId)
    .setValidateStatus(false)
    .execute(client);
  const resultCode = settleReceipt.status.toString();
  trade.status = resultCode === "SUCCESS" ? "SETTLED" : "REJECTED";
  trade.settlementResult = resultCode;
  // Even on REJECTED no balance moved, but the schedule's execution is itself a mirror-indexed
  // transaction; waiting for it keeps the snapshot we're about to build from going stale.
  await waitForMirrorIndexing(trade.scheduledTransactionId);
}

/** Builds the unsigned, wallet-payer ScheduleCreateTransaction for a HashPack seller to sign and submit. */
export async function prepareWalletSellerPropose(
  quantity: number,
  price: number,
  buyerChoice: BuyerChoice,
): Promise<string> {
  const market = requireMarket();
  if (!market.walletSeller) throw new Error("No wallet is onboarded as Seller.");
  assertNoPendingTrade(market);
  assertValidTerms(quantity, price);

  const client = getOperatorClient();
  try {
    const sellerAccountId = market.walletSeller.accountId;
    market.pendingWalletProposal = { quantity, price, buyerChoice };
    const buyerAccountId = resolveBuyerAccountId(market, buyerChoice);

    const scheduleTx = buildTransferTransaction(market, sellerAccountId, buyerAccountId, quantity, price)
      .schedule()
      .setScheduleMemo(tradeMemo())
      .setTransactionId(TransactionId.generate(sellerAccountId))
      .freezeWith(client);

    return transactionToBase64String(scheduleTx);
  } finally {
    client.close();
  }
}

/** Records the schedule a HashPack seller just created and submitted. */
export async function completeWalletSellerPropose(transactionId: string): Promise<MarketSnapshot> {
  const market = requireMarket();
  if (!market.walletSeller) throw new Error("No wallet is onboarded as Seller.");
  assertNoPendingTrade(market);
  const terms = market.pendingWalletProposal;
  if (!terms) throw new Error("No proposal was prepared for the wallet Seller.");
  if (!transactionId.startsWith(`${market.walletSeller.accountId}@`)) {
    throw new Error("That transaction was not submitted by the onboarded Seller wallet.");
  }
  const { quantity, price, buyerChoice } = terms;

  const client = getOperatorClient();
  try {
    const receipt = await new TransactionReceiptQuery().setTransactionId(transactionId).execute(client);
    if (!receipt.scheduleId || !receipt.scheduledTransactionId) {
      throw new Error("Schedule creation did not return a schedule id");
    }

    market.trade = {
      scheduleId: receipt.scheduleId.toString(),
      scheduledTransactionId: receipt.scheduledTransactionId.toString(),
      quantity,
      price,
      buyerChoice,
      sellerIsWallet: true,
      buyerIsWallet: buyerChoice === "buyer" && market.walletBuyer != null,
      status: "PENDING",
      settlementResult: null,
    };
    market.pendingWalletProposal = null;

    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}

/** Builds the unsigned, wallet-payer ScheduleSignTransaction for a HashPack buyer to sign and submit. */
export async function prepareWalletBuyerSign(): Promise<string> {
  const market = requireMarket();
  const trade = market.trade;
  if (!trade) throw new Error("No trade has been proposed yet.");
  if (!market.walletBuyer) throw new Error("No wallet is onboarded as Buyer.");
  if (trade.status !== "PENDING") throw new Error("Trade is not pending a signature.");
  if (!trade.buyerIsWallet) throw new Error("This trade's buyer is a demo account, not your wallet.");

  const client = getOperatorClient();
  try {
    const tx = new ScheduleSignTransaction()
      .setScheduleId(trade.scheduleId)
      .setTransactionId(TransactionId.generate(market.walletBuyer.accountId))
      .freezeWith(client);
    return transactionToBase64String(tx);
  } finally {
    client.close();
  }
}

/** Reads back the settlement result after a HashPack buyer signed the schedule. */
export async function completeWalletBuyerSign(transactionId: string): Promise<MarketSnapshot> {
  const market = requireMarket();
  const trade = market.trade;
  if (!trade) throw new Error("No trade has been proposed yet.");
  if (trade.status !== "PENDING" || !trade.buyerIsWallet) throw new Error("No trade is waiting for your signature.");

  const client = getOperatorClient();
  try {
    // Throws with the network's status if HashPack's ScheduleSign itself failed.
    await new TransactionReceiptQuery().setTransactionId(transactionId).execute(client);
    await finalizeTrade(trade, client);
    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}

/** Builds the unsigned, wallet-payer token association for onboarding a connected wallet. */
/**
 * The operator is the issuer and the treasury of both tokens, so it cannot also take a side of
 * the trade: funding it would be a transfer to itself that moves nothing.
 */
function assertNotOperator(client: Client, accountId: string): void {
  if (client.operatorAccountId?.toString() === accountId) {
    throw new Error(
      `${accountId} is the operator account that issues both tokens. Connect a different HashPack account to trade.`,
    );
  }
}

/**
 * Who may onboard: not the operator, not a demo party (that would, for example, hand KYC to the
 * unverified Buyer), not twice in the same role, and not while a trade is pending.
 * Returns whether the account already joined in the other role, so its association is done.
 */
function checkOnboarding(market: Market, client: Client, role: WalletRole, accountId: string): boolean {
  if (role !== "seller" && role !== "buyer") throw new Error('role must be "seller" or "buyer"');
  assertNotOperator(client, accountId);
  if ([market.seller, market.buyer, market.unverifiedBuyer].some(p => p.accountId === accountId)) {
    throw new Error(`${accountId} is one of the demo accounts. Connect your own HashPack account.`);
  }
  assertNoPendingTrade(market);
  const current = role === "seller" ? market.walletSeller : market.walletBuyer;
  if (current?.accountId === accountId) throw new Error(`${accountId} is already onboarded as ${role}.`);
  const other = role === "seller" ? market.walletBuyer : market.walletSeller;
  return other?.accountId === accountId;
}

/**
 * The unsigned token association for HashPack to sign, or null when the wallet already
 * associated both tokens while onboarding for the other role.
 */
export async function prepareOnboardWallet(role: WalletRole, accountId: string): Promise<string | null> {
  const market = requireMarket();
  const client = getOperatorClient();
  try {
    if (checkOnboarding(market, client, role, accountId)) return null;
    const tx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([market.securityTokenId, market.paymentTokenId])
      .setTransactionId(TransactionId.generate(accountId))
      .freezeWith(client);
    return transactionToBase64String(tx);
  } finally {
    client.close();
  }
}

/** Grants KYC and funds a wallet that associated both tokens, then adopts it for `role`. */
export async function completeOnboardWallet(role: WalletRole, accountId: string): Promise<MarketSnapshot> {
  const market = requireMarket();
  const client = getOperatorClient();
  try {
    const joinedInOtherRole = checkOnboarding(market, client, role, accountId);
    if (!joinedInOtherRole) await grantSecurityKyc(client, market.securityTokenId, accountId);

    const operatorId = client.operatorAccountId;
    if (!operatorId) throw new Error("Operator account id is not available on the client");

    const [tokenId, amount] =
      role === "seller"
        ? [market.securityTokenId, toBaseUnits(SELLER_INITIAL_SECURITY, SECURITY_DECIMALS)]
        : [market.paymentTokenId, toBaseUnits(BUYER_INITIAL_PAYMENT, PAYMENT_DECIMALS)];
    // Setup hands the whole initial supply to the demo parties; mint the wallet's share.
    await (await new TokenMintTransaction().setTokenId(tokenId).setAmount(amount).execute(client)).getReceipt(client);
    const response = await new TransferTransaction()
      .addTokenTransfer(tokenId, operatorId.toString(), -amount)
      .addTokenTransfer(tokenId, accountId, amount)
      .execute(client);
    await response.getReceipt(client);
    await waitForMirrorIndexing(response.transactionId.toString());

    if (role === "seller") market.walletSeller = { accountId };
    else market.walletBuyer = { accountId };
    return await buildSnapshot(market);
  } finally {
    client.close();
  }
}
