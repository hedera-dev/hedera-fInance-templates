// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Stands in for the HTS stablecoin in unit tests: a plain ERC20 plus the HIP-719 `associate()`
/// surface `CouponBond` calls in its constructor. Real HTS tokens auto-associate their treasury
/// and anyone else who calls `associate()`; this mock just reports success.
contract MockStablecoin is ERC20 {
    constructor(address treasury, uint256 initialSupply) ERC20("Mock USD", "mUSD") {
        _mint(treasury, initialSupply);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Matches IHRC719.associate(); always succeeds.
    function associate() external pure returns (uint256 responseCode) {
        return 22;
    }
}
