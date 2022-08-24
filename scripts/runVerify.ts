import { BigNumber } from "ethers";
import { network } from "hardhat";
import { networkConfig } from "../helper-hardhat-config";
import { verify } from "../utils/verify";

async function main() {
  const address = "0x07220eA2379DbBD99503842B1B0Adc73017595Dd";
  const chainId = network.config.chainId!;
  const subscriptionId = BigNumber.from(process.env.VRF_SUBSCRIPTION_ID);
  const vrfCoordinatorAddress = networkConfig[chainId].vrfCoordinator;
  const keyHash = networkConfig[chainId].keyHash!;
  await verify(address, [subscriptionId, vrfCoordinatorAddress!, keyHash!]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
