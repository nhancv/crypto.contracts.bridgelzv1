// truffle test 'test/CrossChainBridgeAgent.test.js' --network test

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

const LZEndpointMock = artifacts.require('LZEndpointMock');
const CrossChainBridgeFull = artifacts.require('CrossChainBridgeFull');
const CrossChainBridgeAgent = artifacts.require('CrossChainBridgeAgent');

contract('CrossChainBridgeAgent.test', async ([owner, team, bob]) => {
  let instanceBridgeBSC;
  let instanceBridgeARB;
  let instanceLZEndpointBSC;
  let instanceLZEndpointARB;

  let instanceAgentBSC;
  let instanceAgentARB;

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
    // MOCK local LZ Endpoint
    instanceLZEndpointBSC = await LZEndpointMock.new(chains.BSC_LOCAL);
    instanceLZEndpointARB = await LZEndpointMock.new(chains.ARB_LOCAL);
    console.log('instanceLZEndpointBSC:', instanceLZEndpointBSC.address);
    console.log('instanceLZEndpointARB:', instanceLZEndpointARB.address);
    lzEndpoints[chains.BSC_LOCAL] = instanceLZEndpointBSC.address;
    lzEndpoints[chains.ARB_LOCAL] = instanceLZEndpointARB.address;

    // Deploy bridges
    instanceBridgeBSC = await deployProxy(CrossChainBridgeFull, [lzEndpoints[chains.BSC_LOCAL]], {
      initializer: 'CrossChainBridgeFullInit',
    });
    console.log('BridgeBSC:', instanceBridgeBSC.address);
    instanceBridgeARB = await deployProxy(CrossChainBridgeFull, [lzEndpoints[chains.ARB_LOCAL]], {
      initializer: 'CrossChainBridgeFullInit',
    });
    console.log('BridgeARB:', instanceBridgeARB.address);
    console.log('BridgeARB Owner:', await instanceBridgeARB.owner());

    // Deploy agents
    instanceAgentBSC = await deployProxy(CrossChainBridgeAgent, [instanceBridgeBSC.address], {
      initializer: 'CrossChainBridgeAgentInit',
    });
    console.log('AgentBSC:', instanceBridgeBSC.address);
    instanceAgentARB = await deployProxy(CrossChainBridgeAgent, [instanceBridgeARB.address], {
      initializer: 'CrossChainBridgeAgentInit',
    });
    console.log('AgentARB:', instanceBridgeARB.address);

    // Internal bookkeeping for endpoints (not part of a real deploy, just for this test)
    await instanceLZEndpointBSC.setDestLzEndpoint(instanceBridgeARB.address, instanceLZEndpointARB.address);
    await instanceLZEndpointARB.setDestLzEndpoint(instanceBridgeBSC.address, instanceLZEndpointBSC.address);

    // Config trusted remote address:
    // function setTrustedRemoteAddress(uint16 _remoteChainId, bytes calldata _remoteAddress)
    await instanceBridgeBSC.setTrustedRemoteAddress(chains.ARB_LOCAL, instanceBridgeARB.address);
    await instanceBridgeARB.setTrustedRemoteAddress(chains.BSC_LOCAL, instanceBridgeBSC.address);
    console.log('BridgeBSC.trustedRemoteAddress:', await instanceBridgeBSC.getTrustedRemoteAddress(chains.ARB_LOCAL));
    console.log('BridgeARB.trustedRemoteAddress:', await instanceBridgeARB.getTrustedRemoteAddress(chains.BSC_LOCAL));
    console.log('BridgeBSC.trustedRemoteLookup:', await instanceBridgeBSC.trustedRemoteLookup(chains.ARB_LOCAL));
    console.log('BridgeARB.trustedRemoteLookup:', await instanceBridgeARB.trustedRemoteLookup(chains.BSC_LOCAL));

    // Send ETH to Agent to pay bridge gas fee
    await web3.eth.sendTransaction({ from: owner, to: instanceAgentBSC.address, value: toWei('1') });
    await web3.eth.sendTransaction({ from: owner, to: instanceAgentARB.address, value: toWei('1') });
  };

  before(async () => {
    await setup();
  });

  it('Agent update text from BSC to ARB', async () => {
    // Assert agent balance is 1 ether
    assert.equal(await web3.eth.getBalance(instanceAgentBSC.address), toWei('1'));

    const text = 'Hello from BSC';
    const updateTextTx = await instanceAgentBSC.reqUpdateText(chains.ARB_LOCAL, text, { from: bob });
    const updateTextFee = await getTxFee(updateTextTx.receipt, web3);
    console.log(
      `fee@updateText: ${updateTextFee.fee} ETH (${fromWei(updateTextFee.gasPrice, 9)} Gwei, ${
        updateTextFee.gasUsed
      } used)`,
    );
    assert.equal(await instanceBridgeARB.message(), text);

    // Assert agent balance is lower than 1 ether
    const agentBalance = await web3.eth.getBalance(instanceAgentBSC.address);
    console.log('agentBSCBalance:', fromWei(agentBalance));
    assert.isBelow(Number(agentBalance), Number(toWei('1')));
  });
  it('Agent update text from ARB to BSC', async () => {
    // Assert agent balance is 1 ether
    assert.equal(await web3.eth.getBalance(instanceAgentARB.address), toWei('1'));

    const text = 'Hello from ARB';
    const updateTextTx = await instanceAgentARB.reqUpdateText(chains.BSC_LOCAL, text, { from: bob });
    const updateTextFee = await getTxFee(updateTextTx.receipt, web3);
    console.log(
      `fee@updateText: ${updateTextFee.fee} ETH (${fromWei(updateTextFee.gasPrice, 9)} Gwei, ${
        updateTextFee.gasUsed
      } used)`,
    );
    assert.equal(await instanceBridgeBSC.message(), text);

    // Assert agent balance is lower than 1 ether
    const agentBalance = await web3.eth.getBalance(instanceAgentARB.address);
    console.log('agentARBBalance:', fromWei(agentBalance));
    assert.isBelow(Number(agentBalance), Number(toWei('1')));
  });
});

/**
 *   Contract: CrossChainBridgeAgent.test
 * instanceLZEndpointBSC: 0x9A3b4D37914342D9E5CD082b437362783Ca17a1d
 * instanceLZEndpointARB: 0x2Ff84DdDE3f000A4696AD759bE9fe1c33E0B0052
 * BridgeBSC: 0xDEcFE35307b9A42EDc3Ee8Ee05475FAa4Fb38D5F
 * BridgeARB: 0x5cd7950418adB3e2Bb5bdE22689F6FC7c149Ec75
 * BridgeARB Owner: 0x23D31ba5f9B9549dba7Ebc8CEa1B9A2066BEA440
 * AgentBSC: 0xDEcFE35307b9A42EDc3Ee8Ee05475FAa4Fb38D5F
 * AgentARB: 0x5cd7950418adB3e2Bb5bdE22689F6FC7c149Ec75
 * BridgeBSC.trustedRemoteAddress: 0x5cd7950418adb3e2bb5bde22689f6fc7c149ec75
 * BridgeARB.trustedRemoteAddress: 0xdecfe35307b9a42edc3ee8ee05475faa4fb38d5f
 * BridgeBSC.trustedRemoteLookup: 0x5cd7950418adb3e2bb5bde22689f6fc7c149ec75decfe35307b9a42edc3ee8ee05475faa4fb38d5f
 * BridgeARB.trustedRemoteLookup: 0xdecfe35307b9a42edc3ee8ee05475faa4fb38d5f5cd7950418adb3e2bb5bde22689f6fc7c149ec75
 * fee@updateText: 0.00044469400000000004 ETH (2.0 Gwei, 222347 used)
 * agentBSCBalance: 0.98799772
 *     ✔ Agent update text from BSC to ARB (608ms)
 * fee@updateText: 0.00044469400000000004 ETH (2.0 Gwei, 222347 used)
 * agentARBBalance: 0.98799772
 *     ✔ Agent update text from ARB to BSC (654ms)
 *
 *
 *   2 passing (4s)
 *
 * crypto.contracts.bridge|master⚡ ⇒
 */
