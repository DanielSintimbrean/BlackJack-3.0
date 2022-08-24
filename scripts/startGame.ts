import { ethers } from "hardhat";
import { BlackJack3 } from "../typechain-types";

async function main() {
  const address = "0x07220eA2379DbBD99503842B1B0Adc73017595Dd";
  const BlackJack3 = (await ethers.getContractAt("BlackJack3", address)) as BlackJack3;

  const tx = await BlackJack3.startGame({ value: ethers.utils.parseEther("0.1"), gasLimit: 15037371 });
  const rc = await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
