/*
truffle migrate -f 2 --to 2 --network bscTestnet
truffle migrate -f 2 --to 2 --network arbitrumGoerli
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
const PACKET_TYPES = {
  PT_TEXT: 0, // Update text request
  PT_SWAP_TOKEN: 1, // Swap token request
  PT_SWAP_NFT: 2, // Swap NFT ERC721 request
  PT_SWAP_FT: 3, // Swap FT ERC1155 request
};

module.exports = async function (deployer, network, accounts) {
  if (network === 'test') return;
  const owner = accounts[0];
  console.log('Owner:', owner);

  await demo(deployer, network, accounts);
};

// Requisite for the Bridge on both chains:
// - Must have enough tokens to distribute
// - Must have permission to mint new NFTs
// Assume we run demo swap from ARB to BSC, we need to prepare something on BSC first:
// - Deposit some tokens to the BSC Bridge
// - Deposit some NFTs (ERC721) to the BSC Bridge
// - Deposit some FTs (ERC1155) to the BSC Bridge

const demo = async (deployer, network, [owner]) => {
  const BRIDGE_BSC = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  const TOKEN_BSC = '0x17D3e3819830672DC29cb7192b6641c297b0B838';
  const ERC721_BSC = '0xb17067aE7bceBeB9B7dFaF4AeC73aB18c9689Fe0';
  const ERC1155_BSC = '0xdEf640235347FD678A0100303f3a2E3473dD8847';

  const BRIDGE_ARB = '0x15e67AB6A07D2222766AD24Dd71d31cEBDC79d42';
  const TOKEN_ARB = '0x17D3e3819830672DC29cb7192b6641c297b0B838';
  const ERC721_ARB = '0xb17067aE7bceBeB9B7dFaF4AeC73aB18c9689Fe0';
  const ERC1155_ARB = '0xdEf640235347FD678A0100303f3a2E3473dD8847';

  let instanceToken;
  let instanceERC721;
  let instanceERC1155;
  let instanceBridge;
  let dstChainId;

  if (network === 'bscTestnet') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_BSC);

    instanceToken = await MockERC20.at(TOKEN_BSC);
    instanceERC721 = await MockERC721Upgradeable.at(ERC721_BSC);
    instanceERC1155 = await MockERC1155Upgradeable.at(ERC1155_BSC);
    dstChainId = chains.ARB_GOERLI;
  } else if (network === 'arbitrumGoerli') {
    instanceBridge = await CrossChainBridgeSimple.at(BRIDGE_ARB);

    instanceToken = await MockERC20.at(TOKEN_ARB);
    instanceERC721 = await MockERC721Upgradeable.at(ERC721_ARB);
    instanceERC1155 = await MockERC1155Upgradeable.at(ERC1155_ARB);
    dstChainId = chains.BSC_TESTNET;
  }
  console.log({ network, instanceToken: instanceToken.address, instanceBridge: instanceBridge.address, dstChainId });

  // // Run one-time on BSC
  // await preConfigOnBSCSide(owner, instanceBridge, instanceToken, instanceERC721, instanceERC1155);

  console.log(`PROCESSING FROM A NETWORK: ${network}`);
  await demoUpdateText(network, owner, instanceBridge, dstChainId);
  await demoSwapERC20(network, owner, instanceBridge, dstChainId, instanceToken);
  await demoSwapERC721(network, owner, instanceBridge, dstChainId, instanceERC721);
  await demoSwapERC1155(network, owner, instanceBridge, dstChainId, instanceERC1155);
};

// Assume we run demo swap on ARB, we need to prepare something on BSC first
const preConfigOnBSCSide = async (owner, instanceBridge, instanceToken, instanceERC721, instanceERC1155) => {
  console.log('preConfigOnBSCSide');
  console.log('deposit tokens:', (await instanceToken.transfer(instanceBridge.address, toWei(1e9))).tx);
  console.log('deposit NFT:', (await instanceERC721.safeTransferFrom(owner, instanceBridge.address, 0)).tx);
  console.log('deposit FT:', (await instanceERC1155.safeTransferFrom(owner, instanceBridge.address, 0, 1, '0x')).tx);
};

const demoUpdateText = async (network, owner, instanceBridge, dstChainId) => {
  const text = `Hello from ${network}`;
  console.log(`demoUpdateText:`, text);
  // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
  const estimateUpdateTextFee = await instanceBridge.estimateUpdateTextFee(dstChainId, text);
  console.log('estimateUpdateTextFee:', fromWei(estimateUpdateTextFee.nativeFee));
  const updateTextTx = await instanceBridge.updateText(dstChainId, text, {
    from: owner,
    value: estimateUpdateTextFee.nativeFee,
  });
  console.log(`updateTextTx (gasUsed: ${updateTextTx.receipt.gasUsed}): ${updateTextTx.tx}`);
};

const demoSwapERC20 = async (network, owner, instanceBridge, dstChainId, instanceToken) => {
  console.log('demoSwapERC20');
  const approveTx = await instanceToken.approve(instanceBridge.address, MAX_UINT256, { from: owner });
  console.log('approveTx:', approveTx.tx);

  // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
  const estimateSwapTokensFee = await instanceBridge.estimateSwapTypeFee(
    PACKET_TYPES.PT_SWAP_TOKEN,
    dstChainId,
    instanceBridge.address,
    owner,
    0, // Skip nftId = zero for Token case
    toWei(1_000),
  );
  console.log('estimateSwapTokensFee:', fromWei(estimateSwapTokensFee.nativeFee));
  const swapTokensTx = await instanceBridge.swapTokens(dstChainId, instanceToken.address, toWei(1_000), {
    from: owner,
    value: estimateSwapTokensFee.nativeFee,
  });
  console.log(`swapTokensTx (gasUsed: ${swapTokensTx.receipt.gasUsed}): ${swapTokensTx.tx}`);
};

const demoSwapERC721 = async (network, owner, instanceBridge, dstChainId, instanceERC721) => {
  console.log('demoSwapERC721');
  const setApprovalForAllTx = await instanceERC721.setApprovalForAll(instanceBridge.address, true, { from: owner });
  console.log('setApprovalForAllTx:', setApprovalForAllTx.tx);

  // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
  const estimateSwapNFTFee = await instanceBridge.estimateSwapTypeFee(
    PACKET_TYPES.PT_SWAP_NFT,
    dstChainId,
    instanceBridge.address,
    owner,
    0, // NFT ID
    0, // Skip amount = zero for NFT case
  );
  console.log('estimateSwapNFTFee:', fromWei(estimateSwapNFTFee.nativeFee));
  const swapNFTTx = await instanceBridge.swapNFT(dstChainId, instanceERC721.address, 0, {
    from: owner,
    value: estimateSwapNFTFee.nativeFee,
  });
  console.log(`swapNFTTx (gasUsed: ${swapNFTTx.receipt.gasUsed}): ${swapNFTTx.tx}`);
};

const demoSwapERC1155 = async (network, owner, instanceBridge, dstChainId, instanceERC1155) => {
  console.log('demoSwapERC1155');
  const setApprovalForAllTx = await instanceERC1155.setApprovalForAll(instanceBridge.address, true, { from: owner });
  console.log('setApprovalForAllTx:', setApprovalForAllTx.tx);

  // function estimateFees(...) external view returns (uint nativeFee, uint zroFee)
  const estimateSwapFTFee = await instanceBridge.estimateSwapTypeFee(
    PACKET_TYPES.PT_SWAP_FT,
    dstChainId,
    instanceBridge.address,
    owner,
    0, // FT ID
    1, // FT amount
  );
  console.log('estimateSwapFTFee:', fromWei(estimateSwapFTFee.nativeFee));
  const swapFTTx = await instanceBridge.swapFT(dstChainId, instanceERC1155.address, 0, 1, {
    from: owner,
    value: estimateSwapFTFee.nativeFee,
  });
  console.log(`swapFTTx (gasUsed: ${swapFTTx.receipt.gasUsed}): ${swapFTTx.tx}`);
};
