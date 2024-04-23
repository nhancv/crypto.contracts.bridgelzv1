// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

contract MockERC1155Upgradeable is ERC1155Upgradeable, AccessControlUpgradeable {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  /**
   * @dev Upgradable initializer
   */
  function MockERC1155UpgradeableInit() external initializer {
    __ERC1155_init("");

    __AccessControl_init();
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _setupRole(MINTER_ROLE, msg.sender);

    _mint(msg.sender, 0, 1, "");
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(
    bytes4 _interfaceId
  ) public view virtual override(ERC1155Upgradeable, AccessControlUpgradeable) returns (bool) {
    return super.supportsInterface(_interfaceId);
  }

  /**
   * @dev Allow mint
   */
  function fMint(address _pAccount, uint256 _pId, uint256 _pAmount) external onlyRole(MINTER_ROLE) {
    _mint(_pAccount, _pId, _pAmount, "");
  }
}
