// truffle test 'test/CrossChainBridgeSimple.test.js' --network test

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
const MockERC721Upgradeable = artifacts.require('MockERC721Upgradeable');
const MockERC1155Upgradeable = artifacts.require('MockERC1155Upgradeable');
const LZEndpointMock = artifacts.require('LZEndpointMock');
const CrossChainBridgeSimple = artifacts.require('CrossChainBridgeSimple');

// Packet types
const PACKET_TYPES = {
  PT_TEXT: 0, // Update text request
  PT_SWAP_TOKEN: 1, // Swap token request
  PT_SWAP_NFT: 2, // Swap NFT ERC721 request
  PT_SWAP_FT: 3, // Swap FT ERC1155 request
};
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MINTER_ROLE = web3.utils.keccak256('MINTER_ROLE');

contract('CrossChainBridgeSimple.test', async ([owner, team, bob]) => {
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
    instanceBridgeBSC = await deployProxy(CrossChainBridgeSimple, [lzEndpoints[chains.BSC_LOCAL]], {
      initializer: 'CrossChainBridgeSimpleInit',
    });
    console.log('BridgeBSC:', instanceBridgeBSC.address);
    instanceBridgeARB = await deployProxy(CrossChainBridgeSimple, [lzEndpoints[chains.ARB_LOCAL]], {
      initializer: 'CrossChainBridgeSimpleInit',
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapTokensTx = await instanceBridgeBSC.swapTokens(chains.ARB_LOCAL, instanceTokenBSC.address, toWei(1_000), {
      from: bob,
      value: nativeFee,
    });
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapTokensTx = await instanceBridgeARB.swapTokens(chains.BSC_LOCAL, instanceTokenARB.address, toWei(1_000), {
      from: bob,
      value: nativeFee,
    });
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapNFTTx = await instanceBridgeBSC.swapNFT(chains.ARB_LOCAL, instanceNFTBSC.address, 1, {
      from: bob,
      value: nativeFee,
    });
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapNFTTx = await instanceBridgeARB.swapNFT(chains.BSC_LOCAL, instanceNFTARB.address, 1, {
      from: bob,
      value: nativeFee,
    });
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapFTTx = await instanceBridgeBSC.swapFT(chains.ARB_LOCAL, instanceFTBSC.address, 1, 1, {
      from: bob,
      value: nativeFee,
    });
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
    );
    console.log('nativeFee:', fromWei(nativeFee));
    const swapFTTx = await instanceBridgeARB.swapFT(chains.BSC_LOCAL, instanceFTARB.address, 1, 1, {
      from: bob,
      value: nativeFee,
    });
    console.log('swapFTTx:', JSON.stringify(swapFTTx.logs));

    const swapFTFee = await getTxFee(swapFTTx.receipt, web3);
    console.log(`fee@swapFT: ${swapFTFee.fee} ETH (${fromWei(swapFTFee.gasPrice, 9)} Gwei, ${swapFTFee.gasUsed} used)`);

    assert.equal(await instanceFTBSC.balanceOf(bob, 1), 1);
    assert.equal(await instanceFTBSC.balanceOf(instanceBridgeBSC.address, 1), 0);
    assert.equal(await instanceFTARB.balanceOf(bob, 1), 0);
    assert.equal(await instanceFTARB.balanceOf(instanceBridgeARB.address, 1), 1);
  });
});

/**
 *   Contract: CrossChainBridgeSimple.test
 * TokenBSC address: 0x3FCc69Ca46557e1e57c2E53506cE430b5DAB31Ba
 * TokenARB address: 0x44C1231F41Aa68bff2b16C55a2462330a172c230
 * NFTBSC address: 0xce241c4ae0567659A14F202b4e40F83E1DbD4959
 * NFTARB address: 0x4bBA95bB465d4aaec941B4742350BE1029f0f127
 * FTBSC address: 0x358f0dE8D1c1835405D23b606B3dd9fD8ca3fdba
 * FTARB address: 0x7629072E82337A9C69F93cdE56e7308aA5589204
 * instanceLZEndpointBSC: 0x81F53a318923ff0d4DFe741990c215FD2D4B65ec
 * instanceLZEndpointARB: 0x32d12e085f9aa7E7df8029f0be8A980886089223
 * BridgeBSC: 0x08f9E62110906ce947767Ee0077F74a5f34905a3
 * BridgeARB: 0x90e30db031cB79F21AC5e6e51b777dbb919F7235
 * BridgeARB Owner: 0x40b598A94396C7b6dD042993f71f41Eb504d5ad9
 * BridgeBSC.trustedRemoteAddress: 0x90e30db031cb79f21ac5e6e51b777dbb919f7235
 * BridgeARB.trustedRemoteAddress: 0x08f9e62110906ce947767ee0077f74a5f34905a3
 * BridgeBSC.trustedRemoteLookup: 0x90e30db031cb79f21ac5e6e51b777dbb919f723508f9e62110906ce947767ee0077f74a5f34905a3
 * BridgeARB.trustedRemoteLookup: 0x08f9e62110906ce947767ee0077f74a5f34905a390e30db031cb79f21ac5e6e51b777dbb919f7235
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0x90e30db031cB79F21AC5e6e51b777dbb919F7235","blockHash":"0x89645999621f4e89768c4c74e4ab075053a76ec273fbd64011ef056291079fe7","blockNumber":272,"logIndex":0,"removed":false,"transactionHash":"0x76271806f96d6e728e6a4a1b161e045213427de9c2d2e681b4762acaf3f55f4d","transactionIndex":0,"id":"log_6ff14ba1","event":"ETextFromChain","args":{"0":"44e","1":"Hello from BSC","__length__":2,"srcChainId":"44e","text":"Hello from BSC"}}]
 * fee@updateText: 0.00037282200000000003 ETH (2.0 Gwei, 186411 used)
 *     ✔ Update text from BSC to ARB (582ms)
 * nativeFee: 0.013202508
 * updateTextTx: [{"address":"0x08f9E62110906ce947767Ee0077F74a5f34905a3","blockHash":"0xc5e1e43afa2d08c1ea828a8a03dc08135f13cf4538af0508edbf3042ffcd3648","blockNumber":273,"logIndex":0,"removed":false,"transactionHash":"0xd55b864f1fb5e7b270519886f24892e5f19e8ddfbbc00d45ca409bbd2700722a","transactionIndex":0,"id":"log_fc32ec74","event":"ETextFromChain","args":{"0":"456","1":"Hello from ARB","__length__":2,"srcChainId":"456","text":"Hello from ARB"}}]
 * fee@updateText: 0.00037282200000000003 ETH (2.0 Gwei, 186411 used)
 *     ✔ Update text from ARB to BSC (350ms)
 * nativeFee: 0.013202508
 * swapTokensTx: [{"address":"0x90e30db031cB79F21AC5e6e51b777dbb919F7235","blockHash":"0x28aa5a47fa88a418837b86a00b758ed78a17d183d26ceced18393c3b18aa858e","blockNumber":275,"logIndex":3,"removed":false,"transactionHash":"0x770da8ce1438f9e70a8351fa0d2dbbd1297ba6e82fbdd7a6806c419af2ca5511","transactionIndex":0,"id":"log_cffd5481","event":"ESwapTokenFromChain","args":{"0":"44e","1":"0x3FCc69Ca46557e1e57c2E53506cE430b5DAB31Ba","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"44e","remoteToken":"0x3FCc69Ca46557e1e57c2E53506cE430b5DAB31Ba","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","amount":"3635c9adc5dea00000"}}]
 * fee@swapTokens: 0.00039348400000000004 ETH (2.0 Gwei, 196742 used)
 *     ✔ Bridge token from BSC to ARB (389ms)
 * nativeFee: 0.013202508
 * swapTokensTx: [{"address":"0x08f9E62110906ce947767Ee0077F74a5f34905a3","blockHash":"0x3a1ff9c25737a5294be4d5bbdbb1d31fc3b0ca0da88ef43a2a16de8bb78ecfb4","blockNumber":277,"logIndex":3,"removed":false,"transactionHash":"0x79f571b94264ba0fda540b39d28dcfff8d62891112af4dbe7026bf288a011b85","transactionIndex":0,"id":"log_6d263d02","event":"ESwapTokenFromChain","args":{"0":"456","1":"0x44C1231F41Aa68bff2b16C55a2462330a172c230","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"3635c9adc5dea00000","__length__":4,"srcChainId":"456","remoteToken":"0x44C1231F41Aa68bff2b16C55a2462330a172c230","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","amount":"3635c9adc5dea00000"}}]
 * fee@swapTokens: 0.00039348400000000004 ETH (2.0 Gwei, 196742 used)
 *     ✔ Bridge token from ARB to BSC (381ms)
 * nativeFee: 0.013202508
 * swapNFTTx: [{"address":"0x90e30db031cB79F21AC5e6e51b777dbb919F7235","blockHash":"0xfae0117856e85d2d62aba8e6fc8da20377df56efda894af1692b9e59ef608a26","blockNumber":280,"logIndex":3,"removed":false,"transactionHash":"0x46fe57d3b9e6a2f3411ca0a6709c2e6d2c4f55c12307851559a787ac1340de5d","transactionIndex":0,"id":"log_eb44e0dd","event":"ESwapNFTFromChain","args":{"0":"44e","1":"0xce241c4ae0567659A14F202b4e40F83E1DbD4959","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"1","__length__":4,"srcChainId":"44e","remoteToken":"0xce241c4ae0567659A14F202b4e40F83E1DbD4959","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","nftId":"1"}}]
 * fee@swapNFT: 0.0004952180000000001 ETH (2.0 Gwei, 247609 used)
 *     ✔ Bridge NFT ERC721 from BSC to ARB (672ms)
 * nativeFee: 0.013202508
 * swapNFTTx: [{"address":"0x08f9E62110906ce947767Ee0077F74a5f34905a3","blockHash":"0x5a242e545362b5e13406d7910dd0d3f9e3e72bc9a42e649f35634df7447b2f45","blockNumber":282,"logIndex":4,"removed":false,"transactionHash":"0xbd2eeab1f39d7168f4a17b4221b1d217cd1b593cc201fd78c9ed91d59a2d16ec","transactionIndex":0,"id":"log_5ea79dc6","event":"ESwapNFTFromChain","args":{"0":"456","1":"0x4bBA95bB465d4aaec941B4742350BE1029f0f127","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"1","__length__":4,"srcChainId":"456","remoteToken":"0x4bBA95bB465d4aaec941B4742350BE1029f0f127","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","nftId":"1"}}]
 * fee@swapNFT: 0.000456974 ETH (2.0 Gwei, 228487 used)
 *     ✔ Bridge NFT ERC721 from ARB to BSC (515ms)
 * nativeFee: 0.01320286
 * swapFTTx: [{"address":"0x90e30db031cB79F21AC5e6e51b777dbb919F7235","blockHash":"0x35b8d161d6ce02aa5ec86d36d15303930516b94905b7717061bab0f3d1b42f92","blockNumber":285,"logIndex":2,"removed":false,"transactionHash":"0x9a914b23bff95c5e15d2ee55d3259f709217538fec0ebb4ee9d246a0ce4bf23c","transactionIndex":0,"id":"log_6eaa73ff","event":"ESwapFTFromChain","args":{"0":"44e","1":"0x358f0dE8D1c1835405D23b606B3dd9fD8ca3fdba","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"1","4":"1","__length__":5,"srcChainId":"44e","remoteToken":"0x358f0dE8D1c1835405D23b606B3dd9fD8ca3fdba","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","nftId":"1","amount":"1"}}]
 * fee@swapFT: 0.000428476 ETH (2.0 Gwei, 214238 used)
 *     ✔ Bridge FT ERC1155 from BSC to ARB (424ms)
 * nativeFee: 0.01320286
 * swapFTTx: [{"address":"0x08f9E62110906ce947767Ee0077F74a5f34905a3","blockHash":"0x76b571e88abdaa774be8ed138205f87bdf70d3b0eba5c7b22a0ed2c77f914ee4","blockNumber":287,"logIndex":2,"removed":false,"transactionHash":"0xc600c6fd9b0f7eed311517dcbf0f096c11903ed9c274ee4a2a282a2125754628","transactionIndex":0,"id":"log_fed84308","event":"ESwapFTFromChain","args":{"0":"456","1":"0x7629072E82337A9C69F93cdE56e7308aA5589204","2":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","3":"1","4":"1","__length__":5,"srcChainId":"456","remoteToken":"0x7629072E82337A9C69F93cdE56e7308aA5589204","to":"0xD63017AE5A5a3d7361fA3A75B5A30Cb2756BC93e","nftId":"1","amount":"1"}}]
 * fee@swapFT: 0.000422206 ETH (2.0 Gwei, 211103 used)
 *     ✔ Bridge FT ERC1155 from ARB to BSC (461ms)
 *
 *
 *   8 passing (7s)
 */
