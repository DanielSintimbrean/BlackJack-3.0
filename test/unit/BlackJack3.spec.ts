import { time, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect, assert } from "chai";
import exp from "constants";
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import { deployBlackJack3 } from "../../deploy/BlackJack3";
import { BlackJack3, VRFCoordinatorV2Mock } from "../../typechain-types";

describe("BlackJack3", function () {
  let BlackJack3: BlackJack3;
  let subscriptionId: BigNumber;
  let VRFCoordinatorV2Mock: VRFCoordinatorV2Mock | undefined;

  beforeEach(async function () {
    const deployed = await loadFixture(deployBlackJack3);
    BlackJack3 = deployed.BlackJack3;
    subscriptionId = deployed.subscriptionId;
    VRFCoordinatorV2Mock = deployed.VRFCoordinatorV2Mock;
  });

  describe("Deployment", function () {
    it("Shod set the right subscriptionId", async function () {
      const subId = await BlackJack3.s_subscriptionId();

      expect(subId).to.equal(subscriptionId);
    });
  });

  describe("Playing game", function () {
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
      }

      const [deployer] = await ethers.getSigners();

      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });
      const requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock?.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 3, 4, 5, 6, 7])
      ).to.emit(BlackJack3, "GameStarted");

      let playerCards = await BlackJack3.getPlayerCards(deployer.address);
      let dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => !n.eq(0));
      dealerCards = dealerCards.filter((n) => !n.eq(0));

      assert.lengthOf(playerCards, 2);
      assert.lengthOf(dealerCards, 1);

      expect(playerCards[0]).to.eq("1");
      expect(playerCards[1]).to.eq("2");
      expect(dealerCards[0]).to.eq("3");
    });

    it("Can not send 'startGame' twice ", async function () {
      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });

      await expect(BlackJack3.startGame({ value: ethers.utils.parseEther("1") })).to.be.revertedWithCustomError(
        BlackJack3,
        "RandomOperationSended"
      );
    });

    it("Can not start a game if already started", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });

      const requestNumber: BigNumber = await BlackJack3.s_requestId();

      // simulate callback from the oracle network
      await expect(VRFCoordinatorV2Mock.fulfillRandomWords(requestNumber, BlackJack3.address)).to.emit(
        BlackJack3,
        "GameStarted"
      );

      await expect(BlackJack3.startGame({ value: ethers.utils.parseEther("1") })).to.be.revertedWithCustomError(
        BlackJack3,
        "InAGame"
      );
    });

    it("Complete a game that the player lose", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const [deployer] = await ethers.getSigners();

      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });

      let requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 0, 0, 0, 0, 0])
      ).to.emit(BlackJack3, "GameStarted");

      await BlackJack3.stand();

      requestId = await BlackJack3.s_requestId();

      mine(10);

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 0, 0, 0, 0, 0])
      )
        .to.emit(BlackJack3, "PlayerLose")
        .withArgs(deployer.address, [], 13, [], 19);

      mine(10);

      let playerCards = await BlackJack3.getPlayerCards(deployer.address);
      let dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => !n.eq(0));
      dealerCards = dealerCards.filter((n) => !n.eq(0));

      assert.lengthOf(playerCards, 0);
      assert.lengthOf(dealerCards, 0);
    });

    it("Complete a game that player win", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const [deployer] = await ethers.getSigners();

      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });

      let requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 4, 10, 0, 0, 0, 0, 0])
      ).to.emit(BlackJack3, "GameStarted");

      await BlackJack3.hit();

      requestId = await BlackJack3.s_requestId();

      mine(10);

      await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        requestId,
        BlackJack3.address,
        [4, 0, 0, 0, 0, 0, 0, 0]
      );

      mine(10);

      let playerCards = await BlackJack3.getPlayerCards(deployer.address);
      let dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => !n.eq(0));
      dealerCards = dealerCards.filter((n) => !n.eq(0));

      assert.lengthOf(playerCards, 3);
      assert.lengthOf(dealerCards, 1);

      await BlackJack3.stand();

      requestId = await BlackJack3.s_requestId();

      mine(10);

      await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        requestId,
        BlackJack3.address,
        [6, 0, 0, 0, 0, 0, 0, 0]
      );

      mine(10);

      playerCards = await BlackJack3.getPlayerCards(deployer.address);
      dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => !n.eq(0));
      dealerCards = dealerCards.filter((n) => !n.eq(0));

      assert.lengthOf(playerCards, 0);
      assert.lengthOf(dealerCards, 0);
    });
  });
});

function cardsArray(array: number[]): BigNumber[] {
  const SIZE = 21;
  let length = array.length;
  let result = array.map((n) => BigNumber.from(n));
  let rest = SIZE - length;

  for (let i = 0; i < rest; i++) {
    result.push(BigNumber.from(0));
  }

  return result;
}
