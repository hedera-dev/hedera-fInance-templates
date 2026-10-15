// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.4.9 <0.9.0;

/// Re-export of the HIP-719 token-proxy interface so contracts here only depend on
/// `contracts/interfaces/`, not on test/lib paths. Signature matches `hedera-forking/IHRC719.sol`.
/// https://hips.hedera.com/hip/hip-719
interface IHRC719 {
    /// @notice Associates the calling account with the token
    /// @return responseCode 22 = SUCCESS
    function associate() external returns (uint256 responseCode);

    /// @notice Dissociates the calling account from the token
    /// @return responseCode 22 = SUCCESS
    function dissociate() external returns (uint256 responseCode);

    /// @notice Whether the calling account is associated with the token
    function isAssociated() external view returns (bool associated);
}
