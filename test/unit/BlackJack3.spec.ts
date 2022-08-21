import { time, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect, assert } from "chai";
import exp from "constants";
import { BigNumber } from "ethers";
import { Interface } from "ethers/lib/utils";
import { ethers, network, tracer } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
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

      const [deployer] = await ethers.getSigners();

      await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });
      const requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 3, 4, 5, 6, 7])
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
        "BlackJack3__RandomOperationSended"
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
        "BlackJack3__InAGame"
      );
    });
  });

  describe("Playing game", function () {
    it("Complete a game that the player lose", async function () {
      if (!VRFCoordinatorV2Mock) {
        this.runnable().title += " -- Skipped with reason: Not in a Develop Chain";
        this.skip();
        return;
      }

      const [deployer, chainLink] = await ethers.getSigners();

      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const startGameTx = await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });
      const startGameRc = await startGameTx.wait();
      const { gasUsed: gasUsed_startGame, effectiveGasPrice: gasPrice_startGame } = startGameRc;
      const startGameEthUsed = gasPrice_startGame.mul(gasUsed_startGame);

      let requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 0, 0, 0, 0, 0])
      ).to.emit(BlackJack3, "GameStarted");

      const standTx = await BlackJack3.stand();
      const standRc = await standTx.wait();
      const { gasUsed: gasUsed_stand, effectiveGasPrice: gasPrice_stand } = standRc;
      const standEthUsed = gasPrice_stand.mul(gasUsed_stand);

      requestId = await BlackJack3.s_requestId();

      mine(10);

      const tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        requestId,
        BlackJack3.address,
        [0, 1, 2, 0, 0, 0, 0, 0]
      );

      const rc = await tx.wait();
      const { data, topics } = rc.events![1];
      const ifaceGood = new Interface([
        "event PlayerLose(address indexed player, uint256[21] playerCards, uint256 playerCardsValue, uint256[21] dealerCards, uint256 dealerCardsValue)",
      ]);

      const log = ifaceGood.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Check Event Arguments
      //// Address
      expect(player).to.equal(deployer.address);

      //// PlayerCards
      const expectPlayerCards = cardsArray([1, 2]).map((x) => x.toString());
      expect(expectPlayerCards).to.have.same.members(pCards.map((n: BigNumber) => n.toString()));

      //// PlayerCardsValue
      expect(playerCardsValue).to.equal(13);

      //// DealerCards
      const expectDealerCards = cardsArray([3, 1, 2, 3]).map((x) => x.toString());
      expect(expectDealerCards).to.have.same.members(dCards.map((n: BigNumber) => n.toString()));

      //// DealerCardsValue
      expect(dealerCardsValue).to.equal(19);
      mine(10);

      // Check reset of the table
      let playerCards = await BlackJack3.getPlayerCards(deployer.address);
      let dealerCards = await BlackJack3.getDealerCards(deployer.address);

      playerCards = playerCards.filter((n) => !n.eq(0));
      dealerCards = dealerCards.filter((n) => !n.eq(0));

      assert.lengthOf(playerCards, 0);
      assert.lengthOf(dealerCards, 0);

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

      const [deployer, chainLink] = await ethers.getSigners();
      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const startGameTx = await BlackJack3.startGame({ value: ethers.utils.parseEther("1") });
      const startGameRc = await startGameTx.wait();
      const { gasUsed: gasUsed_startGame, effectiveGasPrice: gasPrice_startGame } = startGameRc;
      const startGameEthUsed = gasPrice_startGame.mul(gasUsed_startGame);

      let requestId = await BlackJack3.s_requestId();

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 4, 10, 0, 0, 0, 0, 0])
      ).to.emit(BlackJack3, "GameStarted");

      const hitTX = await BlackJack3.hit();
      const hitRc = await hitTX.wait();
      const { gasUsed: gasUsed_hit, effectiveGasPrice: gasPrice_hit } = hitRc;
      const hitEthUsed = gasPrice_hit.mul(gasUsed_hit);

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

      const standTx = await BlackJack3.stand();
      const standRc = await standTx.wait();
      const { gasUsed: gasUsed_stand, effectiveGasPrice: gasPrice_stand } = standRc;
      const standEthUsed = gasPrice_stand.mul(gasUsed_stand);

      requestId = await BlackJack3.s_requestId();

      mine(10);

      const tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        requestId,
        BlackJack3.address,
        [6, 0, 0, 0, 0, 0, 0, 0]
      );

      const rc = await tx.wait();
      const { data, topics } = rc.events![1];
      const ifaceGood = new Interface([
        "event PlayerWin(address indexed player, uint256[21] playerCards, uint256 playerCardsValue, uint256[21] dealerCards, uint256 dealerCardsValue)",
      ]);

      const log = ifaceGood.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Address
      expect(player).to.equal(deployer.address);

      // PlayerCards
      const expectPlayerCards = cardsArray([1, 5, 5]).map((x) => x.toString());
      expect(expectPlayerCards).to.have.same.members(pCards.map((n: BigNumber) => n.toString()));

      // PlayerCardsValue
      expect(playerCardsValue).to.equal(21);

      // DealerCards
      const expectDealerCards = cardsArray([11, 7]).map((x) => x.toString());
      expect(expectDealerCards).to.have.same.members(dCards.map((n: BigNumber) => n.toString()));

      // DealerCardsValue
      expect(dealerCardsValue).to.equal(17);

      mine(10);

      const endingPlayerBalance = await deployer.getBalance();
      const endingContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      const ethGasUsed = standEthUsed.add(hitEthUsed).add(startGameEthUsed);
      const differencePlayer = endingPlayerBalance.sub(initialPlayerBalance);
      const differenceContract = endingContractBalance.sub(initialContractBalance);

      expect(differenceContract).to.equal(ethers.utils.parseEther("-1"));
      expect(differencePlayer).to.equal(ethers.utils.parseEther("1").sub(ethGasUsed));

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
