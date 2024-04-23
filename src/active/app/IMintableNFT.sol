// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface IMintableERC721 {
  function fMint(address _pTo, uint256 _pId) external; /* onlyRole(MINTER_ROLE) */
}

interface IMintableERC1155 {
  function fMint(address _pTo, uint256 _pId, uint256 _pAmount) external; /* onlyRole(MINTER_ROLE) */
}
