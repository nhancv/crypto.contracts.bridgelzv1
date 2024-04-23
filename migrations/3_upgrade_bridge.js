/*
truffle migrate -f 3 --to 3 --network bscTestnet
truffle migrate -f 3 --to 3 --network arbitrumGoerli
 */
const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');

const CrossChainBridgeSimple = artifacts.require('CrossChainBridgeSimple');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test') return;
  const owner = accounts[0];
  console.log('Owner:', owner);

  const BRIDGE_BSC = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  const BRIDGE_ARB = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  let instanceBridge;
  if (network === 'bscTestnet') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_BSC);
  } else if (network === 'arbitrumGoerli') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_ARB);
  }
  await upgradeProxy(instanceBridge.address, CrossChainBridgeSimple, { deployer: deployer });
  instanceBridge = await CrossChainBridgeSimple.deployed();
  console.log('Upgraded Bridge:', instanceBridge.address);
};
