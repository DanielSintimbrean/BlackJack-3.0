import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "hardhat-deploy";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      // If you want to do some forking set `enabled` to true
      // forking: {
      //   url: MAINNET_RPC_URL,
      //   blockNumber: Number(FORKING_BLOCK_NUMBER),
      //   enabled: false,
      // },
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
    },
  },
  solidity: "0.8.9",
  namedAccounts: {
    deployer: {
      default: 0,
    },
    users: {
      default: 0,
    },
  },
};

export default config;
