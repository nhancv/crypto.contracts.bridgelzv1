// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract MockERC20Upgradeable is ERC20Upgradeable {
  function MockERC20UpgradeableInit(
    string memory _name,
    string memory _symbol,
    uint256 _initialSupply
  ) external initializer {
    __ERC20_init(_name, _symbol);
    _mint(msg.sender, _initialSupply * 1e18);
  }
}
