// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IHRC719 } from "hedera-forking/IHRC719.sol";
import { IHederaScheduleService } from "./interfaces/IHederaScheduleService.sol";

/// @title CouponBond
/// @notice A coupon bond that pays its own coupons. Through the Hedera Schedule Service
/// (HIP-1215), `start()` schedules coupon 1; at each due date the network calls `payCoupon()`
/// back, which pays every holder in an HTS stablecoin and schedules the next coupon itself.
/// The last coupon also repays principal and schedules nothing further. No keeper, bot or
/// off-chain automation is involved.
contract CouponBond is Ownable {
    enum Status {
        CREATED,
        RUNNING,
        MATURED,
        STOPPED
    }

    uint256 public constant MAX_HOLDERS = 10;
    uint256 public constant MAX_SCHEDULE_ATTEMPTS = 10;
    /// Base gas for one `payCoupon()` run: an HTS ERC-20 `balanceOf`, plus (on every coupon but
    /// the last) rescheduling itself, which alone measures ~1.4M gas on testnet for the
    /// `hasScheduleCapacity` + `scheduleCall` pair -- HTS system-contract calls are far pricier
    /// than ordinary EVM gas.
    uint256 public constant COUPON_GAS_BASE = 2_000_000;
    /// Extra gas per holder, covering that holder's HTS ERC-20 `transfer`.
    uint256 public constant COUPON_GAS_PER_HOLDER = 150_000;
    /// Seconds added to a schedule's requested expiry over its nominal due time; see `_schedule`.
    uint256 public constant SCHEDULE_FIRING_MARGIN = 3;
    int64 private constant HSS_SUCCESS = 22;

    IHederaScheduleService private constant HSS = IHederaScheduleService(address(uint160(0x16b)));

    string public name;
    IERC20Metadata public immutable stablecoin;
    /// @notice Face value per unit, in whole stablecoin (not scaled by decimals).
    uint256 public immutable faceValue;
    /// @notice Coupon rate in basis points of face value paid per period (1% = 100 bps).
    uint256 public immutable couponRateBps;
    uint256 public immutable periodSeconds;
    uint256 public immutable couponCount;
    uint256 private immutable tokenScale; // 10 ** stablecoin.decimals()

    Status public status;
    /// @notice 1-based index of the coupon currently due; 0 before `start()`.
    uint256 public currentCoupon;
    /// @notice Consensus time at/after which the current coupon may be paid.
    uint256 public dueTime;
    /// @notice Address of the pending schedule for the current coupon, or the zero address.
    address public currentSchedule;

    address[] public holders;
    mapping(address => uint256) public unitsOf;

    event Allocated(address indexed holder, uint256 units);
    event Started(uint256 dueTime);
    event CouponScheduled(uint256 indexed coupon, address indexed scheduleAddress, uint256 expirySecond);
    event SchedulingFailed(uint256 indexed coupon, uint256 dueTime);
    event CouponPaid(uint256 indexed coupon, uint256 totalPaid);
    event CouponMissed(uint256 indexed coupon);
    event PrincipalRepaid(uint256 indexed coupon, uint256 totalPaid);
    event Stopped();

    error NotCreated();
    error NotRunning();
    error NotDue();
    error NoHolders();
    error TooManyHolders();
    error ZeroAddress();
    error TransferFailed();
    error AssociateFailed(uint256 responseCode);
    error DeleteScheduleFailed(int64 responseCode);

    constructor(
        address issuer,
        string memory bondName,
        address stablecoin_,
        uint256 faceValue_,
        uint256 couponRateBps_,
        uint256 periodSeconds_,
        uint256 couponCount_
    ) payable Ownable(issuer) {
        name = bondName;
        stablecoin = IERC20Metadata(stablecoin_);
        faceValue = faceValue_;
        couponRateBps = couponRateBps_;
        periodSeconds = periodSeconds_;
        couponCount = couponCount_;
        tokenScale = 10 ** stablecoin.decimals();

        uint256 rc = IHRC719(stablecoin_).associate();
        if (rc != 22) revert AssociateFailed(rc);
    }

    /// Accepts HBAR so it can pay for its own scheduled calls (see `scheduleCall` in
    /// IHederaScheduleService: the calling contract is the payer of its scheduled executions).
    receive() external payable { }

    /// @notice Sets (or updates, while `CREATED`) a holder's allocated units. Issuer only.
    function allocate(address holder, uint256 units) external onlyOwner {
        if (status != Status.CREATED) revert NotCreated();
        if (holder == address(0)) revert ZeroAddress();
        if (unitsOf[holder] == 0 && units > 0) {
            if (holders.length >= MAX_HOLDERS) revert TooManyHolders();
            holders.push(holder);
        }
        unitsOf[holder] = units;
        emit Allocated(holder, units);
    }

    /// @notice Schedules coupon 1 for one period from now. Issuer only, once per bond.
    function start() external onlyOwner {
        if (status != Status.CREATED) revert NotCreated();
        if (holders.length == 0) revert NoHolders();
        status = Status.RUNNING;
        currentCoupon = 1;
        _schedule(block.timestamp + periodSeconds);
        emit Started(dueTime);
    }

    /// @notice Cancels the pending schedule and stops the bond. Issuer only.
    function stop() external onlyOwner {
        if (status != Status.RUNNING) revert NotRunning();
        if (currentSchedule != address(0)) {
            int64 rc = HSS.deleteSchedule(currentSchedule);
            if (rc != HSS_SUCCESS) revert DeleteScheduleFailed(rc);
            currentSchedule = address(0);
        }
        status = Status.STOPPED;
        emit Stopped();
    }

    /// @notice Pays the current coupon and schedules the next one. Called by the Hedera
    /// Schedule Service at the due time, but may be called by anyone (e.g. `#pay-now`) once due.
    function payCoupon() external {
        if (status != Status.RUNNING) revert NotRunning();
        if (block.timestamp < dueTime) revert NotDue();

        uint256 coupon = currentCoupon;
        bool isLast = coupon == couponCount;
        uint256 n = holders.length;
        uint256[] memory amounts = new uint256[](n);
        uint256 totalNeeded;
        for (uint256 i = 0; i < n; i++) {
            uint256 units = unitsOf[holders[i]];
            uint256 amt = _couponAmount(units);
            if (isLast) amt += _principalAmount(units);
            amounts[i] = amt;
            totalNeeded += amt;
        }

        if (stablecoin.balanceOf(address(this)) < totalNeeded) {
            emit CouponMissed(coupon);
            _schedule(block.timestamp + periodSeconds);
            return;
        }

        // Capture before `_schedule` overwrites `dueTime` for the next coupon.
        uint256 nextDue = dueTime + periodSeconds;
        uint256 totalPaid;
        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] == 0) continue;
            if (!stablecoin.transfer(holders[i], amounts[i])) revert TransferFailed();
            totalPaid += amounts[i];
        }

        if (isLast) {
            status = Status.MATURED;
            currentSchedule = address(0);
            emit PrincipalRepaid(coupon, totalPaid);
        } else {
            currentCoupon = coupon + 1;
            emit CouponPaid(coupon, totalPaid);
            _schedule(nextDue);
        }
    }

    function holdersCount() external view returns (uint256) {
        return holders.length;
    }

    function allHolders() external view returns (address[] memory) {
        return holders;
    }

    function couponAmountFor(address holder) external view returns (uint256) {
        return _couponAmount(unitsOf[holder]);
    }

    function principalAmountFor(address holder) external view returns (uint256) {
        return _principalAmount(unitsOf[holder]);
    }

    /// @notice Total stablecoin still needed to fully pay every remaining coupon and principal.
    function stablecoinNeeded() external view returns (uint256) {
        // Once matured or stopped, nothing more is ever paid -- including principal, already repaid at maturity.
        if (status == Status.MATURED || status == Status.STOPPED) return 0;

        uint256 remaining =
            status == Status.CREATED ? couponCount : (couponCount >= currentCoupon ? couponCount - currentCoupon + 1 : 0);
        uint256 n = holders.length;
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            uint256 units = unitsOf[holders[i]];
            total += _couponAmount(units) * remaining + _principalAmount(units);
        }
        return total;
    }

    function _couponAmount(uint256 units) internal view returns (uint256) {
        return (units * faceValue * couponRateBps * tokenScale) / 10_000;
    }

    function _principalAmount(uint256 units) internal view returns (uint256) {
        return units * faceValue * tokenScale;
    }

    /// Tries to schedule `payCoupon()` at `at`, walking forward a few seconds if a second is
    /// full. `dueTime` is set to the originally intended time regardless of scheduling outcome,
    /// so the coupon is considered due even if scheduling itself fails (see `SchedulingFailed`).
    ///
    /// The schedule itself is requested a few seconds after `at`: a transaction's `block.timestamp`
    /// is observed to read slightly behind its own consensus time, so asking the network to fire
    /// exactly at `at` makes the due-time guard in `payCoupon` see `block.timestamp < dueTime` and
    /// revert on first attempt. The firing margin only delays *when* the call executes; `dueTime`
    /// (what `payCoupon` checks against, and what the UI shows) stays the clean period boundary.
    function _schedule(uint256 at) internal {
        dueTime = at;
        uint256 expiry = at + SCHEDULE_FIRING_MARGIN;
        uint256 gasLimit = COUPON_GAS_BASE + holders.length * COUPON_GAS_PER_HOLDER;
        for (uint256 i = 0; i < MAX_SCHEDULE_ATTEMPTS; i++) {
            if (HSS.hasScheduleCapacity(expiry, gasLimit)) {
                (int64 rc, address scheduleAddress) = HSS.scheduleCall(
                    address(this), expiry, gasLimit, 0, abi.encodeWithSelector(this.payCoupon.selector)
                );
                if (rc == HSS_SUCCESS && scheduleAddress != address(0)) {
                    currentSchedule = scheduleAddress;
                    emit CouponScheduled(currentCoupon, scheduleAddress, expiry);
                    return;
                }
            }
            unchecked {
                expiry++;
            }
        }
        currentSchedule = address(0);
        emit SchedulingFailed(currentCoupon, at);
    }
}
