// truffle test 'test/CrossChainBridgeFull.test.js' --network test

const { assert } = require('chai');
const BigNumber = require('bignumber.js');
const { prettyNum, PRECISION_SETTING, ROUNDING_MODE } = require('pretty-num');
const { toWei, fromWei, sleep, normObj, getTxFee } = require('../scripts_truffle/utils');
const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const ethers = require('ethers');
const { expectRevert, time, expectEvent } = require('@openzeppelin/test-helpers');
const truffleAssert = require('truffle-assertions');
const moment = require('moment');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

// Consider uncomment when you get Error: CONNECTION ERROR: Couldn't connect to node
require('@openzeppelin/test-helpers/configure')({
  provider: 'http://127.0.0.1:8545',
});

const MockERC20 = artifacts.require('MockERC20');
const MockERC721Upgradeable = artifacts.require('MockERC721Upgradeable');
const MockERC1155Upgradeable = artifacts.require('MockERC1155Upgradeable');
const LZEndpointMock = artifacts.require('LZEndpointMock');
const CrossChainBridgeFull = artifacts.require('CrossChainBridgeFull');

// Packet types
const PACKET_TYPES = {
  PT_TEXT: 0, // Update text request
  PT_SWAP_TOKEN: 1, // Swap token request
  PT_SWAP_NFT: 2, // Swap NFT ERC721 request
  PT_SWAP_FT: 3, // Swap FT ERC1155 request
};
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MINTER_ROLE = web3.utils.keccak256('MINTER_ROLE');

// v1 adapterParams, encoded for version 1 style, and 200k gas quote
let FEE_PARAM = ethers.utils.solidityPack(['uint16', 'uint256'], [1, 200_000]);

contract('CrossChainBridgeFull.test', async ([owner, team, bob]) => {
  let instanceTokenBSC;
  let instanceNFTBSC;
  let instanceFTBSC;
  let instanceTokenARB;
  let instanceNFTARB;
  let instanceFTARB;

  let instanceBridgeBSC;
  let instanceBridgeARB;
  let instanceLZEndpointBSC;
  let instanceLZEndpointARB;

  // LZ Endpoint mainnet
  // https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids
  const chains = {
    BSC_MAINNET: 102,
    ARB_MAINNET: 110,
    BSC_LOCAL: 1102,
    ARB_LOCAL: 1110,
  };
  const lzEndpoints = {
    [chains.BSC_MAINNET]: '0x3c2269811836af69497E5F486A85D7316753cf62',
    [chains.ARB_MAINNET]: '0x3c2269811836af69497E5F486A85D7316753cf62',
  };

  const setup = async () => {
    // Deploy token
    instanceTokenBSC = await MockERC20.new('MockBSC', 'MockBSC', 1e9);
    console.log('TokenBSC address:', instanceTokenBSC.address);
    instanceTokenARB = await MockERC20.new('MockARB', 'MockARB', 1e9);
    console.log('TokenARB address:', instanceTokenARB.address);

    instanceNFTBSC = await deployProxy(MockERC721Upgradeable, ['MOCKNFTBSC', 'MOCKNFTBSC'], {
      initializer: 'MockERC721UpgradeableInit',
    });
    console.log('NFTBSC address:', instanceNFTBSC.address);
    instanceNFTARB = await deployProxy(MockERC721Upgradeable, ['MOCKNFTARB', 'MOCKNFTARB'], {
      initializer: 'MockERC721UpgradeableInit',
    });
    console.log('NFTARB address:', instanceNFTARB.address);

    instanceFTBSC = await deployProxy(MockERC1155Upgradeable, [], { initializer: 'MockERC1155UpgradeableInit' });
    console.log('FTBSC address:', instanceFTBSC.address);
    instanceFTARB = await deployProxy(MockERC1155Upgradeable, [], { initializer: 'MockERC1155UpgradeableInit' });
    console.log('FTARB address:', instanceFTARB.address);

    // MOCK local LZ Endpoint
    instanceLZEndpointBSC = await LZEndpointMock.new(chains.BSC_LOCAL);
    instanceLZEndpointARB = await LZEndpointMock.new(chains.ARB_LOCAL);
    console.log('instanceLZEndpointBSC:', instanceLZEndpointBSC.address);
    console.log('instanceLZEndpointARB:', instanceLZEndpointARB.address);
    lzEndpoints[chains.BSC_LOCAL] = instanceLZEndpointBSC.address;
    lzEndpoints[chains.ARB_LOCAL] = instanceLZEndpointARB.address;

    // Deploy bridge
    instanceBridgeBSC = await deployProxy(CrossChainBridgeFull, [lzEndpoints[chains.BSC_LOCAL]], {
      initializer: 'CrossChainBridgeFullInit',
    });
    console.log('BridgeBSC:', instanceBridgeBSC.address);
    instanceBridgeARB = await deployProxy(CrossChainBridgeFull, [lzEndpoints[chains.ARB_LOCAL]], {
      initializer: 'CrossChainBridgeFullInit',
    });
    console.log('BridgeARB:', instanceBridgeARB.address);
    console.log('BridgeARB Owner:', await instanceBridgeARB.owner());

    // Internal bookkeeping for endpoints (not part of a real deploy, just for this test)
    await instanceLZEndpointBSC.setDestLzEndpoint(instanceBridgeARB.address, instanceLZEndpointARB.address);
    await instanceLZEndpointARB.setDestLzEndpoint(instanceBridgeBSC.address, instanceLZEndpointBSC.address);

    // Config tokens:
    // function configToken(address localToken, address remoteToken)
    await instanceBridgeBSC.configToken(instanceTokenBSC.address, instanceTokenARB.address);
    await instanceBridgeARB.configToken(instanceTokenARB.address, instanceTokenBSC.address);

    await instanceBridgeBSC.configToken(instanceNFTBSC.address, instanceNFTARB.address);
    await instanceBridgeARB.configToken(instanceNFTARB.address, instanceNFTBSC.address);

    await instanceBridgeBSC.configToken(instanceFTBSC.address, instanceFTARB.address);
    await instanceBridgeARB.configToken(instanceFTARB.address, instanceFTBSC.address);

    // Config trusted remote address:
    // function setTrustedRemoteAddress(uint16 _remoteChainId, bytes calldata _remoteAddress)
    await instanceBridgeBSC.setTrustedRemoteAddress(chains.ARB_LOCAL, instanceBridgeARB.address);
    await instanceBridgeARB.setTrustedRemoteAddress(chains.BSC_LOCAL, instanceBridgeBSC.address);
    console.log('BridgeBSC.trustedRemoteAddress:', await instanceBridgeBSC.getTrustedRemoteAddress(chains.ARB_LOCAL));
    console.log('BridgeARB.trustedRemoteAddress:', await instanceBridgeARB.getTrustedRemoteAddress(chains.BSC_LOCAL));
    console.log('BridgeBSC.trustedRemoteLookup:', await instanceBridgeBSC.trustedRemoteLookup(chains.ARB_LOCAL));
    console.log('BridgeARB.trustedRemoteLookup:', await instanceBridgeARB.trustedRemoteLookup(chains.BSC_LOCAL));

    // Transfer token to tester
    await instanceTokenBSC.transfer(bob, toWei(1_000));
    // Transfer token to ARB Bridge
    await instanceTokenARB.transfer(instanceBridgeARB.address, toWei(1_000));

    // Allow Bridge can mint NFT
    await instanceNFTBSC.grantRole(MINTER_ROLE, instanceBridgeBSC.address);
    await instanceNFTARB.grantRole(MINTER_ROLE, instanceBridgeARB.address);
    await instanceFTBSC.grantRole(MINTER_ROLE, instanceBridgeBSC.address);
    await instanceFTARB.grantRole(MINTER_ROLE, instanceBridgeARB.address);
  };

  before(async () => {
    await setup();
  });

  it('Update text from BSC to ARB', async () => {
    const text = 'Hello from BSC';

    const { nativeFee } = await instanceBridgeBSC.estimateUpdateTextFee(chains.ARB_LOCAL, text, false, FEE_PARAM);
    console.log('nativeFee:', fromWei(nativeFee));
    const updateTextTx = await instanceBridgeBSC.updateText(chains.ARB_LOCAL, text, owner, owner, FEE_PARAM, {
      from: bob,
      value: nativeFee,
    });
    console.log('updateTextTx:', JSON.stringify(updateTextTx.logs));

    const updateTextFee = await getTxFee(updateTextTx.receipt, web3);
    console.log(
      `fee@updateText: ${updateTextFee.fee} ETH (${fromWei(updateTextFee.gasPrice, 9)} Gwei, ${
        updateTextFee.gasUsed
      } used)`,
    );

    assert.equal(await instanceBridgeARB.message(), text);
  });
  it('Update text from ARB to BSC', async () => {
    const text = 'Hello from ARB';
    const { nativeFee } = await instanceBridgeARB.estimateUpdateTextFee(chains.BSC_LOCAL, text, false, FEE_PARAM);
    console.log('nativeFee:', fromWei(nativeFee));
    const updateTextTx = await instanceBridgeARB.updateText(chains.BSC_LOCAL, text, owner, owner, FEE_PARAM, {
      from: bob,
      value: nativeFee,
    });
    console.log('updateTextTx:', JSON.stringify(updateTextTx.logs));

    const updateTextFee = await getTxFee(updateTextTx.receipt, web3);
    console.log(
      `fee@updateText: ${updateTextFee.fee} ETH (${fromWei(updateTextFee.gasPrice, 9)} Gwei, ${
        updateTextFee.gasUsed
      } used)`,
    );

    assert.equal(await instanceBridgeBSC.message(), text);
  });

  it('Bridge token from BSC to ARB', async () => {
    assert.equal(await instanceTokenARB.balanceOf(bob), 0);
    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(1_000));

    // Approve
    await instanceTokenBSC.approve(instanceBridgeBSC.address, MAX_UINT256, { from: bob });

    // Send from BSC
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeBSC.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_TOKEN,
      chains.ARB_LOCAL,
      instanceTokenBSC.address,
      bob,
      0,
      toWei(1_000),
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapTokensTx = await instanceBridgeBSC.swapTokens(
      chains.ARB_LOCAL,
      instanceTokenBSC.address,
      toWei(1_000),
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapTokensTx:', JSON.stringify(swapTokensTx.logs));

    const swapTokensFee = await getTxFee(swapTokensTx.receipt, web3);
    console.log(
      `fee@swapTokens: ${swapTokensFee.fee} ETH (${fromWei(swapTokensFee.gasPrice, 9)} Gwei, ${
        swapTokensFee.gasUsed
      } used)`,
    );

    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(0));
    assert.equal(await instanceTokenARB.balanceOf(bob), toWei(1_000));
  });
  it('Bridge token from ARB to BSC', async () => {
    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(0));
    assert.equal(await instanceTokenARB.balanceOf(bob), toWei(1_000));

    // Approve
    await instanceTokenARB.approve(instanceBridgeARB.address, MAX_UINT256, { from: bob });

    // Send from BSC
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeARB.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_TOKEN,
      chains.BSC_LOCAL,
      instanceTokenBSC.address,
      bob,
      0, // Skip nftId = zero for Token case
      toWei(1_000),
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapTokensTx = await instanceBridgeARB.swapTokens(
      chains.BSC_LOCAL,
      instanceTokenARB.address,
      toWei(1_000),
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapTokensTx:', JSON.stringify(swapTokensTx.logs));

    const swapTokensFee = await getTxFee(swapTokensTx.receipt, web3);
    console.log(
      `fee@swapTokens: ${swapTokensFee.fee} ETH (${fromWei(swapTokensFee.gasPrice, 9)} Gwei, ${
        swapTokensFee.gasUsed
      } used)`,
    );

    assert.equal(await instanceTokenARB.balanceOf(bob), 0);
    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(1_000));
  });

  it('Bridge NFT ERC721 from BSC to ARB', async () => {
    // Owner mint new NFT to Bob in BSC
    await instanceNFTBSC.fMint(bob, 1, { from: owner });

    assert.equal(await instanceNFTBSC.balanceOf(bob), 1);
    assert.equal(await instanceNFTBSC.ownerOf(1), bob);
    assert.equal(await instanceNFTARB.balanceOf(bob), 0);
    await truffleAssert.reverts(instanceNFTARB.ownerOf(1), 'ERC721: owner query for nonexistent token');

    // Approve
    await instanceNFTBSC.setApprovalForAll(instanceBridgeBSC.address, true, { from: bob });

    // Send from BSC
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeBSC.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_NFT,
      chains.ARB_LOCAL,
      instanceNFTBSC.address,
      bob,
      1, // NFT ID
      0, // Skip amount = zero for NFT case
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapNFTTx = await instanceBridgeBSC.swapNFT(
      chains.ARB_LOCAL,
      instanceNFTBSC.address,
      1,
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapNFTTx:', JSON.stringify(swapNFTTx.logs));

    const swapNFTFee = await getTxFee(swapNFTTx.receipt, web3);
    console.log(
      `fee@swapNFT: ${swapNFTFee.fee} ETH (${fromWei(swapNFTFee.gasPrice, 9)} Gwei, ${swapNFTFee.gasUsed} used)`,
    );

    assert.equal(await instanceNFTBSC.balanceOf(bob), 0);
    assert.equal(await instanceNFTBSC.ownerOf(1), instanceBridgeBSC.address);
    assert.equal(await instanceNFTARB.balanceOf(bob), 1);
    assert.equal(await instanceNFTARB.ownerOf(1), bob);
  });
  it('Bridge NFT ERC721 from ARB to BSC', async () => {
    // Context: Then NFT is already minted on both chains from previous test
    assert.equal(await instanceNFTBSC.balanceOf(bob), 0);
    assert.equal(await instanceNFTBSC.ownerOf(1), instanceBridgeBSC.address);
    assert.equal(await instanceNFTARB.balanceOf(bob), 1);
    assert.equal(await instanceNFTARB.ownerOf(1), bob);

    // Approve
    await instanceNFTARB.setApprovalForAll(instanceBridgeARB.address, true, { from: bob });

    // Send from ARB
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeARB.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_NFT,
      chains.BSC_LOCAL,
      instanceNFTARB.address,
      bob,
      1, // FT ID
      0, // FT amount
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapNFTTx = await instanceBridgeARB.swapNFT(
      chains.BSC_LOCAL,
      instanceNFTARB.address,
      1,
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapNFTTx:', JSON.stringify(swapNFTTx.logs));

    const swapNFTFee = await getTxFee(swapNFTTx.receipt, web3);
    console.log(
      `fee@swapNFT: ${swapNFTFee.fee} ETH (${fromWei(swapNFTFee.gasPrice, 9)} Gwei, ${swapNFTFee.gasUsed} used)`,
    );

    assert.equal(await instanceNFTBSC.balanceOf(bob), 1);
    assert.equal(await instanceNFTBSC.ownerOf(1), bob);
    assert.equal(await instanceNFTARB.balanceOf(bob), 0);
    assert.equal(await instanceNFTARB.ownerOf(1), instanceBridgeARB.address);
  });

  it('Bridge FT ERC1155 from BSC to ARB', async () => {
    // Owner mint new FT to Bob in BSC
    await instanceFTBSC.fMint(bob, 1, 1, { from: owner });

    assert.equal(await instanceFTBSC.balanceOf(bob, 1), 1);
    assert.equal(await instanceFTARB.balanceOf(bob, 1), 0);

    // Approve
    await instanceFTBSC.setApprovalForAll(instanceBridgeBSC.address, true, { from: bob });

    // Send from BSC
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeBSC.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_FT,
      chains.ARB_LOCAL,
      instanceFTBSC.address,
      bob,
      1,
      1,
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapFTTx = await instanceBridgeBSC.swapFT(
      chains.ARB_LOCAL,
      instanceFTBSC.address,
      1,
      1,
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapFTTx:', JSON.stringify(swapFTTx.logs));

    const swapFTFee = await getTxFee(swapFTTx.receipt, web3);
    console.log(`fee@swapFT: ${swapFTFee.fee} ETH (${fromWei(swapFTFee.gasPrice, 9)} Gwei, ${swapFTFee.gasUsed} used)`);

    assert.equal(await instanceFTBSC.balanceOf(bob, 1), 0);
    assert.equal(await instanceFTBSC.balanceOf(instanceBridgeBSC.address, 1), 1);
    assert.equal(await instanceFTARB.balanceOf(bob, 1), 1);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, 1), 0);
  });
  it('Bridge FT ERC1155 from ARB to BSC', async () => {
    // Context: Then NFT is already minted on both chains from previous test
    assert.equal(await instanceFTBSC.balanceOf(bob, 1), 0);
    assert.equal(await instanceFTBSC.balanceOf(instanceBridgeBSC.address, 1), 1);
    assert.equal(await instanceFTARB.balanceOf(bob, 1), 1);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, 1), 0);

    // Approve
    await instanceFTARB.setApprovalForAll(instanceBridgeARB.address, true, { from: bob });

    // Send from ARB
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeARB.estimateSwapTypeFee(
      PACKET_TYPES.PT_SWAP_FT,
      chains.BSC_LOCAL,
      instanceFTARB.address,
      bob,
      1,
      1,
      false,
      FEE_PARAM,
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapFTTx = await instanceBridgeARB.swapFT(
      chains.BSC_LOCAL,
      instanceFTARB.address,
      1,
      1,
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: nativeFee,
      },
    );
    console.log('swapFTTx:', JSON.stringify(swapFTTx.logs));

    const swapFTFee = await getTxFee(swapFTTx.receipt, web3);
    console.log(`fee@swapFT: ${swapFTFee.fee} ETH (${fromWei(swapFTFee.gasPrice, 9)} Gwei, ${swapFTFee.gasUsed} used)`);

    assert.equal(await instanceFTBSC.balanceOf(bob, 1), 1);
    assert.equal(await instanceFTBSC.balanceOf(instanceBridgeBSC.address, 1), 0);
    assert.equal(await instanceFTARB.balanceOf(bob, 1), 0);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, 1), 1);
  });

  it('Retry payload on destination chain', async () => {
    const nftId = 10;
    await instanceFTBSC.fMint(bob, nftId, 1, { from: owner });
    await instanceFTBSC.setApprovalForAll(instanceBridgeBSC.address, true, { from: bob });

    /**
     * Assume the Bridge ARB doesn't have MINT role, the request from BSC will be failed at destination chain (ARB)
     * - The admin need grant mint role to Bridge ARB first
     * - User need to call retry payload on destination chain (ARB) to complete the request
     */
    // Revoke MINT role from Bridge ARB
    await instanceFTARB.revokeRole(MINTER_ROLE, instanceBridgeARB.address);

    // Try swap: bob sends BSC's FT to owner on ARB
    const swapFTTx = await instanceBridgeBSC.swapFT(
      chains.ARB_LOCAL,
      instanceFTBSC.address,
      nftId,
      1,
      owner,
      owner,
      FEE_PARAM,
      {
        from: bob,
        value: toWei(0.1),
      },
    );
    truffleAssert.eventEmitted(swapFTTx, 'MessageFailed', (ev) => {
      console.log(normObj(ev));
      return true;
    });

    // Check the request is failed
    assert.equal(await instanceFTBSC.balanceOf(bob, nftId), 0);
    assert.equal(await instanceFTBSC.balanceOf(instanceBridgeBSC.address, nftId), 1);
    assert.equal(await instanceFTARB.balanceOf(bob, nftId), 0);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, nftId), 0);

    const BSC_ARB_path_ = ethers.utils.solidityPack(
      ['address', 'address'],
      [instanceBridgeBSC.address, instanceBridgeARB.address],
    );
    const outboundNonce = Number(
      await instanceLZEndpointBSC.getOutboundNonce(chains.ARB_LOCAL, instanceBridgeBSC.address),
    );
    console.log('getOutboundNonce:', outboundNonce);
    const inboundNonce = Number(await instanceLZEndpointARB.getInboundNonce(chains.BSC_LOCAL, BSC_ARB_path_));
    console.log('inboundNonce:', inboundNonce);

    // owner send retry payload with failed request
    // @notice the interface to retry failed message on this Endpoint destination
    // @param _srcChainId - the source chain identifier
    // @param _srcAddress - the source chain contract address
    // @param _payload - the payload to be retried
    // function retryPayload(uint16 _srcChainId, bytes calldata _srcAddress, bytes calldata _payload) external;
    // bytes memory lzPayload = abi.encode(PT_SWAP_FT, _srcToken, sender_, _nftId, _amount);
    const payload = web3.eth.abi.encodeParameters(
      ['uint16', 'address', 'address', 'uint256', 'uint256'],
      [3, instanceFTBSC.address, bob, nftId, 1],
    );

    // Will failed because still not have MINT role yet
    await truffleAssert.reverts(
      instanceBridgeARB.retryMessage(chains.BSC_LOCAL, BSC_ARB_path_, outboundNonce, payload, { from: owner }),
      `AccessControl: account ${instanceBridgeARB.address.toLowerCase()} is missing role ${MINTER_ROLE}`,
    );

    // Grant MINT role to Bridge ARB
    await instanceFTARB.grantRole(MINTER_ROLE, instanceBridgeARB.address);

    await instanceBridgeARB.retryMessage(chains.BSC_LOCAL, BSC_ARB_path_, outboundNonce, payload, { from: owner });

    assert.equal(await instanceFTARB.balanceOf(bob, nftId), 1);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, nftId), 0);

    // Double retry will be failed
    await truffleAssert.reverts(
      instanceBridgeARB.retryMessage(chains.BSC_LOCAL, BSC_ARB_path_, outboundNonce, payload, { from: owner }),
      'NonblockingLzApp: no stored message',
    );

    assert.equal(await instanceFTARB.balanceOf(bob, nftId), 1);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, nftId), 0);
  });
});

/**
 * crypto.contracts.bridge|master⚡ ⇒ truffle test 'test/CrossChainBridgeFull.test.js' --network test
 * Using network 'test'.
 *
 *
 * Compiling your contracts...
 * ===========================
 * > Everything is up to date, there is nothing to compile.
 *
 *
 *   Contract: CrossChainBridgeFull.test
 * TokenBSC address: 0x9478eE9e114a8124dC0F9F05141a35C100eF90c2
 * TokenARB address: 0xEb7433Ca0858F88e57454f4848FaF664AE3C438E
 * NFTBSC address: 0x3373c09a9Afb5875e0D6e46F3B6a2f1546f16C38
 * NFTARB address: 0x337b73f29728DDD27E1872360607E6062973D51e
 * FTBSC address: 0x083Ea9180888aBa029856E9F9C89E772984050E0
 * FTARB address: 0x43f2FE2cBFC7a1AB67125eDFd78BF87094EC9F94
 * instanceLZEndpointBSC: 0x3a4E92864917693Af803e33acaa7736E55D98D14
 * instanceLZEndpointARB: 0x930D271780dCCa88C72978A497db817f770b8219
 * BridgeBSC: 0x3991cd439Db32C657f04750AfB649a8A677da7Cd
 * BridgeARB: 0x7292b2FF14AAeA8FEa219a8558324310357931dd
 * BridgeARB Owner: 0x841BA0E50D96DaC0579686be57FD9042cd2b81d7
 * BridgeBSC.trustedRemoteAddress: 0x7292b2ff14aaea8fea219a8558324310357931dd
 * BridgeARB.trustedRemoteAddress: 0x3991cd439db32c657f04750afb649a8a677da7cd
 * BridgeBSC.trustedRemoteLookup: 0x7292b2ff14aaea8fea219a8558324310357931dd3991cd439db32c657f04750afb649a8a677da7cd
 * BridgeARB.trustedRemoteLookup: 0x3991cd439db32c657f04750afb649a8a677da7cd7292b2ff14aaea8fea219a8558324310357931dd
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0x7292b2FF14AAeA8FEa219a8558324310357931dd","blockHash":"0x00302a96f593eeeb4c12c31ecf837b2d156d4b760bac02b41c5dff00db286f26","blockNumber":61,"logIndex":0,"removed":false,"transactionHash":"0x3d375561b1d5fe3cb69405f5e2416e4e3a1a032deb1e55b1d0b32263ba573470","transactionIndex":0,"id":"log_663d5dbe","event":"ETextFromChain","args":{"0":"44e","1":"Hello from BSC","__length__":2,"srcChainId":"44e","text":"Hello from BSC"}}]
 * fee@updateText: 0.000381634 ETH (2.0 Gwei, 190817 used)
 *     ✔ Update text from BSC to ARB (497ms)
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0x3991cd439Db32C657f04750AfB649a8A677da7Cd","blockHash":"0x8caf14442e8b40ed99b27e172325ddbb40874a762ff8366610c08861713e0c27","blockNumber":62,"logIndex":0,"removed":false,"transactionHash":"0xdd465dda342cb51b268404186020a010238f3a83217c39a9d68c186dbec05288","transactionIndex":0,"id":"log_20f9bd12","event":"ETextFromChain","args":{"0":"456","1":"Hello from ARB","__length__":2,"srcChainId":"456","text":"Hello from ARB"}}]
 * fee@updateText: 0.000381634 ETH (2.0 Gwei, 190817 used)
 *     ✔ Update text from ARB to BSC (601ms)
 * nativeFee: 0.013202508
 * swapTokensTx: [{"address":"0x7292b2FF14AAeA8FEa219a8558324310357931dd","blockHash":"0x23420a29fb37b7c59be5b2beed4f732c2e755067ec402c2431e3a31e98f60ead","blockNumber":64,"logIndex":3,"removed":false,"transactionHash":"0xc7f94abd3d175c1e8095046801c323255c0a56242c758d80820562b99a1dc26b","transactionIndex":0,"id":"log_eefe0a02","event":"ESwapTokenFromChain","args":{"0":"44e","1":"0x9478eE9e114a8124dC0F9F05141a35C100eF90c2","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"44e","remoteToken":"0x9478eE9e114a8124dC0F9F05141a35C100eF90c2","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","amount":"3635c9adc5dea00000"}}]
 * fee@swapTokens: 0.000402368 ETH (2.0 Gwei, 201184 used)
 *     ✔ Bridge token from BSC to ARB (551ms)
 * nativeFee: 0.013202508
 * swapTokensTx: [{"address":"0x3991cd439Db32C657f04750AfB649a8A677da7Cd","blockHash":"0x670eeab56e0d73fbedcdfca87fdcdd35e1d2d005825efc8e824a6213defb5699","blockNumber":66,"logIndex":3,"removed":false,"transactionHash":"0xaa3a437d49a59ddaa6bbbc58fd6b2e146dbc6a1701cf329f0bab78d0b72d4a69","transactionIndex":0,"id":"log_15b59a84","event":"ESwapTokenFromChain","args":{"0":"456","1":"0xEb7433Ca0858F88e57454f4848FaF664AE3C438E","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"456","remoteToken":"0xEb7433Ca0858F88e57454f4848FaF664AE3C438E","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","amount":"3635c9adc5dea00000"}}]
 * fee@swapTokens: 0.000402392 ETH (2.0 Gwei, 201196 used)
 *     ✔ Bridge token from ARB to BSC (545ms)
 * nativeFee: 0.013202508
 * swapNFTTx: [{"address":"0x7292b2FF14AAeA8FEa219a8558324310357931dd","blockHash":"0xea5ba020b1494e4ebacbfc2266bc496b9d85e29223862fd74ba8b6a8ca638c52","blockNumber":69,"logIndex":3,"removed":false,"transactionHash":"0x46940a88a66e213446fa49d5f46e601d4763ff54d1f28edb1375724d213525e4","transactionIndex":0,"id":"log_5165f5ec","event":"ESwapNFTFromChain","args":{"0":"44e","1":"0x3373c09a9Afb5875e0D6e46F3B6a2f1546f16C38","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"1","__length__":4,"srcChainId":"44e","remoteToken":"0x3373c09a9Afb5875e0D6e46F3B6a2f1546f16C38","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","nftId":"1"}}]
 * fee@swapNFT: 0.0005040460000000001 ETH (2.0 Gwei, 252023 used)
 *     ✔ Bridge NFT ERC721 from BSC to ARB (876ms)
 * nativeFee: 0.013202508
 * swapNFTTx: [{"address":"0x3991cd439Db32C657f04750AfB649a8A677da7Cd","blockHash":"0xf87c276a6a5d18fb857787fa6d9df3a16a8f8f71f1e6bd95ceef7272bb6becf9","blockNumber":71,"logIndex":4,"removed":false,"transactionHash":"0x6647a38954bd9b16fbec2173f18175e360c1e3fa6dd1c2f1547dac11fdbcc375","transactionIndex":0,"id":"log_9a1e84cc","event":"ESwapNFTFromChain","args":{"0":"456","1":"0x337b73f29728DDD27E1872360607E6062973D51e","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"1","__length__":4,"srcChainId":"456","remoteToken":"0x337b73f29728DDD27E1872360607E6062973D51e","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","nftId":"1"}}]
 * fee@swapNFT: 0.000465802 ETH (2.0 Gwei, 232901 used)
 *     ✔ Bridge NFT ERC721 from ARB to BSC (623ms)
 * nativeFee: 0.01320286
 * swapFTTx: [{"address":"0x7292b2FF14AAeA8FEa219a8558324310357931dd","blockHash":"0x4379969af46fd896cdeab1ff9d971c21c219e880c8bb6020d7ffc517e83ed866","blockNumber":74,"logIndex":2,"removed":false,"transactionHash":"0x2773babb01940ad870bcf2866f3df539414e1a7ec62afe08f188bea7186ab561","transactionIndex":0,"id":"log_bee4733a","event":"ESwapFTFromChain","args":{"0":"44e","1":"0x083Ea9180888aBa029856E9F9C89E772984050E0","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"1","4":"1","__length__":5,"srcChainId":"44e","remoteToken":"0x083Ea9180888aBa029856E9F9C89E772984050E0","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","nftId":"1","amount":"1"}}]
 * fee@swapFT: 0.00043728200000000005 ETH (2.0 Gwei, 218641 used)
 *     ✔ Bridge FT ERC1155 from BSC to ARB (597ms)
 * nativeFee: 0.01320286
 * swapFTTx: [{"address":"0x3991cd439Db32C657f04750AfB649a8A677da7Cd","blockHash":"0xa063f21299af93240d0372938915325e23a2f5f9f63a4d46ba45c884127dbb68","blockNumber":76,"logIndex":2,"removed":false,"transactionHash":"0xcb76d383820f024a24f4bbeb4f97f786732e635d84b2e6b052b53226b724a4ac","transactionIndex":0,"id":"log_9de94da8","event":"ESwapFTFromChain","args":{"0":"456","1":"0x43f2FE2cBFC7a1AB67125eDFd78BF87094EC9F94","2":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","3":"1","4":"1","__length__":5,"srcChainId":"456","remoteToken":"0x43f2FE2cBFC7a1AB67125eDFd78BF87094EC9F94","to":"0xC9A9380eE5b2e079fEB7848D7DA43d3D6b48aBE7","nftId":"1","amount":"1"}}]
 * fee@swapFT: 0.00043101200000000004 ETH (2.0 Gwei, 215506 used)
 *     ✔ Bridge FT ERC1155 from ARB to BSC (606ms)
 * Result {
 *   __length__: '5',
 *   _srcChainId: '1102',
 *   _srcAddress: '0x3991cd439db32c657f04750afb649a8a677da7cd7292b2ff14aaea8fea219a8558324310357931dd',
 *   _nonce: '5',
 *   _payload: '0x0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000083ea9180888aba029856e9f9c89e772984050e0000000000000000000000000c9a9380ee5b2e079feb7848d7da43d3d6b48abe7000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000001',
 *   _reason: '0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000094416363657373436f6e74726f6c3a206163636f756e7420307837323932623266663134616165613866656132313961383535383332343331303335373933316464206973206d697373696e6720726f6c6520'
 * }
 * getOutboundNonce: 5
 * inboundNonce: 5
 *     ✔ Retry payload on destination chain (973ms)
 *
 *
 *   9 passing (10s)
 *
 * crypto.contracts.bridge|master⚡ ⇒
 */
