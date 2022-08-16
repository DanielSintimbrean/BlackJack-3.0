import { VRFCoordinatorV2Mock__factory, VRFCoordinatorV2Mock } from "../typechain-types";
import { ethers } from "hardhat";
import { contract } from "../utilis/contractsName";

const BASE_FEE = "100000000000000000";
const GAS_PRICE_LINK = "1000000000"; // 0.000000001 LINK per gas

export async function deployVRFCoordinatorV2Mock() {
  const VrfFactory: VRFCoordinatorV2Mock__factory = (await ethers.getContractFactory(
    contract.VRFCoordinatorV2Mock
  )) as VRFCoordinatorV2Mock__factory;
  const VRFCoordinatorV2Mock = await VrfFactory.deploy(BASE_FEE, GAS_PRICE_LINK);
  await VRFCoordinatorV2Mock.deployed();
  return VRFCoordinatorV2Mock;
}
