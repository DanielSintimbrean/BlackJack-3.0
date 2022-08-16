// SPDX-License-Identifier:MIT

pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

//Errors
error InsufficientETH();
error NotInAGame();
error InAGame();
error NotInFirstRound();
error RandomOperationSended();

contract BlackJack3 is VRFConsumerBaseV2 {
    enum GameState {
        NotPlaying,
        InGame
    }

    enum RandomOperationAt {
        StartGame,
        Hit,
        Stand
    }

    enum RandomOperationStatus {
        NotSended,
        Waiting
    }

    struct Table {
        GameState gameState;
        RandomOperationStatus randomOperationStatus;
        RandomOperationAt randomOperationAt;
        uint256[] playerCards; // Baraja jugador
        uint256[] dealerCards; // Baraja dealer
        uint256 amountBet;
        address player;
    }

    event GameStarted();
    event PlayerStand();
    event FullfilCalled();

    modifier inGame() {
        Table memory table = tables[msg.sender];
        if (table.gameState == GameState.NotPlaying) {
            revert NotInAGame();
        }
        _;
    }

    modifier notInGame() {
        Table memory table = tables[msg.sender];
        if (table.gameState == GameState.InGame) {
            revert InAGame();
        }
        _;
    }

    modifier notRandomOperationEmitted() {
        Table memory table = tables[msg.sender];
        if (table.randomOperationStatus == RandomOperationStatus.Waiting) {
            revert RandomOperationSended();
        }
        _;
    }

    mapping(address => Table) public tables;

    mapping(uint256 => Table) public tablesRequest;

    uint32 private constant CALLBACK_GAS_LIMIT = 10000000;

    uint16 public constant REQUEST_CONFIRMATIONS = 3;

    // For this example, retrieve 2 random values in one request.
    // Cannot exceed VRFCoordinatorV2.MAX_NUM_WORDS.
    uint32 public constant NUM_WORDS = 8;

    uint256 public constant MIN_AMOUNT = 100000000000000000; // 0.1 ETH

    uint256 public requestId;

    uint256[13] private CARDS_VALUE = [
        11, /*   A */
        2, /*    2 */
        3, /**   3 */
        4, /**   4 */
        5, /**   5 */
        6, /**   6 */
        7, /**   7 */
        8, /**   8 */
        9, /**   9 */
        10, /** 10 */
        10, /**  J */
        10, /**  Q */
        10 /**   K */
    ];

    VRFCoordinatorV2Interface private immutable COORDINATOR;
    // Your subscription ID.
    uint64 public immutable s_subscriptionId;

    // The gas lane to use, which specifies the maximum gas price to bump to.
    // For a list of available gas lanes on each network,
    // see https://docs.chain.link/docs/vrf-contracts/#configurations
    bytes32 private immutable s_keyHash;

    constructor(
        uint64 subscriptionId,
        address vrfCoordinator,
        bytes32 keyHash
    ) VRFConsumerBaseV2(vrfCoordinator) {
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
        s_keyHash = keyHash;
        s_subscriptionId = subscriptionId;
    }

    function startGame() public payable notInGame notRandomOperationEmitted {
        if (msg.value <= MIN_AMOUNT) {
            revert InsufficientETH();
        }

        Table storage table = tables[msg.sender];
        table.amountBet = msg.value;
        table.player = msg.sender;
        tables[msg.sender] = table;

        performRandomOperation(RandomOperationAt.StartGame, table);
    }

    // Take another card
    function hit() public inGame {
        Table storage table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Hit, table);
    }

    function stand() public inGame {
        Table storage table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Stand, table);
    }

    function surrender() public inGame {
        Table memory table = tables[msg.sender];

        if (table.dealerCards.length != 1 || table.playerCards.length != 2) {
            revert NotInFirstRound();
        }

        uint256 amountToReturn = table.amountBet / 2;
        delete tables[msg.sender];

        (bool success, ) = msg.sender.call{ value: amountToReturn }("");
        require(success);
    }

    function performRandomOperation(RandomOperationAt _randomOperationAt, Table storage table) private {
        requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );

        table.randomOperationStatus = RandomOperationStatus.Waiting;
        table.randomOperationAt = _randomOperationAt;

        tablesRequest[requestId] = table;
        tables[table.player] = table;
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory randomWords) internal virtual override {
        Table storage table = tablesRequest[_requestId];

        ///////////////
        // StartGame //
        ///////////////
        if (table.randomOperationAt == RandomOperationAt.StartGame) {
            table.amountBet = msg.value;
            table.dealerCards.push(randomWords[1] % 13);
            table.playerCards.push(randomWords[2] % 13);
            table.playerCards.push(randomWords[3] % 13);
            table.gameState = GameState.InGame;
            table.randomOperationStatus = RandomOperationStatus.NotSended;
            tables[table.player] = table;
            emit GameStarted();
        }

        /////////////////
        //    stand    //
        ////////////////
        if (table.randomOperationAt == RandomOperationAt.Stand) {
            uint256 i = 0;

            do {
                table.dealerCards.push(randomWords[i] % 13);
            } while (getTotalValueOfCards(table.dealerCards) <= 16);

            uint256 dealerValue = getTotalValueOfCards(table.dealerCards);
            uint256 playerValue = getTotalValueOfCards(table.dealerCards);

            uint256 amountBet = table.amountBet;

            tables[table.player] = Table({
                gameState: GameState.NotPlaying,
                randomOperationStatus: RandomOperationStatus.NotSended,
                randomOperationAt: RandomOperationAt.StartGame,
                playerCards: new uint256[](0),
                dealerCards: new uint256[](0),
                player: 0x000000000000000000000000000000000000dEaD,
                amountBet: 0
            });

            emit PlayerStand();

            if (dealerValue > 21 || playerValue > dealerValue) {
                (bool success, ) = msg.sender.call{ value: amountBet * 2 }("");
                require(success);
                return;
            }

            if (dealerValue == playerValue) {
                (bool success, ) = msg.sender.call{ value: amountBet }("");
                require(success);
                return;
            }
        }

        ///////////////
        //    Hit    //
        ///////////////

        if (table.randomOperationAt == RandomOperationAt.Hit) {
            table.playerCards.push(randomWords[0] & 13);
            uint256 result = getTotalValueOfCards(table.playerCards);

            if (result > 21) {
                delete tables[table.player];
                return;
            }
        }

        tablesRequest[_requestId] = Table({
            gameState: GameState.NotPlaying,
            randomOperationStatus: RandomOperationStatus.NotSended,
            randomOperationAt: RandomOperationAt.StartGame,
            playerCards: new uint256[](0),
            dealerCards: new uint256[](0),
            player: address(0),
            amountBet: 0
        });

        emit FullfilCalled();
    }

    function getTotalValueOfCards(uint256[] memory cards) private pure returns (uint256) {
        uint256 result = 0;
        uint256 numberOfAs = 0;

        for (uint256 i = 0; i < cards.length; i++) {
            result += cards[i];
            if (cards[i] == 11) {
                numberOfAs++;
            }
        }

        for (uint256 j = 0; j < numberOfAs && result > 21; j++) {
            result -= 10;
        }

        return result;
    }

    function getPlayerCards(address _player) public view returns (uint256[] memory) {
        Table memory table = tables[_player];
        return table.playerCards;
    }

    function getDealerCards(address _player) public view returns (uint256[] memory) {
        Table memory table = tables[_player];
        return table.dealerCards;
    }
}
