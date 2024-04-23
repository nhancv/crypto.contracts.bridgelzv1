// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../layerzero/lzApp/NonblockingLzAppUpgradeable.sol";

/* solhint-disable no-inline-assembly */
contract CrossChainBridge is AccessControlUpgradeable, NonblockingLzAppUpgradeable {
  using SafeERC20 for IERC20;

  bytes32 internal constant _EDITOR_ROLE = keccak256("_EDITOR_ROLE");

  // Packet type
  uint16 public constant PT_SWAP = 0; // Swap request
  uint16 public constant PT_TEXT = 1; // Update text request

  string public message;

  // localTokenByRemote[remoteToken] = Local token address
  mapping(address => address) public localTokenByRemote;

  event ESwapFromChain(uint16 srcChainId, address remoteToken, address to, uint256 amount);
  event ETextFromChain(uint16 srcChainId, string text);

  /**
   * @dev Upgradable initializer
   */
  function CrossChainBridgeInit(address _lzEndpoint) external initializer {
    __AccessControl_init();
    __NonblockingLzAppUpgradeable_init(_lzEndpoint);

    address sender_ = _msgSender();
    _setupRole(DEFAULT_ADMIN_ROLE, sender_);
    _setupRole(_EDITOR_ROLE, sender_);
  }

  /**
   * @dev Config token
   */
  function configToken(address localToken, address remoteToken) external onlyRole(_EDITOR_ROLE) {
    localTokenByRemote[remoteToken] = localToken;
  }

  // @notice Estimate send fee PT_SWAP
  // _payInZRO is false and _adapterParams is empty as default
  function estimateSendTokensFee(
    uint16 _dstChainId,
    address _srcToken,
    address _toAddress,
    uint256 _amount
  ) external view virtual returns (uint256 nativeFee, uint256 zroFee) {
    bytes memory lzPayload = abi.encode(PT_SWAP, _srcToken, _toAddress, _amount);
    return lzEndpoint.estimateFees(_dstChainId, address(this), lzPayload, false, "");
  }

  // @notice Send token to destination chain
  function sendTokens(uint16 _dstChainId, address _srcToken, uint256 _amount) external payable {
    address sender_ = _msgSender();

    // Transfer token to bridge
    IERC20(_srcToken).safeTransferFrom(sender_, address(this), _amount);

    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_SWAP, _srcToken, sender_, _amount);
    _lzSimpleSend(_dstChainId, lzPayload, sender_);
  }

  // @notice Estimate send fee PT_SWAP
  // _payInZRO is false and _adapterParams is empty as default
  function estimateUpdateTextFee(
    uint16 _dstChainId,
    string memory _text
  ) external view virtual returns (uint256 nativeFee, uint256 zroFee) {
    bytes memory lzPayload = abi.encode(PT_TEXT, _text);
    return lzEndpoint.estimateFees(_dstChainId, address(this), lzPayload, false, "");
  }

  // @notice Send token to destination chain
  function updateText(uint16 _dstChainId, string memory _text) external payable {
    address sender_ = _msgSender();

    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_TEXT, _text);
    _lzSimpleSend(_dstChainId, lzPayload, sender_);
  }

  // @notice Simple lzSend
  // @param _refundAddress = sender_
  // @param _zroPaymentAddress = "0x0000000000000000000000000000000000000000"
  // @param _adapterParams = "0x"
  function _lzSimpleSend(uint16 _dstChainId, bytes memory _payload, address _refundAddress) internal virtual {
    _lzSend(_dstChainId, _payload, payable(_refundAddress), address(0), "", msg.value);
  }

  // @notice Override receive cross-chain message
  function _nonblockingLzReceive(
    uint16 _srcChainId,
    bytes memory, // _srcAddress
    uint64, // _nonce
    bytes memory _payload
  ) internal virtual override {
    uint16 packetType;
    assembly {
      packetType := mload(add(_payload, 32))
    }

    // Perform logic based on package type
    if (packetType == PT_SWAP) {
      _swapAck(_srcChainId, _payload);
    } else if (packetType == PT_TEXT) {
      _textAck(_srcChainId, _payload);
    } else {
      revert("Bridge: unknown packet type");
    }
  }

  // Perform swap
  function _swapAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, address remoteToken, address toAddress, uint256 amount) = abi.decode(
      _payload,
      (uint16, address, address, uint256)
    );

    IERC20(localTokenByRemote[remoteToken]).safeTransfer(toAddress, amount);
    emit ESwapFromChain(_srcChainId, remoteToken, toAddress, amount);
  }

  // Perform update text
  function _textAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, string memory text) = abi.decode(_payload, (uint16, string));

    message = text;
    emit ETextFromChain(_srcChainId, text);
  }
}
