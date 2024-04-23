/*
truffle migrate -f 1 --to 1 --network bscTestnet
truffle run verify Migration --network bscTestnet

truffle migrate -f 1 --to 1 --network bscMainnet
truffle run verify Migration --network bscMainnet
 */
const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');

const MockToken = artifacts.require('MockToken');
const MockERC721 = artifacts.require('MockERC721');
const MockERC1155 = artifacts.require('MockERC1155');
const MockCustomToken = artifacts.require('MockCustomToken');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test') return;
  const owner = accounts[0];
  console.log('Owner:', owner);
  console.log('Owner ETH:', web3.utils.fromWei(await web3.eth.getBalance(owner)));

  await deployMockCustomToken(deployer, network, accounts);
  await deployMockUpgradeableToken(deployer, network, accounts);
  await deployMockUpgradeableToken(deployer, network, accounts);
  await deployMockERC721(deployer, network, accounts);
  await deployMockERC1155(deployer, network, accounts);
};

const deployMockCustomToken = async (deployer, network, accounts) => {
  /// Deploy MockCustomToken
  await deployer.deploy(MockCustomToken, 'MockToken', 'Mock', 18, 1e9);
  const instanceMockCustomToken = await MockCustomToken.deployed();
  // const instanceMockCustomToken = await MockCustomToken.at('');
  console.log('MockCustomToken:', instanceMockCustomToken.address);
  console.log('MockCustomToken owner:', await instanceMockCustomToken.owner());
};

const deployMockUpgradeableToken = async (deployer, network, accounts) => {
  /// Deploy MockToken upgradeable
  await deployProxy(MockToken, [], {
    deployer: deployer,
    initializer: '__MockToken_init',
  });
  const instanceErc20Token = await MockToken.deployed();
  // const instanceErc20Token = await MockToken.at('');
  console.log('ERC20Token:', instanceErc20Token.address);
  console.log('ERC20Token owner:', await instanceErc20Token.owner());
};

const deployMockERC721 = async (deployer, network, accounts) => {
  /// Deploy MockERC721 token upgradeable
  await deployProxy(MockERC721, ['MockERC721', 'MOCK721', 'https://mock.com/'], {
    deployer: deployer,
    initializer: '__MockERC721_init',
  });
  const instanceErc721Token = await MockERC721.deployed();
  // const instanceErc721Token = await MockERC721.at('');
  console.log('ERC721Token:', instanceErc721Token.address);
  console.log('ERC721Token owner:', await instanceErc721Token.owner());
};

const deployMockERC1155 = async (deployer, network, accounts) => {
  /// Deploy Mock MockERC1155 token upgradeable
  await deployProxy(MockERC1155, ['https://mock.com/{id}.json'], {
    deployer: deployer,
    initializer: '__MockERC1155_init',
  });
  const instanceErc1155Token = await MockERC1155.deployed();
  // const instanceErc1155Token = await MockERC1155.at('');
  console.log('ERC1155Token:', instanceErc1155Token.address);
  console.log('ERC1155Token owner:', await instanceErc1155Token.owner());
};
