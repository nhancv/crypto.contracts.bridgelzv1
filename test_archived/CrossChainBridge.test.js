// truffle test 'test/CrossChainBridge.test.js' --network test

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

const MockERC20 = artifacts.require('MockERC20');
const LZEndpointMock = artifacts.require('LZEndpointMock');
const CrossChainBridge = artifacts.require('CrossChainBridge');

contract('CrossChainBridge.test', async ([owner, team, bob]) => {
  let instanceTokenBSC;
  let instanceTokenARB;
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

    // MOCK local LZ Endpoint
    instanceLZEndpointBSC = await LZEndpointMock.new(chains.BSC_LOCAL);
    instanceLZEndpointARB = await LZEndpointMock.new(chains.ARB_LOCAL);
    console.log('instanceLZEndpointBSC:', instanceLZEndpointBSC.address);
    console.log('instanceLZEndpointARB:', instanceLZEndpointARB.address);
    lzEndpoints[chains.BSC_LOCAL] = instanceLZEndpointBSC.address;
    lzEndpoints[chains.ARB_LOCAL] = instanceLZEndpointARB.address;

    // Deploy bridge
    instanceBridgeBSC = await deployProxy(CrossChainBridge, [lzEndpoints[chains.BSC_LOCAL]], {
      initializer: 'CrossChainBridgeInit',
    });
    console.log('BridgeBSC:', instanceBridgeBSC.address);
    instanceBridgeARB = await deployProxy(CrossChainBridge, [lzEndpoints[chains.ARB_LOCAL]], {
      initializer: 'CrossChainBridgeInit',
    });
    console.log('BridgeARB:', instanceBridgeARB.address);
    console.log('BridgeARB Owner:', await instanceBridgeARB.owner());

    // Internal bookkeeping for endpoints (not part of a real deploy, just for this test)
    await instanceLZEndpointBSC.setDestLzEndpoint(instanceBridgeARB.address, instanceLZEndpointARB.address);
    await instanceLZEndpointARB.setDestLzEndpoint(instanceBridgeBSC.address, instanceLZEndpointBSC.address);

    // Config token:
    // function configToken(address localToken, address remoteToken)
    await instanceBridgeBSC.configToken(instanceTokenBSC.address, instanceTokenARB.address);
    await instanceBridgeARB.configToken(instanceTokenARB.address, instanceTokenBSC.address);

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
  };

  before(async () => {
    await setup();
  });

  it('Bridge token from BSC to ARB', async () => {
    assert.equal(await instanceTokenARB.balanceOf(bob), 0);
    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(1_000));

    // Approve
    await instanceTokenBSC.approve(instanceBridgeBSC.address, MAX_UINT256, { from: bob });

    // Send from BSC
    // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
    const { nativeFee } = await instanceBridgeBSC.estimateSendTokensFee(
      chains.ARB_LOCAL,
      instanceTokenBSC.address,
      bob,
      toWei(1_000),
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const sendTokensTx = await instanceBridgeBSC.sendTokens(chains.ARB_LOCAL, instanceTokenBSC.address, toWei(1_000), {
      from: bob,
      value: nativeFee,
    });
    console.log('sendTokensTx:', JSON.stringify(sendTokensTx.logs));

    const sendTokensFee = await getTxFee(sendTokensTx.receipt, web3);
    console.log(
      `fee@sendTokens: ${sendTokensFee.fee} ETH (${fromWei(sendTokensFee.gasPrice, 9)} Gwei, ${
        sendTokensFee.gasUsed
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
    const { nativeFee } = await instanceBridgeARB.estimateSendTokensFee(
      chains.BSC_LOCAL,
      instanceTokenBSC.address,
      bob,
      toWei(1_000),
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const sendTokensTx = await instanceBridgeARB.sendTokens(chains.BSC_LOCAL, instanceTokenARB.address, toWei(1_000), {
      from: bob,
      value: nativeFee,
    });
    console.log('sendTokensTx:', JSON.stringify(sendTokensTx.logs));

    const sendTokensFee = await getTxFee(sendTokensTx.receipt, web3);
    console.log(
      `fee@sendTokens: ${sendTokensFee.fee} ETH (${fromWei(sendTokensFee.gasPrice, 9)} Gwei, ${
        sendTokensFee.gasUsed
      } used)`,
    );

    assert.equal(await instanceTokenARB.balanceOf(bob), 0);
    assert.equal(await instanceTokenBSC.balanceOf(bob), toWei(1_000));
  });

  it('Update text from BSC to ARB', async () => {
    const text = 'Hello from BSC';
    const { nativeFee } = await instanceBridgeBSC.estimateUpdateTextFee(chains.ARB_LOCAL, text);
    console.log('nativeFee:', fromWei(nativeFee));
    const updateTextTx = await instanceBridgeBSC.updateText(chains.ARB_LOCAL, text, {
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
    const { nativeFee } = await instanceBridgeARB.estimateUpdateTextFee(chains.BSC_LOCAL, text);
    console.log('nativeFee:', fromWei(nativeFee));
    const updateTextTx = await instanceBridgeARB.updateText(chains.BSC_LOCAL, text, {
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
});

/**
 *   Contract: CrossChainBridge.test
 * TokenBSC address: 0xcF60A3583bD647B080674524466aEBa5E1352Ab4
 * TokenARB address: 0x4Cc0fCD80d06D1091790A84359F7a71578978d2d
 * instanceLZEndpointBSC: 0x38041718e006D1e1CDCa81dfeBEE0f83C67ef254
 * instanceLZEndpointARB: 0x54b2AF8bfe5a2Bf13faCAbb0c4A917711908B715
 * BridgeBSC: 0x8723211F4400a3e700Be26203664A32Fd615B5F3
 * BridgeARB: 0xA20a1eE7b2c5B483ADD8dbb37C330dCDb0de63f7
 * BridgeARB Owner: 0xe3f4545F44972482c134e97BC9a0704Ba569bCde
 * BridgeBSC.trustedRemoteAddress: 0xa20a1ee7b2c5b483add8dbb37c330dcdb0de63f7
 * BridgeARB.trustedRemoteAddress: 0x8723211f4400a3e700be26203664a32fd615b5f3
 * BridgeBSC.trustedRemoteLookup: 0xa20a1ee7b2c5b483add8dbb37c330dcdb0de63f78723211f4400a3e700be26203664a32fd615b5f3
 * BridgeARB.trustedRemoteLookup: 0x8723211f4400a3e700be26203664a32fd615b5f3a20a1ee7b2c5b483add8dbb37c330dcdb0de63f7
 * nativeFee: 0.013202508
 * sendTokensTx: [{"address":"0xA20a1eE7b2c5B483ADD8dbb37C330dCDb0de63f7","blockHash":"0xe20548d97cac8faba99b9b584eff8ec6390e90e7aa3f89c2c665fc4c5c120331","blockNumber":376,"logIndex":3,"removed":false,"transactionHash":"0xaf1fc5db248d22c6dee2d2071a0d117b03782ac0df1280854f1a40fcfe4b240c","transactionIndex":0,"id":"log_1cb7f944","event":"ESwapFromChain","args":{"0":"44e","1":"0xcF60A3583bD647B080674524466aEBa5E1352Ab4","2":"0x8B97AFCC9bE4D5707e1fAc1eF170cd7F39D60C48","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"44e","remoteToken":"0xcF60A3583bD647B080674524466aEBa5E1352Ab4","to":"0x8B97AFCC9bE4D5707e1fAc1eF170cd7F39D60C48","amount":"3635c9adc5dea00000"}}]
 * fee@sendTokens: 0.00046177800000000004 ETH (2.0 Gwei, 230889 used)
 *     ✔ Bridge token from BSC to ARB (429ms)
 * nativeFee: 0.013202508
 * sendTokensTx: [{"address":"0x8723211F4400a3e700Be26203664A32Fd615B5F3","blockHash":"0x3fc7b2a43a764531fec3daac2aae629a93058b00542fa2f4de150596d3b577fb","blockNumber":378,"logIndex":3,"removed":false,"transactionHash":"0x9d6f725c3e0df64623af96c74d3055fa1b595f099b4b2aea3ceddabbc6fd3e4d","transactionIndex":0,"id":"log_1c7fdff4","event":"ESwapFromChain","args":{"0":"456","1":"0x4Cc0fCD80d06D1091790A84359F7a71578978d2d","2":"0x8B97AFCC9bE4D5707e1fAc1eF170cd7F39D60C48","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"456","remoteToken":"0x4Cc0fCD80d06D1091790A84359F7a71578978d2d","to":"0x8B97AFCC9bE4D5707e1fAc1eF170cd7F39D60C48","amount":"3635c9adc5dea00000"}}]
 * fee@sendTokens: 0.00046177800000000004 ETH (2.0 Gwei, 230889 used)
 *     ✔ Bridge token from ARB to BSC (423ms)
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0xA20a1eE7b2c5B483ADD8dbb37C330dCDb0de63f7","blockHash":"0xcc3013d82456b9fdacec0d9b19c81260517da2decb5bde833d41ad8e9a584b79","blockNumber":379,"logIndex":0,"removed":false,"transactionHash":"0x83a49154ea8e11babcd512267b2d4cce7b681cb7a35d8565e1a7ff7aaa38e4e2","transactionIndex":0,"id":"log_8d4ffa5e","event":"ETextFromChain","args":{"0":"44e","1":"Hello from BSC","__length__":2,"srcChainId":"44e","text":"Hello from BSC"}}]
 * fee@updateText: 0.000304484 ETH (2.0 Gwei, 152242 used)
 *     ✔ Update text from BSC to ARB (299ms)
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0x8723211F4400a3e700Be26203664A32Fd615B5F3","blockHash":"0x780ba5dd1eec4a1a60c27b7ddb2b9eccc3c4d3338f687f07b211293c51c5780a","blockNumber":380,"logIndex":0,"removed":false,"transactionHash":"0x54b58034a7835f6ca3833bad7180518fb3d74d739d8300179efc6145ac77fe77","transactionIndex":0,"id":"log_202af62a","event":"ETextFromChain","args":{"0":"456","1":"Hello from ARB","__length__":2,"srcChainId":"456","text":"Hello from ARB"}}]
 * fee@updateText: 0.000304484 ETH (2.0 Gwei, 152242 used)
 *     ✔ Update text from ARB to BSC (291ms)
 *
 *
 *   4 passing (2s)
 *
 * crypto.contracts.bridge|master⚡ ⇒
 */
