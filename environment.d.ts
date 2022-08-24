export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MAINNET_RPC_URL: string;
      RINKEBY_RPC_URL: string;
      KOVAN_RPC_URL: string;
      POLYGON_MAINNET_RPC_URL: string;
      PRIVATE_KEY: string;

      MNEMONIC: string;
      FORKING_BLOCK_NUMBER: string;

      ETHERSCAN_API_KEY: string;
      POLYGONSCAN_API_KEY: string;
      REPORT_GAS: string;
    }
  }
}
