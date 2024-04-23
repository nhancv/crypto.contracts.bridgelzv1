// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "../layerzero/lzApp/NonblockingLzAppUpgradeable.sol";
import "./IMintableNFT.sol";

/* solhint-disable no-inline-assembly */
contract CrossChainBridgeSimple is AccessControlUpgradeable, NonblockingLzAppUpgradeable {
  using SafeERC20 for IERC20;

  bytes32 internal constant _EDITOR_ROLE = keccak256("_EDITOR_ROLE");

  // localTokenByRemote[remoteToken] = Local token address
  mapping(address => address) public localTokenByRemote;
  // Packet types
  uint16 public constant PT_TEXT = 0; // Update text request
  uint16 public constant PT_SWAP_TOKEN = 1; // Swap token request
  uint16 public constant PT_SWAP_NFT = 2; // Swap NFT ERC721 request
  uint16 public constant PT_SWAP_FT = 3; // Swap FT ERC1155 request

  string public message;

  event ETextFromChain(uint16 srcChainId, string text);
  event ESwapTokenFromChain(uint16 srcChainId, address remoteToken, address to, uint256 amount);
  event ESwapNFTFromChain(uint16 srcChainId, address remoteToken, address to, uint256 nftId);
  event ESwapFTFromChain(uint16 srcChainId, address remoteToken, address to, uint256 nftId, uint256 amount);

  /**
   * @dev Upgradable initializer
   */
  function CrossChainBridgeSimpleInit(address _lzEndpoint) external initializer {
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

  // @notice Estimate fee for PT_SWAP
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
    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_TEXT, _text);
    _lzSimpleSend(_dstChainId, lzPayload);
  }

  // @notice Estimate fee for swap type
  function estimateSwapTypeFee(
    uint16 _packageType,
    uint16 _dstChainId,
    address _srcToken,
    address _toAddress,
    uint256 _nftId,
    uint256 _amount
  ) external view virtual returns (uint256 nativeFee, uint256 zroFee) {
    bytes memory lzPayload = "";
    if (_packageType == PT_SWAP_TOKEN) {
      lzPayload = abi.encode(PT_SWAP_TOKEN, _srcToken, _toAddress, _amount);
    } else if (_packageType == PT_SWAP_NFT) {
      lzPayload = abi.encode(PT_SWAP_NFT, _srcToken, _toAddress, _nftId);
    } else if (_packageType == PT_SWAP_FT) {
      lzPayload = abi.encode(PT_SWAP_FT, _srcToken, _toAddress, _nftId, _amount);
    }
    return lzEndpoint.estimateFees(_dstChainId, address(this), lzPayload, false, "");
  }

  // @notice Send token to destination chain
  function swapTokens(uint16 _dstChainId, address _srcToken, uint256 _amount) external payable {
    address sender_ = _msgSender();

    // Transfer token to bridge
    IERC20(_srcToken).safeTransferFrom(sender_, address(this), _amount);

    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_SWAP_TOKEN, _srcToken, sender_, _amount);
    _lzSimpleSend(_dstChainId, lzPayload);
  }

  // @notice Send NFT ERC721 to destination chain
  function swapNFT(uint16 _dstChainId, address _srcToken, uint256 _nftId) external payable {
    address sender_ = _msgSender();

    // Transfer NFT to bridge
    ERC721(_srcToken).safeTransferFrom(sender_, address(this), _nftId);

    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_SWAP_NFT, _srcToken, sender_, _nftId);
    _lzSimpleSend(_dstChainId, lzPayload);
  }

  // @notice Send FT ERC1155 to destination chain
  function swapFT(uint16 _dstChainId, address _srcToken, uint256 _nftId, uint256 _amount) external payable {
    address sender_ = _msgSender();

    // Transfer FT to bridge
    ERC1155(_srcToken).safeTransferFrom(sender_, address(this), _nftId, _amount, "");

    // Bridge send to LZ network
    bytes memory lzPayload = abi.encode(PT_SWAP_FT, _srcToken, sender_, _nftId, _amount);
    _lzSimpleSend(_dstChainId, lzPayload);
  }

  // @notice Simple lzSend
  // @param _refundAddress = _msgSender()
  // @param _zroPaymentAddress = address(0) | "0x0000000000000000000000000000000000000000"
  // @param _adapterParams = "" | "0x"
  function _lzSimpleSend(uint16 _dstChainId, bytes memory _payload) internal virtual {
    _lzSend(_dstChainId, _payload, payable(_msgSender()), address(0), "", msg.value);
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
    if (packetType == PT_TEXT) {
      _textAck(_srcChainId, _payload);
    } else if (packetType == PT_SWAP_TOKEN) {
      _swapTokenAck(_srcChainId, _payload);
    } else if (packetType == PT_SWAP_NFT) {
      _swapNFTAck(_srcChainId, _payload);
    } else if (packetType == PT_SWAP_FT) {
      _swapFTAck(_srcChainId, _payload);
    } else {
      revert("Bridge: unknown packet type");
    }
  }

  // Perform update text
  function _textAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, string memory text) = abi.decode(_payload, (uint16, string));

    message = text;
    emit ETextFromChain(_srcChainId, text);
  }

  // Perform swap token
  function _swapTokenAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, address remoteToken, address toAddress, uint256 amount) = abi.decode(
      _payload,
      (uint16, address, address, uint256)
    );

    IERC20(localTokenByRemote[remoteToken]).safeTransfer(toAddress, amount);
    emit ESwapTokenFromChain(_srcChainId, remoteToken, toAddress, amount);
  }

  // Perform swap NFT
  function _swapNFTAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, address remoteToken, address toAddress, uint256 nftId) = abi.decode(
      _payload,
      (uint16, address, address, uint256)
    );
    address localToken = localTokenByRemote[remoteToken];
    // If Bridge is owner of token -> send
    try ERC721(localToken).ownerOf(nftId) returns (address _nftOwner) {
      require(_nftOwner == address(this), "Wrong NFT owner");
      ERC721(localToken).safeTransferFrom(address(this), toAddress, nftId);
    } catch {
      // Otherwise, mint from Bridge
      IMintableERC721(localToken).fMint(toAddress, nftId);
    }
    emit ESwapNFTFromChain(_srcChainId, remoteToken, toAddress, nftId);
  }

  // Perform swap FT
  function _swapFTAck(uint16 _srcChainId, bytes memory _payload) internal virtual {
    (, address remoteToken, address toAddress, uint256 nftId, uint256 amount) = abi.decode(
      _payload,
      (uint16, address, address, uint256, uint256)
    );

    address localToken = localTokenByRemote[remoteToken];
    // If Bridge is owner of token -> send
    uint256 _balance = ERC1155(localToken).balanceOf(address(this), nftId);
    if (_balance >= amount) {
      ERC1155(localToken).safeTransferFrom(address(this), toAddress, nftId, amount, "");
    } else {
      // Otherwise, mint from Bridge
      IMintableERC1155(localToken).fMint(toAddress, nftId, amount);
    }
    emit ESwapFTFromChain(_srcChainId, remoteToken, toAddress, nftId, amount);
  }

  /**
   * IERC721Receiver
   * @dev Whenever an {IERC721} `tokenId` token is transferred to this contract via {IERC721-safeTransferFrom}
   * by `operator` from `from`, this function is called.
   *
   * It must return its Solidity selector to confirm the token transfer.
   * If any other value is returned or the interface is not implemented by the recipient, the transfer will be reverted.
   *
   * The selector can be obtained in Solidity with `IERC721.onERC721Received.selector`.
   */
  function onERC721Received(
    address operator,
    address, // _owner,
    uint256, // _tokenId,
    bytes calldata
  ) external view returns (bytes4) {
    require(operator == address(this) || hasRole(_EDITOR_ROLE, operator), "self");
    return this.onERC721Received.selector;
  }

  /**
      IERC1155Receiver
      @dev Handles the receipt of a single ERC1155 token type. This function is
      called at the end of a `safeTransferFrom` after the balance has been updated.
      To accept the transfer, this must return
      `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))`
      (i.e. 0xf23a6e61, or its own function selector).
      - operator The address which initiated the transfer (i.e. msg.sender)
      - from The address which previously owned the token
      - id The ID of the token being transferred
      - value The amount of tokens being transferred
      - data Additional data with no specified format
      @return `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))` if transfer is allowed
    */
  function onERC1155Received(
    address operator,
    address, // from,
    uint256, // id,
    uint256, // value,
    bytes calldata // data
  ) external view returns (bytes4) {
    require(operator == address(this) || hasRole(_EDITOR_ROLE, operator), "self");
    return this.onERC1155Received.selector;
  }
}
