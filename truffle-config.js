require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');

const MNEMONIC = process.env.MNEMONIC;
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY;

module.exports = {
  contracts_directory: './src/active',
  contracts_build_directory: './src/abis',

  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      // provider: () => new HDWalletProvider(MNEMONIC, 'http://127.0.0.1:8545'),
      network_id: '*',
      skipDryRun: true,
      websockets: true,
      // gas: 4698712,
      // gasPrice: 47000000000,
    },
    test: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
      skipDryRun: true,
      websockets: true,
    },
    // main ethereum network(mainnet)
    mainnet: {
      provider: () => new HDWalletProvider(MNEMONIC, `wss://mainnet.infura.io/ws/v3/${INFURA_API_KEY}`),
      network_id: 1,
      skipDryRun: true,
      networkCheckTimeout: 90000,
      timeoutBlocks: 200, // # of blocks before a deployment times out  (minimum/default: 50)
      // gas: 4698712,
      // gasPrice: 55000000000,
    },
    // bsc testnet
    bscTestnet: {
      // provider: () => new HDWalletProvider(MNEMONIC, 'https://data-seed-prebsc-1-s1.binance.org:8545'),
      provider: () => new HDWalletProvider(MNEMONIC, process.env.BSC_WEB3_PROVIDER_TESTNET_HTTPS),
      network_id: 97,
      skipDryRun: true,
      networkCheckTimeout: 90000,
      timeoutBlocks: 200,
      // gas: 4698712,
      // gasPrice: 10000000000,
    },
    // bsc mainnet
    bscMainnet: {
      // Try other to avoid Network Error as backup plan
      // - https://app.ankr.com/api: READ is ok, but Syncing too slow and make error in WRITE case, epecially multi write
      // - https://www.quicknode.com: Faster response, better than public rpc official of BSC, but not FREE
      // provider: () => new HDWalletProvider(MNEMONIC, 'https://bsc-dataseed.binance.org'),
      provider: () => new HDWalletProvider(MNEMONIC, process.env.BSC_WEB3_PROVIDER_MAINNET_HTTPS),
      network_id: 56,
      networkCheckTimeout: 90000,
      timeoutBlocks: 200,
      // gas: 4698712, // can up to 100M
      // gasPrice: 5000000000,
    },
    // Arbitrum goerli
    arbitrumGoerli: {
      provider: () => new HDWalletProvider(MNEMONIC, `wss://arbitrum-goerli.infura.io/ws/v3/${INFURA_API_KEY}`),
      // provider: () => new HDWalletProvider(MNEMONIC, 'https://goerli-rollup.arbitrum.io/rpc'),
      network_id: 421613,
      networkCheckTimeout: 90000,
      // gasPrice: 100000000, // 0.1 Gwei
      // gas: 50000000, // Use this 287938372 for deploy token
    },
    // Arbitrum mainnet
    arbitrumMainnet: {
      provider: () => new HDWalletProvider(MNEMONIC, `wss://arbitrum-mainnet.infura.io/ws/v3/${INFURA_API_KEY}`),
      // provider: () => new HDWalletProvider(MNEMONIC, 'https://arb1.arbitrum.io/rpc'),
      network_id: 42161,
      networkCheckTimeout: 90000,
      gasPrice: 100000000, // 0.1 Gwei
      // gas: 287853530,
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    timeout: 1000000000,
  },

  // Auto publish and verify contract
  plugins: ['truffle-plugin-verify', 'truffle-contract-size'],
  api_keys: {
    etherscan: ETHERSCAN_API_KEY,
    bscscan: BSCSCAN_API_KEY,
    arbiscan: ARBISCAN_API_KEY,
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: '0.8.4',
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200,
        },
        // evmVersion: 'byzantium',
      },
    },
  },

  // Truffle DB is currently disabled by default; to enable it, change enabled: false to enabled: true
  //
  // Note: if you migrated your contracts prior to enabling this field in your Truffle project and want
  // those previously migrated contracts available in the .db directory, you will need to run the following:
  // $ truffle migrate --reset --compile-all

  db: {
    enabled: false,
  },
};
