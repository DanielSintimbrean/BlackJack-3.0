import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { contract } from "../utilis/contractsName";
import {
  VRFCoordinatorV2Mock__factory,
  VRFCoordinatorV2Mock,
  BlackJack3,
  BlackJack3__factory,
} from "../typechain-types";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { networkConfig, developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } from "../helper-hardhat-config";
import { deployVRFCoordinatorV2Mock } from "../deploy/VRFCoordinatorV2Mock";
import { BlackJack3Interface } from "../typechain-types/contracts/BlackJack3";

describe("Lock", function () {
  async function deployBlackJack() {
    const chainId = network.config.chainId;

    if (!chainId) {
      return;
    }

    let vrfCoordinatorAddress;
    let subscriptionId;

    if (chainId === 31337) {
      const VRFCoordinatorV2Mock = await deployVRFCoordinatorV2Mock();

      const fundAmount: BigNumber = networkConfig[chainId].fundAmount;
      const transaction: ContractTransaction = await VRFCoordinatorV2Mock.createSubscription();
      const transactionReceipt: ContractReceipt = await transaction.wait(1);

      if (!transactionReceipt.events) return;

      vrfCoordinatorAddress = VRFCoordinatorV2Mock.address;
      subscriptionId = ethers.BigNumber.from(transactionReceipt.events[0].topics[1]);

      await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, fundAmount);
    } else {
      vrfCoordinatorAddress = networkConfig[chainId].vrfCoordinator;
      subscriptionId = BigNumber.from(process.env.VRF_SUBSCRIPTION_ID);
    }
    const keyHash: string | undefined = networkConfig[chainId].keyHash;

    const BlackJackFactory: BlackJack3__factory = (await ethers.getContractFactory(
      contract.BlackJack3
    )) as BlackJack3__factory;

    const BlackJack = await BlackJackFactory.deploy(subscriptionId, vrfCoordinatorAddress!, keyHash!);
    await BlackJack.deployed();
    return BlackJack;
  }
});
