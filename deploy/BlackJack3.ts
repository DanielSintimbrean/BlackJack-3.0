import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network } from "hardhat";
import { contract } from "../utilis/contractsName";
import { VRFCoordinatorV2Mock, BlackJack3, BlackJack3__factory } from "../typechain-types";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { networkConfig } from "../helper-hardhat-config";
import { deployVRFCoordinatorV2Mock } from "../deploy/VRFCoordinatorV2Mock";

export async function deployBlackJack3(): Promise<{
  BlackJack3: BlackJack3;
  VRFCoordinatorV2Mock: VRFCoordinatorV2Mock | undefined;
  vrfCoordinatorAddress: string;
  subscriptionId: BigNumber;
}> {
  const chainId = network.config.chainId;
  let vrfCoordinatorAddress;
  let subscriptionId: BigNumber;
  let VRFCoordinatorV2Mock;

  if (!chainId) {
    throw new Error();
  }

  if (chainId === 31337) {
    VRFCoordinatorV2Mock = await deployVRFCoordinatorV2Mock();

    const fundAmount: BigNumber = networkConfig[chainId].fundAmount;
    const transaction: ContractTransaction = await VRFCoordinatorV2Mock.createSubscription();
    const transactionReceipt: ContractReceipt = await transaction.wait(1);

    if (!transactionReceipt.events) throw new Error("Fail on transaction receipt");

    vrfCoordinatorAddress = VRFCoordinatorV2Mock.address;

    subscriptionId = ethers.BigNumber.from(transactionReceipt.events[0].topics[1]);

    await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, fundAmount);
  } else {
    vrfCoordinatorAddress = networkConfig[chainId].vrfCoordinator;
    if (!vrfCoordinatorAddress) {
      throw new Error(`Network Config: vrfCoordinator property, not set properly for chainId: ${chainId}`);
    }
    subscriptionId = BigNumber.from(process.env.VRF_SUBSCRIPTION_ID);
  }
  const keyHash = networkConfig[chainId].keyHash!;
  const BlackJackFactory: BlackJack3__factory = (await ethers.getContractFactory(
    contract.BlackJack3
  )) as BlackJack3__factory;

  const BlackJack3 = await BlackJackFactory.deploy(subscriptionId, vrfCoordinatorAddress!, keyHash!);

  if (VRFCoordinatorV2Mock) {
    await VRFCoordinatorV2Mock.addConsumer(subscriptionId, BlackJack3.address);
    await setBalance(BlackJack3.address, ethers.utils.parseEther("10"));
  }

  return { BlackJack3, VRFCoordinatorV2Mock, subscriptionId, vrfCoordinatorAddress };
}
