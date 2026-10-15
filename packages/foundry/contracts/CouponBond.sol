// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IHRC719 } from "./interfaces/IHRC719.sol";
import { IHederaScheduleService } from "./interfaces/IHederaScheduleService.sol";

/// A bond that pays its own coupons: the Hedera Schedule Service (HIP-1215) calls `payCoupon()`
/// at each due date, which pays every holder in an HTS stablecoin and schedules the next coupon
/// itself. The last coupon also repays principal and schedules nothing further. No keeper, bot
/// or off-chain automation is involved.
contract CouponBond {
    enum Status {
        CREATED,
        RUNNING,
        MATURED,
        STOPPED
    }

    /// Hedera Schedule Service system contract.
    address public constant HSS = 0x000000000000000000000000000000000000016B;

    /// HTS/HSS response code for success.
    int64 internal constant SUCCESS = 22;

    /// Caps holders so a coupon's transfers fit in one scheduled call.
    uint256 public constant MAX_HOLDERS = 10;

    /// Gas limit for the scheduled `payCoupon()` call; Hedera charges for at least 80% of this,
    /// so it is kept close to what up to MAX_HOLDERS stablecoin transfers actually need. HTS and
    /// HSS precompile calls are far more gas-hungry than plain EVM opcodes on Hedera: even
    /// `start()`'s single `scheduleCall` alone measured ~1.47M gas on testnet, and `payCoupon()`
    /// with transfers plus its own reschedule measured ~1.51M gas for just 2 holders.
    uint256 public constant GAS_LIMIT = 3_000_000;

    /// Consecutive seconds tried when a second is full, before giving up and emitting
    /// `SchedulingFailed`.
    uint256 public constant SCHEDULE_ATTEMPTS = 5;

    /// Scheduled for `dueTime + this`, not `dueTime`: see `_scheduleNext`.
    uint256 public constant SCHEDULE_SAFETY_BUFFER = 3;

    /// Conservative estimate of what one scheduled execution costs in HBAR, used only to tell
    /// the desk how much HBAR to send; never enforced on-chain. A successful 2-holder payCoupon
    /// (~1.51M gas) measured ~1.54 HBAR when charged as a normal call; a reverted scheduled call
    /// that barely runs (e.g. a due-time miss) measured ~0.026 HBAR. This sits comfortably above
    /// the successful case, with headroom for up to MAX_HOLDERS holders.
    uint256 public constant SCHEDULE_HBAR_COST = 2 ether;

    address public immutable owner;
    IERC20 public immutable stablecoin;
    string public bondName;
    uint256 public faceValue; // stablecoin smallest units per unit of position
    uint16 public couponRateBps; // 1 = 0.01%, 2000 = 20.00%
    uint32 public periodSeconds;
    uint8 public couponCount;

    uint8 public currentCoupon = 1; // 1-indexed; the coupon next due
    uint64 public nextCouponDue; // 0 until start()
    address public currentSchedule;
    Status public status = Status.CREATED;

    address[] public holders;
    mapping(address => uint256) public unitsOf;
    uint256 public totalUnits;

    event Allocated(address indexed holder, uint256 units);
    event Started(uint64 firstCouponDue);
    event CouponScheduled(uint8 indexed couponNumber, uint64 dueTime, address scheduleAddress);
    event CouponPaid(uint8 indexed couponNumber, uint256 totalPaid, bool principalRepaid);
    event CouponMissed(uint8 indexed couponNumber, uint256 needed, uint256 available);
    event SchedulingFailed(uint8 indexed couponNumber, uint64 dueTime);
    event Stopped();

    error NotOwner();
    error InvalidStatus();
    error InvalidTerms();
    error TooManyHolders();
    error NoHolders();
    error CouponNotDue();
    error AssociateFailed(uint256 responseCode);
    error StablecoinTransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address owner_,
        address stablecoin_,
        string memory name_,
        uint256 faceValue_,
        uint16 couponRateBps_,
        uint32 periodSeconds_,
        uint8 couponCount_
    ) payable {
        if (owner_ == address(0) || stablecoin_ == address(0)) revert InvalidTerms();
        if (faceValue_ == 0 || periodSeconds_ == 0 || couponCount_ == 0) revert InvalidTerms();
        if (couponRateBps_ == 0 || couponRateBps_ > 2000) revert InvalidTerms();

        owner = owner_;
        stablecoin = IERC20(stablecoin_);
        bondName = name_;
        faceValue = faceValue_;
        couponRateBps = couponRateBps_;
        periodSeconds = periodSeconds_;
        couponCount = couponCount_;

        uint256 responseCode = IHRC719(stablecoin_).associate();
        if (responseCode != 22) revert AssociateFailed(responseCode);
    }

    /// Lets the bond hold HBAR to pay for its own `scheduleCall` executions.
    receive() external payable { }

    /// Sets (or updates) a holder's position while the bond has not started.
    function allocate(address holder, uint256 units) external onlyOwner {
        if (status != Status.CREATED) revert InvalidStatus();
        if (holder == address(0) || units == 0) revert InvalidTerms();
        if (unitsOf[holder] == 0) {
            if (holders.length >= MAX_HOLDERS) revert TooManyHolders();
            holders.push(holder);
        }
        totalUnits = totalUnits - unitsOf[holder] + units;
        unitsOf[holder] = units;
        emit Allocated(holder, units);
    }

    /// Schedules coupon 1 for one period from now, then nobody needs to press anything again.
    function start() external onlyOwner {
        if (status != Status.CREATED) revert InvalidStatus();
        if (totalUnits == 0) revert NoHolders();

        status = Status.RUNNING;
        uint64 due = uint64(block.timestamp) + periodSeconds;
        nextCouponDue = due;
        emit Started(due);
        _scheduleNext(currentCoupon, due);
    }

    /// Cancels the pending schedule; no further coupon is paid.
    function stop() external onlyOwner {
        if (status != Status.RUNNING) revert InvalidStatus();
        if (currentSchedule != address(0)) {
            IHederaScheduleService(HSS).deleteSchedule(currentSchedule);
            currentSchedule = address(0);
        }
        status = Status.STOPPED;
        emit Stopped();
    }

    /// Called by the Hedera Schedule Service at the due time, or by anyone via `#pay-now` if
    /// scheduling ever failed. Pays every holder, reschedules the next coupon, and repays
    /// principal with the last coupon. Never reverts into a half-paid state: either everyone is
    /// paid in full, or nobody is (a miss, retried one period later).
    function payCoupon() external {
        if (status != Status.RUNNING) revert InvalidStatus();
        if (block.timestamp < nextCouponDue) revert CouponNotDue();

        currentSchedule = address(0); // the schedule that triggered this call has now executed
        bool isLast = currentCoupon == couponCount;
        uint256 perUnitCoupon = (faceValue * couponRateBps) / 10_000;
        uint256 len = holders.length;

        uint256 totalNeeded = 0;
        for (uint256 i = 0; i < len; i++) {
            uint256 units = unitsOf[holders[i]];
            totalNeeded += units * perUnitCoupon;
            if (isLast) totalNeeded += units * faceValue;
        }

        uint256 available = stablecoin.balanceOf(address(this));
        if (available < totalNeeded) {
            emit CouponMissed(currentCoupon, totalNeeded, available);
            uint64 retryDue = uint64(block.timestamp) + periodSeconds;
            nextCouponDue = retryDue;
            _scheduleNext(currentCoupon, retryDue);
            return;
        }

        for (uint256 i = 0; i < len; i++) {
            address holder = holders[i];
            uint256 units = unitsOf[holder];
            uint256 amount = units * perUnitCoupon;
            if (isLast) amount += units * faceValue;
            if (amount > 0 && !stablecoin.transfer(holder, amount)) revert StablecoinTransferFailed();
        }

        emit CouponPaid(currentCoupon, totalNeeded, isLast);

        if (isLast) {
            status = Status.MATURED;
        } else {
            currentCoupon += 1;
            uint64 nextDue = uint64(block.timestamp) + periodSeconds;
            nextCouponDue = nextDue;
            _scheduleNext(currentCoupon, nextDue);
        }
    }

    /// Coupons (including the current one, if not yet paid) left before maturity.
    function remainingCoupons() public view returns (uint8) {
        if (status == Status.MATURED || currentCoupon > couponCount) return 0;
        return couponCount - currentCoupon + 1;
    }

    /// Stablecoin still owed: every remaining coupon plus principal, due at or before maturity.
    function stablecoinNeeded() public view returns (uint256 total) {
        uint8 remaining = remainingCoupons();
        if (remaining == 0) return 0;
        uint256 perUnitCoupon = (faceValue * couponRateBps) / 10_000;
        uint256 len = holders.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 units = unitsOf[holders[i]];
            total += units * perUnitCoupon * remaining;
            total += units * faceValue;
        }
    }

    /// HBAR still needed to pay for the bond's own remaining scheduled executions. An estimate,
    /// generous on purpose so funding this amount is always enough.
    function hbarNeeded() public view returns (uint256) {
        if (status == Status.MATURED || status == Status.STOPPED) return 0;
        return uint256(remainingCoupons()) * SCHEDULE_HBAR_COST;
    }

    function getHolders() external view returns (address[] memory) {
        return holders;
    }

    function holdersLength() external view returns (uint256) {
        return holders.length;
    }

    /// Checks capacity before scheduling and tries the following seconds if a second is full.
    /// If every attempt fails, the coupon stays due and emits `SchedulingFailed` instead of
    /// stalling the bond; `payCoupon()` can still be called by anyone once due.
    ///
    /// Targets `dueTime + SCHEDULE_SAFETY_BUFFER`, not `dueTime` itself: a scheduled call's own
    /// consensus timestamp can land a second or so ahead of the EVM block.timestamp it executes
    /// with (observed on testnet), so scheduling for the exact due second can make `payCoupon`'s
    /// `block.timestamp >= nextCouponDue` guard revert on an otherwise-due coupon.
    function _scheduleNext(uint8 couponNumber, uint64 dueTime) internal {
        uint256 target = uint256(dueTime) + SCHEDULE_SAFETY_BUFFER;
        for (uint256 attempt = 0; attempt < SCHEDULE_ATTEMPTS; attempt++) {
            uint256 second = target + attempt;
            if (!IHederaScheduleService(HSS).hasScheduleCapacity(second, GAS_LIMIT)) continue;

            (int64 responseCode, address scheduleAddress) = IHederaScheduleService(HSS).scheduleCall(
                address(this), second, GAS_LIMIT, 0, abi.encodeWithSelector(this.payCoupon.selector)
            );

            if (responseCode == SUCCESS) {
                currentSchedule = scheduleAddress;
                // forge-lint: disable-next-line(unsafe-typecast)
                emit CouponScheduled(couponNumber, uint64(second), scheduleAddress);
                return;
            }
        }
        emit SchedulingFailed(couponNumber, dueTime);
    }
}
