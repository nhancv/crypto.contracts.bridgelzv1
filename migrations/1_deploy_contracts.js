/*
truffle migrate -f 1 --to 1 --network bscTestnet
truffle migrate -f 1 --to 1 --network arbitrumGoerli
truffle run verify MockERC20 --network bscTestnet

truffle migrate -f 1 --to 1 --network mainnet
truffle migrate -f 1 --to 1 --network bscMainnet
 */
const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');
const fromExponential = require('from-exponential');
const ethers = require('ethers');
const moment = require('moment');
const { fromWei, toWei, sleep, getTxFee } = require('../scripts_truffle/utils');
const BigNumber = require('bignumber.js');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

const MockERC20 = artifacts.require('MockERC20');
const MockERC721Upgradeable = artifacts.require('MockERC721Upgradeable');
const MockERC1155Upgradeable = artifacts.require('MockERC1155Upgradeable');
const CrossChainBridgeSimple = artifacts.require('CrossChainBridgeSimple');

// LZ Endpoint mainnet
// https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids
// https://layerzero.gitbook.io/docs/technical-reference/testnet/testnet-addresses
const chains = {
  BSC_MAINNET: 102,
  ARB_MAINNET: 110,
  BSC_TESTNET: 10102,
  ARB_GOERLI: 10143,
};
const lzEndpoints = {
  [chains.BSC_MAINNET]: '0x3c2269811836af69497E5F486A85D7316753cf62',
  [chains.ARB_MAINNET]: '0x3c2269811836af69497E5F486A85D7316753cf62',
  [chains.BSC_TESTNET]: '0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1',
  [chains.ARB_GOERLI]: '0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab',
};

module.exports = async function (deployer, network, accounts) {
  if (network === 'test') return;
  const owner = accounts[0];
  console.log('Owner:', owner);

  // await deploy(deployer, network, accounts);

  // Make sure the Bridge is deployed on all networks first
  await config(deployer, network, accounts);
};

const deploy = async (deployer, network, accounts) => {
  if (network === 'bscTestnet') {
    await deployer.deploy(MockERC20, `Mock${network}`, 'MOCK', 1e9);
    await deployProxy(MockERC721Upgradeable, ['MOCKNFT_BSC', 'MOCKNFT_BSC'], {
      deployer: deployer,
      initializer: 'MockERC721UpgradeableInit',
    });
    await deployProxy(MockERC1155Upgradeable, [], {
      deployer: deployer,
      initializer: 'MockERC1155UpgradeableInit',
    });
    await deployProxy(CrossChainBridgeSimple, [lzEndpoints[chains.BSC_TESTNET]], {
      deployer: deployer,
      initializer: 'CrossChainBridgeSimpleInit',
    });
  } else if (network === 'arbitrumGoerli') {
    await deployer.deploy(MockERC20, `Mock${network}`, 'MOCK', 1e9);
    await deployProxy(MockERC721Upgradeable, ['MOCKNFT_ARB', 'MOCKNFT_ARB'], {
      deployer: deployer,
      initializer: 'MockERC721UpgradeableInit',
    });
    await deployProxy(MockERC1155Upgradeable, [], {
      deployer: deployer,
      initializer: 'MockERC1155UpgradeableInit',
    });
    await deployProxy(CrossChainBridgeSimple, [lzEndpoints[chains.ARB_GOERLI]], {
      deployer: deployer,
      initializer: 'CrossChainBridgeSimpleInit',
    });
  }

  const instanceToken = await MockERC20.deployed();
  console.log(`Token ${network}:`, instanceToken.address);

  console.log(`MockERC721 ${network}:`, (await MockERC721Upgradeable.deployed()).address);
  console.log(`MockERC1155 ${network}:`, (await MockERC1155Upgradeable.deployed()).address);

  const instanceBridge = await CrossChainBridgeSimple.deployed();
  console.log(`Bridge ${network}:`, instanceBridge.address);
};

const config = async (deployer, network, accounts) => {
  const BRIDGE_BSC = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  const TOKEN_BSC = '0x17D3e3819830672DC29cb7192b6641c297b0B838';
  const ERC721_BSC = '0xb17067aE7bceBeB9B7dFaF4AeC73aB18c9689Fe0';
  const ERC1155_BSC = '0xdEf640235347FD678A0100303f3a2E3473dD8847';

  const BRIDGE_ARB = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  const TOKEN_ARB = '0x17D3e3819830672DC29cb7192b6641c297b0B838';
  const ERC721_ARB = '0xb17067aE7bceBeB9B7dFaF4AeC73aB18c9689Fe0';
  const ERC1155_ARB = '0xdEf640235347FD678A0100303f3a2E3473dD8847';

  const MINTER_ROLE = web3.utils.keccak256('MINTER_ROLE');

  let instanceBridge;
  if (network === 'bscTestnet') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_BSC);

    // Config trusted remote address:
    // function setTrustedRemoteAddress(uint16 _remoteChainId, bytes calldata _remoteAddress)
    await instanceBridge.setTrustedRemoteAddress(chains.ARB_GOERLI, BRIDGE_ARB);

    // Config token:
    // function configToken(address localToken, address remoteToken)
    await instanceBridge.configToken(TOKEN_BSC, TOKEN_ARB);
    await instanceBridge.configToken(ERC721_BSC, ERC721_ARB);
    await instanceBridge.configToken(ERC1155_BSC, ERC1155_ARB);

    // Allow Bridge can mint NFT
    await (await MockERC721Upgradeable.at(ERC721_BSC)).grantRole(MINTER_ROLE, instanceBridge.address);
    await (await MockERC1155Upgradeable.at(ERC1155_BSC)).grantRole(MINTER_ROLE, instanceBridge.address);
  } else if (network === 'arbitrumGoerli') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_ARB);
    await instanceBridge.setTrustedRemoteAddress(chains.BSC_TESTNET, BRIDGE_BSC);

    await instanceBridge.configToken(TOKEN_ARB, TOKEN_BSC);
    await instanceBridge.configToken(ERC721_ARB, ERC721_BSC);
    await instanceBridge.configToken(ERC1155_ARB, ERC1155_BSC);

    await (await MockERC721Upgradeable.at(ERC721_ARB)).grantRole(MINTER_ROLE, instanceBridge.address);
    await (await MockERC1155Upgradeable.at(ERC1155_ARB)).grantRole(MINTER_ROLE, instanceBridge.address);
  }
};
