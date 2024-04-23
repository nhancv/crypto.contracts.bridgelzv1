// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICrossChainBridge {
  function estimateUpdateTextFee(
    uint16 _dstChainId,
    string memory _text,
    bool _payInZRO,
    bytes calldata _adapterParam
  ) external view returns (uint256 nativeFee, uint256 zroFee);

  function updateText(
    uint16 _dstChainId,
    string memory _text,
    address payable _refundAddress,
    address _zroPaymentAddress,
    bytes calldata _adapterParams
  ) external payable;
}

/* solhint-disable no-inline-assembly */
contract CrossChainBridgeAgent is AccessControlUpgradeable {
  using SafeERC20 for IERC20;

  bytes32 internal constant _EDITOR_ROLE = keccak256("_EDITOR_ROLE");

  ICrossChainBridge public bridge;
  uint256 public defaultGasLimit;

  // solhint-disable-next-line no-empty-blocks
  receive() external payable {}

  /**
   * @dev Upgradable initializer
   */
  function CrossChainBridgeAgentInit(ICrossChainBridge _bridge) external initializer {
    __AccessControl_init();
    address sender_ = _msgSender();
    _setupRole(DEFAULT_ADMIN_ROLE, sender_);
    _setupRole(_EDITOR_ROLE, sender_);

    bridge = _bridge;
    defaultGasLimit = 200_000;
  }

  /**
   * @dev Set gas limit
   */
  function setDefaultGasLimit(uint256 _defaultGasLimit) external onlyRole(_EDITOR_ROLE) {
    defaultGasLimit = _defaultGasLimit;
  }

  /**
   * @dev Request update text to bridge
   */
  function reqUpdateText(uint16 _dstChainId, string memory _text) external {
    bytes memory adapterParams = abi.encodePacked(uint16(1), defaultGasLimit);
    (uint256 nativeFee, ) = bridge.estimateUpdateTextFee(_dstChainId, _text, false, adapterParams);
    bridge.updateText{ value: nativeFee }(_dstChainId, _text, payable(address(this)), address(this), adapterParams);
  }
}
