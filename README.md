# CROSS-CHAIN BRIDGE BY LAYER-ZERO

- Home: https://layerzero.network
- Paper: https://layerzero.network/pdf/LayerZero_Whitepaper_Release.pdf
- Supported chains: https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids
- DOCS: https://layerzero.gitbook.io/docs/evm-guides/master
- Examples: https://github.com/LayerZero-Labs/solidity-examples
- Applications:
  - Testnet Bridge (swap ETH mainnet -> ETH Testnet (goerli)): https://testnetbridge.com
  - https://github.com/LayerZero-Labs/mainnet-testnet-bridge

## DETAILS

### SENDING TOKEN FROM ARB GOERLI

- Swap 1k ARB Token to BSC:
  - ARB config {
    network: 'arbitrumGoerli',
    instanceToken: '0x15f67668fAaC8975Cd709d2a5cf4DcEA37033787',
    instanceBridge: '0xE03a5DdBDA2c1B7583608B5347E014BB813890Eb',
    dstChainId: 10102
    }
  - Off-chain estimate native fee: 0.001775964787756204 ETH
  - Arb Tx: https://goerli.arbiscan.io/tx/0xc7fbd005896379238bff52fa25ca28bda443deb45d6eacbe9566d846f215d73f
  - Sent at: Apr-03-2023 10:47:08 AM +UTC
  - Transaction Value: 0.001775964787756204 ETH ($3.2)
  - Transaction Fee: 0.00026500206563 ETH ($0.48 at 1811.31 USD)
  - Total ETH paid: 0.002040966853386 ETH ($3.7)
  - Gas Limit & Usage by Txn: 3,974,032 | 2,444,443 (61.51%)
  - Gas Price Bid: 0.00000000260841 ETH (2.60841 Gwei)
  - Gas Price Paid: 0.00000000010841 ETH (0.10841 Gwei)
- Credited on BSC Testnet chain:
  - Bsc Tx: https://testnet.bscscan.com/tx/0xbcfd5409f09cf9fcbe9bc8fe31d2d078312fe761d9fb215f19bbf7e0b795c31e
  - Received at: Apr-03-2023 10:47:56 AM +UTC
  - Transaction Fee: 0.002065332 BNB ($0.65 at 314.72 USD)
  - Gas Price: 0.000000012 BNB (12 Gwei)
  - Gas Limit & Usage by Txn: 1,465,996 | 172,111 (11.74%)

=> Credited duration: 48 seconds with 0.001775964787756204 ETH ($3.2) service fee

### UPDATING TEXT FROM ARB GOERLI

- Request update text 'Hello from arbitrumGoerli'

  - Off-chain estimate native fee: 0.001775964787756204 ETH
  - Arb Tx: https://goerli.arbiscan.io/tx/0x4e1b7b87be89d1b8af5bb9a73a1005a2316ab25725f4869744c85ae99ea63513
  - Sent at: Apr-03-2023 10:47:10 AM +UTC
  - Transaction Value: 0.001775964787756204 ETH ($3.2)
  - Transaction Fee: 0.00028995636117 ETH ($0.52 at 1793.37 USD)
  - Total ETH paid: 0.002065921148926 ETH ($3.72)
  - Gas Limit & Usage by Txn: 4,358,796 | 2,730,543 (62.64%)
  - Gas Price Bid: 0.00000000260619 ETH (2.60619 Gwei)
  - Gas Price Paid: 0.00000000010619 ETH (0.10619 Gwei)

- Updated on BSC Testnet chain:
  - Bsc Tx: https://testnet.bscscan.com/tx/0xd6650629fbcb107085a557e34614d83290b318de14ab64aa381896856eb9c708
  - Received at: Apr-03-2023 10:48:05 AM +UTC
  - Transaction Fee: 0.001855848 BNB ($0.58 at 312.53 USD)
  - Gas Price: 0.000000012 BNB (12 Gwei)
  - Gas Limit & Usage by Txn: 1,449,868 | 154,654 (10.67%)

=> Updated duration: 55 seconds with 0.001775964787756204 ETH ($3.2) service fee

### SENDING TOKEN FROM BSC TESTNET

- Swap 1k BSC Token to ARB:

  - BSC config {
    network: 'bscTestnet',
    instanceToken: '0x3ED93B854611B1A49c16bb673a0F9f5FF062fAB0',
    instanceBridge: '0x6b57a18ab9009d827156792b77B2D11B204a464A',
    dstChainId: 10143
    }
  - Off-chain estimate native fee: 0.003463698622234575 BNB
  - Bsc Tx: https://testnet.bscscan.com/tx/0x84c1aa015034292faa8a3ad2b9ed104a5d9aeb4c4eb5c07bad63808f9ad3e6a3
  - Sent at: Apr-03-2023 10:48:59 AM +UTC
  - Transaction Value: 0.003463698622234575 BNB ($1.1)
  - Transaction Fee: 0.00187918 BNB ($0.59 at 313.97 USD)
  - Total BNB paid: 0.005342878622235 BNB ($1.69)
  - Gas Price: 0.00000001 BNB (10 Gwei)
  - Gas Limit & Usage by Txn: 247,690 | 187,918 (75.87%)

- Credited on ARB Goerli chain:
  - Arb Tx: https://goerli.arbiscan.io/tx/0x03593ddd3039ecdee7d8c435ca7b02108c29831352392fce9e8c324542c29796
  - Received at: Apr-03-2023 10:49:43 AM +UTC
  - Transaction Fee: 0.0020259244 ETH ($3.66 at 1806.58 USD)
  - Gas Limit & Usage by Txn: 128,420,670 | 20,259,244 (15.78%)
  - Gas Price Bid: 0.00000000012 ETH (0.12 Gwei)
  - Gas Price Paid: 0.0000000001 ETH (0.1 Gwei)

=> Credited duration: 44 seconds with 0.003463698622234575 BNB ($1.1) service fee

### UPDATING TEXT FROM BSC TESTNET

- Request update text 'Hello from bscTestnet'

  - Off-chain estimate native fee: 0.003463698622234575 BNB
  - Bsc Tx: https://testnet.bscscan.com/tx/0xa114907af0de67bd06a9248706cd0ef17ee183a621b71616eda364c7ba213063
  - Sent at: Apr-03-2023 10:49:05 AM +UTC
  - Transaction Value: 0.003463698622234575 BNB ($1.1)
  - Transaction Fee: 0.0016306 BNB ($0.51 at 312.77 USD)
  - Total BNB paid: 0.005094298622235 BNB ($1.61)
  - Gas Price: 0.00000001 BNB (10 Gwei)
  - Gas Limit & Usage by Txn: 216,125 | 163,060 (75.45%)

- Updated on ARB Goerli chain:
  - Arb Tx: https://goerli.arbiscan.io/tx/0x826f3d6bdc4acbc40ced4ed14538bff6cc67e42400491303489ab9a19852e649
  - Received at: Apr-03-2023 10:49:58 AM +UTC
  - Transaction Fee: 0.0020631837 ETH ($3.72 at 1803.04 USD)
  - Gas Limit & Usage by Txn: 123,856,782 | 20,631,837 (16.66%)
  - Gas Price Bid: 0.00000000012 ETH (0.12 Gwei)
  - Gas Price Paid: 0.0000000001 ETH (0.1 Gwei)

=> Updated duration: 53 seconds with 0.003463698622234575 BNB ($1.1) service fee

## More cases

### ARB -> BSC

- Total fee (deploy, config, demo): 0.006 ETH at 0.1 Gwei
- Update text (gasUsed: 273458): 0xb011d433650f1748e2c263f0ed7d4ed8ba86095d2e5f087786ac9cfade2cf10c
- Swap ERC20 (gasUsed: 276928): 0xd4902fd123669e49acb91a25e4848bae4eb6f769b8cdd415650a3bcf0016383b
- Swap ERC721 (gasUsed: 287203): 0x5c14d679121827b8afe5926209dcc5487dbbdf88b023fe2487119279665de770
- Swap ERC1155 (gasUsed: 281682): 0xe2d2adc5e5535ae9308e448570ee4a6cb73d87e1c0462c260e5d7a18449f6226

### BSC -> ARB

- Total fee (deploy, config, demo): 0.054 BNB at 2.5 Gwei
- Update text (gasUsed: 251391): 0xb6c77873705d34e238596ea67f6fa9627027b3002dbfb994608506ce413ba8e3
- Swap ERC20 (gasUsed: 236169): 0x69c36b6e564b7805c13ad8acb6837b0c2abd33e7c54d98c117758b778c571bd3
- Swap ERC721 (gasUsed: 268344): 0x168c744466c501ea319b2903804d2a3fb7c2f918cc657d81ddd90f442131e969
- Swap ERC1155 (gasUsed: 259663): 0x197009596784a5dccddb14dfc8a9476c9da127a20fb0fc6079a65793b7cfa9c4
