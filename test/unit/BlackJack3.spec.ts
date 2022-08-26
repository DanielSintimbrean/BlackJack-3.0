import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { BigNumber, BigNumberish, ContractTransaction } from "ethers";
import { Interface } from "ethers/lib/utils";
import { ethers, network, tracer } from "hardhat";
import { deployBlackJack3 } from "../../deploy/BlackJack3";
import { BlackJack3, chainlink, VRFCoordinatorV2Mock } from "../../typechain-types";

describe("BlackJack3", function () {
  let BlackJack3: BlackJack3;
  let subscriptionId: BigNumber;
  let VRFCoordinatorV2Mock: VRFCoordinatorV2Mock | undefined;
  let deployer: SignerWithAddress;
  let chainLink: SignerWithAddress;

  beforeEach(async function () {
    const deployed = await loadFixture(deployBlackJack3);
    BlackJack3 = deployed.BlackJack3;
    subscriptionId = deployed.subscriptionId;
    VRFCoordinatorV2Mock = deployed.VRFCoordinatorV2Mock;
    [deployer, chainLink] = await ethers.getSigners();
  });

  describe("Validations", function () {
    it("Should request a random word to VRFMock", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
      }

      await expect(BlackJack3.startGame({ value: ethers.utils.parseEther("1") })).to.emit(
        VRFCoordinatorV2Mock,
        "RandomWordsRequested"
      );
    });

    it("Should successfully start the game, player will have 2 cards and dealer 1", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [0, 1, 2]);

      let playerCards = await BlackJack3.getPlayerCards(deployer.address);
      let dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => n.toString() != "0");
      dealerCards = dealerCards.filter((n) => n.toString() != "0");

      assert.lengthOf(playerCards, 2);
      assert.lengthOf(dealerCards, 1);

      expect(playerCards[0].toString()).to.eq("1");
      expect(playerCards[1].toString()).to.eq("2");
      expect(dealerCards[0].toString()).to.eq("3");
    });

    it("Can not send 'startGame' twice ", async function () {
      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });

      await expect(BlackJack3.startGame({ value: ethers.utils.parseEther("1") })).to.be.revertedWithCustomError(
        BlackJack3,
        "BlackJack3__RandomOperationSended"
      );
    });

    it("Can not start a game if already started", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock);

      await expect(BlackJack3.startGame({ value: ethers.utils.parseEther("1") })).to.be.revertedWithCustomError(
        BlackJack3,
        "BlackJack3__InAGame"
      );
    });
    it("Start a game and then surrender", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock);

      await BlackJack3.surrender();

      checkIfTableIsReset(BlackJack3, deployer);
    });
    it("Start a game, hit, and then surrender", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [1, 1, 1]);

      await BlackJack3__hit(BlackJack3, VRFCoordinatorV2Mock, 10);

      await expect(BlackJack3.surrender()).to.be.revertedWithCustomError(BlackJack3, "BlackJack3__NotInFirstRound");
    });

    it("Can not hit if player is not in a game", async function () {
      await expect(BlackJack3.hit()).to.be.revertedWithCustomError(BlackJack3, "BlackJack3__NotInAGame");
    });

    it("Can not surrender if player is not in a game", async function () {
      await expect(BlackJack3.surrender()).to.be.revertedWithCustomError(BlackJack3, "BlackJack3__NotInAGame");
    });

    it("Can not start game with no payment", async function () {
      await expect(BlackJack3.startGame()).to.be.revertedWithCustomError(BlackJack3, "BlackJack3__InsufficientETH");
    });
    it("Can not start game with less than min amount", async function () {
      const minAmount = await BlackJack3.MIN_AMOUNT();
      await expect(BlackJack3.startGame({ value: minAmount.div(2) })).to.be.revertedWithCustomError(
        BlackJack3,
        "BlackJack3__InsufficientETH"
      );
    });
    it("Can not stand if player is not in a game", async function () {
      await expect(BlackJack3.hit()).to.be.revertedWithCustomError(BlackJack3, "BlackJack3__NotInAGame");
    });
  });

  describe("Playing game", function () {
    it("Complete a game that the player lose", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [0, 1, 2]);

      const { gasCost: standEthUsed, vrfReceipt } = await BlackJack3__stand(
        BlackJack3,
        VRFCoordinatorV2Mock,
        [0, 1, 2]
      );

      const { data, topics } = vrfReceipt.events![2];
      const IPlayerLose = new Interface([
        "event PlayerLose(address indexed player, uint16[21] playerCards, uint16 playerCardsValue, uint16[21] dealerCards, uint16 dealerCardsValue)",
      ]);

      const log = IPlayerLose.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Check Event Arguments
      /// Address
      expect(player).to.equal(deployer.address);

      /// PlayerCards
      expectedCards([1, 2], pCards);

      /// PlayerCardsValue
      expect(playerCardsValue).to.equal(13);

      /// DealerCards
      expectedCards([3, 1, 2, 3], dCards);

      /// DealerCardsValue
      expect(dealerCardsValue).to.equal(19);
      mine(10);

      // Check reset of the table
      await checkIfTableIsReset(BlackJack3, deployer);

      const endingPlayerBalance = await deployer.getBalance();
      const endingContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      const ethGasUsed = standEthUsed.add(startGameEthUsed);
      const differencePlayer = endingPlayerBalance.sub(initialPlayerBalance);
      const differenceContract = endingContractBalance.sub(initialContractBalance);

      // Contract win 1 ETH
      expect(differenceContract).to.equal(ethers.utils.parseEther("1"));
      // Player lose 1 ETH
      expect(differencePlayer).to.equal(ethers.utils.parseEther("-1").sub(ethGasUsed));
    });

    it("Complete a game that player win", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [0, 4, 10]);

      const { gasCost: hitEthUsed } = await BlackJack3__hit(BlackJack3, VRFCoordinatorV2Mock, 4);

      /// Mark

      const { gasCost: standEthUsed, vrfReceipt } = await BlackJack3__stand(BlackJack3, VRFCoordinatorV2Mock, [6]);

      const { data, topics } = vrfReceipt.events![2];
      const IPlayerGood = new Interface([
        "event PlayerWin(address indexed player, uint16[21] playerCards, uint16 playerCardsValue, uint16[21] dealerCards, uint16 dealerCardsValue)",
      ]);

      const log = IPlayerGood.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Address
      expect(player).to.equal(deployer.address);

      // PlayerCards
      expectedCards([1, 5, 5], pCards);

      // PlayerCardsValue
      expect(playerCardsValue).to.equal(21);

      // DealerCards
      expectedCards([11, 7], dCards);

      // DealerCardsValue
      expect(dealerCardsValue).to.equal(17);

      mine(10);

      const endingPlayerBalance = await deployer.getBalance();
      const endingContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      const ethGasUsed = standEthUsed.add(hitEthUsed).add(startGameEthUsed);
      const differencePlayer = endingPlayerBalance.sub(initialPlayerBalance);
      const differenceContract = endingContractBalance.sub(initialContractBalance);

      // Contract lose 1 ETH
      expect(differenceContract).to.equal(ethers.utils.parseEther("-1"));
      // Player win 1 ETH
      expect(differencePlayer).to.equal(ethers.utils.parseEther("1").sub(ethGasUsed));

      checkIfTableIsReset(BlackJack3, deployer);
    });
    it("Complete a game that ends in a draw ", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [0, 0, 0]);

      const { gasCost: hitEthUsed } = await BlackJack3__hit(BlackJack3, VRFCoordinatorV2Mock, 4);

      /// Mark

      const { gasCost: standEthUsed, vrfReceipt } = await BlackJack3__stand(BlackJack3, VRFCoordinatorV2Mock, [0, 4]);

      const { data, topics } = vrfReceipt.events![2];
      const IPlayerGood = new Interface([
        "event PlayerDraft(address indexed player, uint16[21] playerCards, uint16 playerCardsValue, uint16[21] dealerCards, uint16 dealerCardsValue)",
      ]);

      const log = IPlayerGood.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Address
      expect(player).to.equal(deployer.address);

      // PlayerCards
      expectedCards([1, 1, 5], pCards);

      // PlayerCardsValue
      expect(playerCardsValue).to.equal(17);

      // DealerCards
      expectedCards([1, 1, 5], dCards);

      // DealerCardsValue
      expect(dealerCardsValue).to.equal(17);

      mine(10);

      const endingPlayerBalance = await deployer.getBalance();
      const endingContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      const ethGasUsed = standEthUsed.add(hitEthUsed).add(startGameEthUsed);
      const differencePlayer = endingPlayerBalance.sub(initialPlayerBalance);
      const differenceContract = endingContractBalance.sub(initialContractBalance);

      // Contract has de same amount
      expect(differenceContract).to.equal(ethers.utils.parseEther("0"));
      // Player lose only the gas used for transactions
      expect(differencePlayer).to.equal(ethers.utils.parseEther("0").sub(ethGasUsed));

      checkIfTableIsReset(BlackJack3, deployer);
    });
    it("Complete a game that player lose when hit ", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3, VRFCoordinatorV2Mock, [10, 10, 0]);

      const { gasCost: hitEthUsed, vrfReceipt } = await BlackJack3__hit(BlackJack3, VRFCoordinatorV2Mock, 4);

      /// Mark
      const { data, topics } = vrfReceipt.events![2];
      const IPlayerGood = new Interface([
        "event PlayerLose(address indexed player, uint16[21] playerCards, uint16 playerCardsValue, uint16[21] dealerCards, uint16 dealerCardsValue)",
      ]);

      const log = IPlayerGood.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Address
      expect(player).to.equal(deployer.address);

      // PlayerCards
      expectedCards([11, 11, 5], pCards);

      // PlayerCardsValue
      expect(playerCardsValue).to.equal(25);

      // DealerCards
      expectedCards([1], dCards);

      // DealerCardsValue
      expect(dealerCardsValue).to.equal(11);

      const endingPlayerBalance = await deployer.getBalance();
      const endingContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      const ethGasUsed = hitEthUsed.add(startGameEthUsed);
      const differencePlayer = endingPlayerBalance.sub(initialPlayerBalance);
      const differenceContract = endingContractBalance.sub(initialContractBalance);

      // Contract win 1 Eth
      expect(differenceContract).to.equal(ethers.utils.parseEther("1"));
      // Player lose 1 Eth
      expect(differencePlayer).to.equal(ethers.utils.parseEther("-1").sub(ethGasUsed));

      checkIfTableIsReset(BlackJack3, deployer);
    });
  });
});

//////////////////////
// Helper Functions //
/////////////////////

function expectedCards(expectedCards: number[], cards: BigNumber[]) {
  const expectCardsConverted = cardsArray(expectedCards).map((x) => x.toString());
  expect(expectCardsConverted).to.have.same.members(cards.map((n: BigNumber) => n.toString()));
}

async function checkIfTableIsReset(BlackJack3: BlackJack3, deployer: SignerWithAddress) {
  let { playerCards, dealerCards, table } = await BlackJack3.getTable(deployer.address);

  expect(table.player.toString()).equal("0x0000000000000000000000000000000000000000");
  expect(table.dealerCardsNum.toString()).equal("0");
  expect(table.playerCardsNum.toString()).equal("0");
  expect(table.amountBet.toString()).equal("0");
  expect(table.randomOperationAt.toString()).equal("0");
  expect(table.randomOperationStatus.toString()).equal("0");
  expect(table.gameState.toString()).equal("0");

  playerCards = playerCards.filter((n) => n.toString() != "0");
  dealerCards = dealerCards.filter((n) => n.toString() != "0");

  assert.lengthOf(playerCards, 0);
  assert.lengthOf(dealerCards, 0);
}

function cardsArray(array: number[], SIZE: number = 21): BigNumber[] {
  let length = array.length;
  let result = array.map((n) => BigNumber.from(n));
  let rest = SIZE - length;

  for (let i = 0; i < rest; i++) {
    result.push(BigNumber.from(0));
  }

  return result;
}

async function BlackJack3__startGame(
  BlackJack3: BlackJack3,
  VRFCoordinatorV2Mock: VRFCoordinatorV2Mock,
  cardsToReturn: number[] = [0],
  value: BigNumber = ethers.utils.parseEther("1")
) {
  const startGameTx = await BlackJack3.startGame({ value });
  const startGameRc = await startGameTx.wait();

  const [deployer] = await ethers.getSigners();

  const { requestId, randomOperationAt } = startGameRc.events!.find((e) => e.event == "RandomOperationRequest")!.args!;

  const { gasUsed, effectiveGasPrice } = startGameRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  expect(randomOperationAt).to.equal(RandomOperationAt.startGame);

  let tx: ContractTransaction;
  await expect(
    (tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
      requestId,
      BlackJack3.address,
      cardsArray(cardsToReturn, 8)
    ))
  ).to.emit(BlackJack3, "GameStarted");

  let vrfReceipt = await tx.wait();

  let { playerCards, dealerCards, table } = await BlackJack3.getTable(deployer.address);

  playerCards = playerCards.filter((n) => n.toString() != "0");
  dealerCards = dealerCards.filter((n) => n.toString() != "0");

  assert.lengthOf(playerCards, 2);
  assert.lengthOf(dealerCards, 1);
  assert.equal(table.dealerCardsNum.toString(), "1");
  assert.equal(table.playerCardsNum.toString(), "2");

  return { requestId, gasCost, vrfReceipt };
}

async function BlackJack3__hit(BlackJack3: BlackJack3, VRFCoordinatorV2Mock: VRFCoordinatorV2Mock, newCard: number) {
  const hitTx = await BlackJack3.hit();
  const hitRc = await hitTx.wait();

  const { requestId, randomOperationAt } = hitRc.events!.find((e) => e.event == "RandomOperationRequest")!.args!;

  const { gasUsed, effectiveGasPrice } = hitRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  expect(randomOperationAt).to.equal(RandomOperationAt.hit);
  let tx: ContractTransaction;
  expect(
    (tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
      requestId,
      BlackJack3.address,
      cardsArray([newCard], 8)
    ))
  ).to.emit(BlackJack3, "PlayerHit");

  const vrfReceipt = await tx.wait();

  const [deployer] = await ethers.getSigners();
  let { playerCards, dealerCards, table } = await BlackJack3.getTable(deployer.address);

  playerCards = playerCards.filter((n) => n.toString() != "0");
  dealerCards = dealerCards.filter((n) => n.toString() != "0");

  assert.lengthOf(playerCards, table.playerCardsNum);
  assert.lengthOf(dealerCards, table.dealerCardsNum);

  return { requestId, gasCost, vrfReceipt };
}

async function BlackJack3__stand(
  BlackJack3: BlackJack3,
  VRFCoordinatorV2Mock: VRFCoordinatorV2Mock,
  newCards: number[]
) {
  const standTx = await BlackJack3.stand();
  const standRc = await standTx.wait();

  const { requestId, randomOperationAt } = standRc.events?.find((e) => e.event == "RandomOperationRequest")!.args!;

  const { gasUsed, effectiveGasPrice } = standRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  expect(randomOperationAt).to.equal(RandomOperationAt.stand);

  let tx: ContractTransaction;
  expect(
    (tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
      requestId,
      BlackJack3.address,
      cardsArray(newCards, 8)
    ))
  ).to.emit(BlackJack3, "PlayerStand");

  let vrfReceipt = await tx.wait();

  return { requestId, gasCost, vrfReceipt };
}

const RandomOperationAt = {
  startGame: 0,
  hit: 1,
  stand: 2,
};
