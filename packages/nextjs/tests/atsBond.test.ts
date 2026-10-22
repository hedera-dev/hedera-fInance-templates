/**
 * The two pieces of the issue form that decide what gets signed, exercised without a network.
 *
 * Run with `yarn check-ats` — compiled by tsc and run by node's own test runner, so there is
 * no test framework to install.
 */
import { START_DELAY_SECONDS, bondDates } from "../utils/ats/dates";
import { validateIsin } from "../utils/ats/isin";
import assert from "node:assert/strict";
import test from "node:test";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString();

test("an ISIN is accepted only with a correct check digit", () => {
  assert.equal(validateIsin("US0378331005").valid, true);
  assert.equal(validateIsin("us0378331005").valid, true, "case is normalised");

  const wrongDigit = validateIsin("US0378331006");
  assert.equal(wrongDigit.valid, false);
  assert.match(wrongDigit.valid === false ? wrongDigit.reason : "", /check digit/i);

  assert.equal(validateIsin("US037833100").valid, false, "too short");
  assert.equal(validateIsin("U50378331005").valid, false, "country code must be letters");
});

/**
 * The case this exists for: adding months to a day the target month does not have used to
 * overflow into the month after. A one-month bond issued on 31 January matured in March.
 */
test("maturity lands in the month asked for, even from a month end", () => {
  const { startingDate, maturityDate } = bondDates(at("2026-01-31T12:00:00Z"), 1);

  assert.equal(iso(startingDate), "2026-01-31T12:05:00.000Z", "start is a few minutes out");
  assert.equal(iso(maturityDate), "2026-02-28T12:05:00.000Z", "clamped to the last day of February");
});

test("a leap year gets its extra day", () => {
  const { maturityDate } = bondDates(at("2028-01-31T12:00:00Z"), 1);
  assert.equal(iso(maturityDate), "2028-02-29T12:05:00.000Z");
});

test("twelve months is the same date a year later", () => {
  const { maturityDate } = bondDates(at("2026-03-15T09:30:00Z"), 12);
  assert.equal(iso(maturityDate), "2027-03-15T09:35:00.000Z");
});

test("maturity is always after the start, for every month count the form allows", () => {
  const now = at("2026-01-31T23:59:00Z");
  for (let months = 1; months <= 120; months++) {
    const { startingDate, maturityDate } = bondDates(now, months);
    assert.equal(startingDate, BigInt(now + START_DELAY_SECONDS));
    assert.ok(maturityDate > startingDate, `maturity must follow the start at ${months} months`);
  }
});
