import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-typechain";
import "hardhat-deploy";
import "hardhat-log-remover";
import "@nomiclabs/hardhat-etherscan";

module.exports = {
  // defaultNetwork: "testnet",
  etherscan: {
    apiKey: "QH83WWYSSN2TRC8J3ZPRZFBAFT262VAKUN",
  },
  verify: {
    testnet: "QH83WWYSSN2TRC8J3ZPRZFBAFT262VAKUN",
  },
  networks: {
    //   testnet1: {
    //     url: "http://127.0.0.1:8545",
    //     accounts: [
    //       "0x3630f5dde1edc4269bcd4f3244da44f01b58f61a8bf97bfcc465c46823c766c4",
    //       "0x3c7069cea17777c40f705efea06a0a0e60124c44b432655bad514a0572571491",
    //       "0x45b51420cb0c826316f4ad51fc38f49b1eac6a925834ddf8a624edde651e4949",
    //       "0x074017248c87e69d68061e522dd125b55f5f61c50b51002e934419e25ed9d1af",
    //     ],
    //   },
    testnet: {
      url: "http://127.0.0.1:8545",
      accounts: [
        "0x21ff6bd82dbce0969eb5dca42ba675ab2d8853a43b01ba457519e06416e37e9f",
        "0x9978e01662aa373bb1c8025b98fcc25ccfc7d32d0a6b96e447b4926a5829b1b2",
        "0xec4715c07965b798a48007be8262fbc6f43be0e888efc9ccf378fc8c932c138b",
        "0x6dde4d52057100a94402be22dc42f2ffb8106be671a01f35a4b181a10f640786",
      ],
    },
    // hardhat: {
    //   chainId: 31337,
    //   gas: 12000000,
    //   blockGasLimit: 0x1fffffffffffff,
    //   allowUnlimitedContractSize: true,
    //   timeout: 1800000,
    //   accounts: [
    //     {
    //       privateKey: process.env.LOCAL_PRIVATE_KEY_1,
    //       balance: "10000000000000000000000",
    //     },
    //     {
    //       privateKey: process.env.LOCAL_PRIVATE_KEY_2,
    //       balance: "10000000000000000000000",
    //     },
    //     {
    //       privateKey: process.env.LOCAL_PRIVATE_KEY_3,
    //       balance: "10000000000000000000000",
    //     },
    //     {
    //       privateKey: process.env.LOCAL_PRIVATE_KEY_4,
    //       balance: "10000000000000000000000",
    //     },
    //   ],
    // },
    // testnet: {
    //   url: "https://rpc.testnet.fantom.network",
    //   accounts: ["e92bedc9ba43804653a850fa7b2d5058da594bffd0881f0d7c8f13e869e6d2d5"],
    // },
    // testnet: {
    //   url: "https://rpc.ftm.tools",
    //   accounts: ["e92bedc9ba43804653a850fa7b2d5058da594bffd0881f0d7c8f13e869e6d2d5"],
    //   // chainId: 250,
    // },
    // testnet: {
    //   url: "https://data-seed-prebsc-1-s1.binance.org:8545",
    //   accounts: ["e92bedc9ba43804653a850fa7b2d5058da594bffd0881f0d7c8f13e869e6d2d5"],
    //   chainId: 97,
    // },
    // mainnet: {
    //   url: process.env.BSC_MAINNET_RPC,
    //   accounts: [process.env.BSC_MAINNET_PRIVATE_KEY],
    // },
    // mainnetfork: {
    //   url: "http://127.0.0.1:8545",
    //   accounts: [process.env.BSC_MAINNET_PRIVATE_KEY],
    //   timeout: 500000,
    // },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 168,
      },
      evmVersion: "istanbul",
      outputSelection: {
        "*": {
          "": ["ast"],
          "*": [
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            "abi",
            "evm.bytecode.sourceMap",
            "evm.deployedBytecode.sourceMap",
            "metadata",
            "storageLayout",
          ],
        },
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "./typechain",
    target: process.env.TYPECHAIN_TARGET || "ethers-v5",
  },
  mocha: {
    timeout: 500000,
  },
};
