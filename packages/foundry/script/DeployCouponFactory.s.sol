//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { CouponBondFactory } from "../contracts/CouponBondFactory.sol";
import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";

/**
 * @notice Deploys only the coupon bond factory.
 *
 * Example: yarn coupons:deploy
 */
contract DeployCouponFactory is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        CouponBondFactory factory = new CouponBondFactory();
        deployments.push(Deployment({ name: "CouponBondFactory", addr: address(factory) }));
    }
}
