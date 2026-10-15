// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CouponBond } from "./CouponBond.sol";

/// Deploys `CouponBond`s owned by the caller. Deploy once; every bond issued afterwards goes
/// through `createBond`.
contract CouponBondFactory {
    event BondCreated(address indexed issuer, address indexed bond);

    /// Deploys a new `CouponBond` owned by the caller and forwards any HBAR sent with the call
    /// so the bond can start paying for its own schedules right away.
    function createBond(
        string calldata name,
        address stablecoin,
        uint256 faceValue,
        uint16 couponRateBps,
        uint32 periodSeconds,
        uint8 couponCount
    ) external payable returns (address bond) {
        CouponBond created = new CouponBond{ value: msg.value }(
            msg.sender, stablecoin, name, faceValue, couponRateBps, periodSeconds, couponCount
        );
        bond = address(created);
        emit BondCreated(msg.sender, bond);
    }
}
