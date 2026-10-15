/**
 * Minimal ABIs for CouponBond / CouponBondFactory, hand-written to mirror
 * packages/foundry/contracts/CouponBond.sol and CouponBondFactory.sol.
 *
 * Only the factory is in packages/nextjs/contracts/deployedContracts.ts (one factory, many
 * bonds); each issued bond's address is runtime data, so the server reads/writes/decodes it
 * with this ABI directly instead of going through the generated contracts file.
 */
export const couponBondFactoryAbi = [
  {
    type: "function",
    name: "createBond",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "stablecoin", type: "address" },
      { name: "faceValue", type: "uint256" },
      { name: "couponRateBps", type: "uint16" },
      { name: "periodSeconds", type: "uint32" },
      { name: "couponCount", type: "uint8" },
    ],
    outputs: [{ name: "bond", type: "address" }],
  },
  {
    type: "event",
    name: "BondCreated",
    inputs: [
      { name: "issuer", type: "address", indexed: true },
      { name: "bond", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

export const couponBondAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "stablecoin", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "bondName", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "faceValue", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "couponRateBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "periodSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "couponCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "currentCoupon", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "nextCouponDue", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "currentSchedule", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "status", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalUnits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "unitsOf",
    stateMutability: "view",
    inputs: [{ name: "holder", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "getHolders", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "stablecoinNeeded", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hbarNeeded", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "allocate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "holder", type: "address" },
      { name: "units", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "start", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "stop", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "payCoupon", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "event",
    name: "Allocated",
    inputs: [
      { name: "holder", type: "address", indexed: true },
      { name: "units", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Started",
    inputs: [{ name: "firstCouponDue", type: "uint64", indexed: false }],
    anonymous: false,
  },
  {
    type: "event",
    name: "CouponScheduled",
    inputs: [
      { name: "couponNumber", type: "uint8", indexed: true },
      { name: "dueTime", type: "uint64", indexed: false },
      { name: "scheduleAddress", type: "address", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CouponPaid",
    inputs: [
      { name: "couponNumber", type: "uint8", indexed: true },
      { name: "totalPaid", type: "uint256", indexed: false },
      { name: "principalRepaid", type: "bool", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CouponMissed",
    inputs: [
      { name: "couponNumber", type: "uint8", indexed: true },
      { name: "needed", type: "uint256", indexed: false },
      { name: "available", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SchedulingFailed",
    inputs: [
      { name: "couponNumber", type: "uint8", indexed: true },
      { name: "dueTime", type: "uint64", indexed: false },
    ],
    anonymous: false,
  },
  { type: "event", name: "Stopped", inputs: [], anonymous: false },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Status enum order from CouponBond.sol. */
export const BOND_STATUS = ["CREATED", "RUNNING", "MATURED", "STOPPED"] as const;
export type BondStatus = (typeof BOND_STATUS)[number];
