import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { BigNumber } from "ethers";
import { Interface } from "ethers/lib/utils";
import { ethers, network, tracer } from "hardhat";
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

      const [deployer, chainLink] = await ethers.getSigners();

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { requestId } = await BlackJack3__startGame(BlackJack3);

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(requestId, BlackJack3.address, [0, 1, 2, 3, 4, 5, 6, 7])
      )
        .to.emit(BlackJack3, "GameStarted")
        .withArgs(deployer.address);

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

      const { requestId } = await BlackJack3__startGame(BlackJack3);

      // simulate callback from the oracle network
      await expect(VRFCoordinatorV2Mock.fulfillRandomWords(requestId, BlackJack3.address)).to.emit(
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

      const { requestId: startGameRequestId, gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3);

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
          startGameRequestId,
          BlackJack3.address,
          [0, 1, 2, 0, 0, 0, 0, 0]
        )
      ).to.emit(BlackJack3, "GameStarted");

      const { requestId: standRequestId, gasCost: standEthUsed } = await BlackJack3__stand(BlackJack3);

      mine(10);

      const tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        standRequestId,
        BlackJack3.address,
        [0, 1, 2, 0, 0, 0, 0, 0]
      );

      const rc = await tx.wait();
      const { data, topics } = rc.events![2];
      const IPlayerLose = new Interface([
        "event PlayerLose(address indexed player, uint256[21] playerCards, uint256 playerCardsValue, uint256[21] dealerCards, uint256 dealerCardsValue)",
      ]);

      const log = IPlayerLose.parseLog({ data, topics });
      const { player, playerCards: pCards, playerCardsValue, dealerCards: dCards, dealerCardsValue } = log.args;

      // Check Event Arguments
      //// Address
      expect(player).to.equal(deployer.address);

      //// PlayerCards
      expectedCards([1, 2], pCards);

      //// PlayerCardsValue
      expect(playerCardsValue).to.equal(13);

      //// DealerCards
      expectedCards([3, 1, 2, 3], dCards);

      //// DealerCardsValue
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

      const [deployer, chainLink] = await ethers.getSigners();
      const initialPlayerBalance = await deployer.getBalance();
      const initialContractBalance = await BlackJack3.provider.getBalance(BlackJack3.address);

      VRFCoordinatorV2Mock = VRFCoordinatorV2Mock.connect(chainLink);

      const { requestId: startGameRequestId, gasCost: startGameEthUsed } = await BlackJack3__startGame(BlackJack3);

      await expect(
        VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
          startGameRequestId,
          BlackJack3.address,
          [0, 4, 10, 0, 0, 0, 0, 0]
        )
      ).to.emit(BlackJack3, "GameStarted");

      const { requestId: hitRequestId, gasCost: hitEthUsed } = await BlackJack3__hit(BlackJack3);

      mine(10);

      await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        hitRequestId,
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

      mine(10);

      const { requestId: standRequestId, gasCost: standEthUsed } = await BlackJack3__stand(BlackJack3);

      const tx = await VRFCoordinatorV2Mock.fulfillRandomWordsWithOverride(
        standRequestId,
        BlackJack3.address,
        [6, 0, 0, 0, 0, 0, 0, 0]
      );

      const rc = await tx.wait();
      const { data, topics } = rc.events![2];
      const IPlayerGood = new Interface([
        "event PlayerWin(address indexed player, uint256[21] playerCards, uint256 playerCardsValue, uint256[21] dealerCards, uint256 dealerCardsValue)",
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
  let playerCards = await BlackJack3.getPlayerCards(deployer.address);
  let dealerCards = await BlackJack3.getDealerCards(deployer.address);

  playerCards = playerCards.filter((n) => !n.eq(0));
  dealerCards = dealerCards.filter((n) => !n.eq(0));

  assert.lengthOf(playerCards, 0);
  assert.lengthOf(dealerCards, 0);
}

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

async function BlackJack3__startGame(BlackJack3: BlackJack3, value: BigNumber = ethers.utils.parseEther("1")) {
  const startGameTx = await BlackJack3.startGame({ value });
  const startGameRc = await startGameTx.wait();

  const { requestId } = startGameRc.events![1].args!;

  const { gasUsed, effectiveGasPrice } = startGameRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  return { requestId, gasCost };
}

async function BlackJack3__hit(BlackJack3: BlackJack3) {
  const hitTx = await BlackJack3.hit();
  const hitRc = await hitTx.wait();

  const { requestId } = hitRc.events![1].args!;

  const { gasUsed, effectiveGasPrice } = hitRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  return { requestId, gasCost };
}

async function BlackJack3__stand(BlackJack3: BlackJack3) {
  const standTx = await BlackJack3.stand();
  const standRc = await standTx.wait();

  const { requestId } = standRc.events![1].args!;

  const { gasUsed, effectiveGasPrice } = standRc;
  const gasCost = gasUsed.mul(effectiveGasPrice);

  return { requestId, gasCost };
}
