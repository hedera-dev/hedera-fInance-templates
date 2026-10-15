// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Test } from "forge-std/Test.sol";
import { CouponBond } from "../contracts/CouponBond.sol";
import { MockHederaScheduleService } from "./mocks/MockHederaScheduleService.sol";
import { MockStablecoin } from "./mocks/MockStablecoin.sol";

contract CouponBondTest is Test {
    address constant HSS_ADDR = 0x000000000000000000000000000000000000016B;

    CouponBond bond;
    MockStablecoin stable;
    MockHederaScheduleService schedule;

    address owner = address(this);
    address holderA = makeAddr("holderA");
    address holderB = makeAddr("holderB");

    uint256 constant FACE_VALUE = 1000 * 10 ** 6; // 1000 stablecoin units, 6 decimals
    uint16 constant RATE_BPS = 100; // 1%
    uint32 constant PERIOD = 60;
    uint8 constant COUPON_COUNT = 2;

    // perUnitCoupon = 1000e6 * 100 / 10000 = 10e6; 15 units total -> 150e6 per coupon,
    // 15000e6 principal; matches the spec's worked example (150 + 150 + 15000 = 15300 stablecoin).
    uint256 constant COUPON_TOTAL = 150 * 10 ** 6;
    uint256 constant PRINCIPAL_TOTAL = 15000 * 10 ** 6;

    function setUp() public {
        MockHederaScheduleService impl = new MockHederaScheduleService();
        vm.etch(HSS_ADDR, address(impl).code);
        schedule = MockHederaScheduleService(HSS_ADDR);
        schedule.setHasCapacity(true);
        schedule.setScheduleResponseCode(22);
        schedule.setDeleteResponseCode(22);

        stable = new MockStablecoin(owner, 1_000_000 * 10 ** 6);

        bond = new CouponBond(owner, address(stable), "Test Bond", FACE_VALUE, RATE_BPS, PERIOD, COUPON_COUNT);
        bond.allocate(holderA, 10);
        bond.allocate(holderB, 5);

        vm.deal(address(bond), 10 ether);
    }

    function _fundFully() internal {
        stable.transfer(address(bond), COUPON_TOTAL * COUPON_COUNT + PRINCIPAL_TOTAL);
    }

    // --- paying and rescheduling ---

    function test_start_schedulesFirstCoupon() public {
        bond.start();
        assertEq(uint8(bond.status()), uint8(CouponBond.Status.RUNNING));
        assertTrue(bond.currentSchedule() != address(0));
        assertEq(bond.nextCouponDue(), uint64(block.timestamp) + PERIOD);
    }

    function test_payCoupon_paysAllHoldersAndReschedulesNext() public {
        _fundFully();
        bond.start();
        vm.warp(bond.nextCouponDue());

        vm.expectEmit(true, true, true, true);
        emit CouponBond.CouponPaid(1, COUPON_TOTAL, false);
        bond.payCoupon();

        assertEq(stable.balanceOf(holderA), (COUPON_TOTAL * 10) / 15);
        assertEq(stable.balanceOf(holderB), (COUPON_TOTAL * 5) / 15);
        assertEq(bond.currentCoupon(), 2);
        assertEq(uint8(bond.status()), uint8(CouponBond.Status.RUNNING));
        assertTrue(bond.currentSchedule() != address(0));
    }

    function test_payCoupon_callableByAnyone() public {
        _fundFully();
        bond.start();
        vm.warp(bond.nextCouponDue());

        vm.prank(makeAddr("rando"));
        bond.payCoupon();

        assertEq(bond.currentCoupon(), 2);
    }

    // --- due-time guard ---

    function test_payCoupon_revertsBeforeDue() public {
        _fundFully();
        bond.start();
        vm.warp(bond.nextCouponDue() - 1);

        vm.expectRevert(CouponBond.CouponNotDue.selector);
        bond.payCoupon();
    }

    function test_payCoupon_revertsWhenNotRunning() public {
        vm.expectRevert(CouponBond.InvalidStatus.selector);
        bond.payCoupon();
    }

    function test_payCoupon_neverPaysTwiceForSameCoupon() public {
        _fundFully();
        bond.start();
        vm.warp(bond.nextCouponDue());
        bond.payCoupon();

        // Coupon 1 is settled; calling again now pays (or evaluates) coupon 2, not coupon 1 again.
        uint256 balanceAfterFirst = stable.balanceOf(holderA);
        vm.expectRevert(CouponBond.CouponNotDue.selector);
        bond.payCoupon();
        assertEq(stable.balanceOf(holderA), balanceAfterFirst);
    }

    // --- missed coupon and retry ---

    function test_payCoupon_missesWhenUnderfundedThenRetrySucceeds() public {
        // Fund less than coupon 1 needs.
        stable.transfer(address(bond), COUPON_TOTAL - 1);
        bond.start();
        vm.warp(bond.nextCouponDue());

        vm.expectEmit(true, true, true, true);
        emit CouponBond.CouponMissed(1, COUPON_TOTAL, COUPON_TOTAL - 1);
        bond.payCoupon();

        assertEq(bond.currentCoupon(), 1, "missed coupon is retried, not skipped");
        assertEq(stable.balanceOf(holderA), 0, "nothing paid on a miss");
        uint64 retryDue = bond.nextCouponDue();
        assertEq(retryDue, uint64(block.timestamp) + PERIOD);

        // Fund the rest before the retry; it now pays in full.
        stable.transfer(address(bond), 1);
        vm.warp(retryDue);
        bond.payCoupon();
        assertEq(bond.currentCoupon(), 2);
        assertEq(stable.balanceOf(holderA), (COUPON_TOTAL * 10) / 15);
    }

    // --- maturity ---

    function test_maturity_paysPrincipalAndSchedulesNothingFurther() public {
        _fundFully();
        bond.start();

        vm.warp(bond.nextCouponDue());
        bond.payCoupon(); // coupon 1

        vm.warp(bond.nextCouponDue());
        vm.expectEmit(true, true, true, true);
        emit CouponBond.CouponPaid(2, COUPON_TOTAL + PRINCIPAL_TOTAL, true);
        bond.payCoupon(); // coupon 2 (last): coupon + principal

        assertEq(uint8(bond.status()), uint8(CouponBond.Status.MATURED));
        assertEq(stable.balanceOf(holderA), ((COUPON_TOTAL * 10) / 15) * 2 + FACE_VALUE * 10);
        assertEq(stable.balanceOf(holderB), ((COUPON_TOTAL * 5) / 15) * 2 + FACE_VALUE * 5);

        address scheduleBeforeMaturity = bond.currentSchedule();
        assertEq(scheduleBeforeMaturity, address(0), "nothing scheduled after the last coupon");

        vm.expectRevert(CouponBond.InvalidStatus.selector);
        bond.payCoupon();
    }

    // --- stopping ---

    function test_stop_cancelsPendingScheduleAndHalts() public {
        bond.start();
        address pending = bond.currentSchedule();
        assertTrue(pending != address(0));

        bond.stop();

        assertEq(uint8(bond.status()), uint8(CouponBond.Status.STOPPED));
        assertEq(schedule.lastDeletedSchedule(), pending);
        assertEq(bond.currentSchedule(), address(0));

        vm.warp(block.timestamp + PERIOD + 1);
        vm.expectRevert(CouponBond.InvalidStatus.selector);
        bond.payCoupon();
    }

    function test_stop_onlyOwner() public {
        bond.start();
        vm.prank(makeAddr("rando"));
        vm.expectRevert(CouponBond.NotOwner.selector);
        bond.stop();
    }

    // --- capacity fallback ---

    function test_schedulingFailure_emitsEventAndPayNowStillWorks() public {
        schedule.setHasCapacity(false);

        vm.expectEmit(true, true, true, true);
        emit CouponBond.SchedulingFailed(1, uint64(block.timestamp) + PERIOD);
        bond.start();

        assertEq(bond.currentSchedule(), address(0));
        assertEq(uint8(bond.status()), uint8(CouponBond.Status.RUNNING));

        // No automation ever ran; #pay-now (anyone calling payCoupon) still pays once due.
        _fundFully();
        vm.warp(bond.nextCouponDue());
        bond.payCoupon();
        assertEq(bond.currentCoupon(), 2);
    }

    // --- allocation ---

    function test_allocate_capsAtMaxHolders() public {
        CouponBond fresh = new CouponBond(owner, address(stable), "Capped", FACE_VALUE, RATE_BPS, PERIOD, 1);
        for (uint256 i = 0; i < fresh.MAX_HOLDERS(); i++) {
            fresh.allocate(makeAddr(string(abi.encodePacked("holder", i))), 1);
        }
        vm.expectRevert(CouponBond.TooManyHolders.selector);
        fresh.allocate(makeAddr("oneTooMany"), 1);
    }

    function test_allocate_updatesExistingHolderWithoutDuplicating() public {
        bond.allocate(holderA, 20);
        assertEq(bond.unitsOf(holderA), 20);
        assertEq(bond.holdersLength(), 2);
        assertEq(bond.totalUnits(), 25);
    }

    function test_allocate_onlyWhileCreated() public {
        bond.start();
        vm.expectRevert(CouponBond.InvalidStatus.selector);
        bond.allocate(holderA, 1);
    }
}
