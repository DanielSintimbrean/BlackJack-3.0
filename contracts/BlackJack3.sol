// SPDX-License-Identifier:MIT

pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "hardhat/console.sol";
import "./BlackJackTable.sol";
import "./BlackJackErr.sol";

//
//                                                                                 #
//                                                                                ##=
//                                                                               ##===
//                                                                             ###==#===
//                                                                           ####===##====
//                                                                         #####====###=====
//                                                                        #####=====####=====
//                                                                        #####=====####=====
//                                                                          ####=  #  #====
//                                                                                ##=
//                                                                              ####===
//
//      ...     ..            ..                             ..            .                                       ..
//   .=*8888x <"?88h.   x .d88"                        < .z@8"`        .x88888x.                             < .z@8"`           .x~~"*Weu.              .n~~%x.
//  X>  '8888H> '8888    5888R                          !@88E         :8**888888X.  :>                        !@88E            d8Nu.  9888c           x88X   888.
// '88h. `8888   8888    '888R         u           .    '888E   u     f    `888888x./        u           .    '888E   u        88888  98888          X888X   8888L
// '8888 '8888    "88>    888R      us888u.   .udR88N    888E u@8NL  '       `*88888~     us888u.   .udR88N    888E u@8NL      "***"  9888%         X8888X   88888
//  `888 '8888.xH888x.    888R   .@88 "8888" <888'888k   888E`"88*"   \.    .  `?)X.   .@88 "8888" <888'888k   888E`"88*"           ..@8*"          88888X   88888X
//    X" :88*~  `*8888>   888R   9888  9888  9888 'Y"    888E .dN.     `~=-^   X88> ~  9888  9888  9888 'Y"    888E .dN.         ````"8Weu          88888X   88888X
//  ~"   !"`      "888>   888R   9888  9888  9888        888E~8888            X8888  ~ 9888  9888  9888        888E~8888        ..    ?8888L        88888X   88888f
//   .H8888h.      ?88    888R   9888  9888  9888        888E '888&           488888   9888  9888  9888        888E '888&     :@88N   '8888N    .   48888X   88888
//  :"^"88888h.    '!    .888B . 9888  9888  ?8888u../   888E  9888.  .xx.     88888X  9888  9888  ?8888u../   888E  9888.    *8888~  '8888F  .@8c   ?888X   8888"
//  ^    "88888hx.+"     ^*888%  "888*""888"  "8888P'  '"888*" 4888" '*8888.   '88888> "888*""888"  "8888P'  '"888*" 4888"    '*8"`   9888%  '%888"   "88X   88*`
//         ^"**""          "%     ^Y"   ^Y'     "P'       ""    ""     88888    '8888>  ^Y"   ^Y'     "P'       ""    ""        `~===*%"`      ^*       ^"==="`
//                                                                     `8888>    `888
//                                                                      "8888     8%
//                                                                       `"888x:-"

contract BlackJack3 is VRFConsumerBaseV2 {
    //////////////////
    //    Events    //
    //////////////////

    event GameStarted(address indexed player);
    event PlayerStand(address indexed player);
    event PlayerHit(address indexed player, uint256 newCard);
    event PlayerLose(
        address indexed player,
        uint256[21] playerCards,
        uint256 playerCardsValue,
        uint256[21] dealerCards,
        uint256 dealerCardsValue
    );
    event PlayerDraft(
        address indexed player,
        uint256[21] playerCards,
        uint256 playerCardsValue,
        uint256[21] dealerCards,
        uint256 dealerCardsValue
    );
    event PlayerWin(
        address indexed player,
        uint256[21] playerCards,
        uint256 playerCardsValue,
        uint256[21] dealerCards,
        uint256 dealerCardsValue
    );

    event FulFillCalled(uint256 requestId);

    /////////////////////
    //    Modifiers    //
    ////////////////////

    modifier inGame() {
        BlackJackTable memory table = tables[msg.sender];
        if (table.gameState == GameState.NotPlaying) {
            revert BlackJack3__NotInAGame();
        }
        _;
    }

    modifier notInGame() {
        BlackJackTable memory table = tables[msg.sender];
        if (table.gameState == GameState.InGame) {
            revert BlackJack3__InAGame();
        }
        _;
    }

    modifier notRandomOperationEmitted() {
        BlackJackTable memory table = tables[msg.sender];
        if (table.randomOperationStatus == RandomOperationStatus.Waiting) {
            revert BlackJack3__RandomOperationSended();
        }
        _;
    }

    /////////////////////
    //    Constants    //
    ////////////////////

    uint32 private constant CALLBACK_GAS_LIMIT = 10000000;

    uint16 public constant REQUEST_CONFIRMATIONS = 3;

    uint32 public constant NUM_WORDS = 8;

    uint256 public constant MIN_AMOUNT = 100000000000000000; // 0.1 ETH

    uint256[14] private CARDS_VALUE = [
        0, /*  Null*/
        11, /*  As */
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
    uint256[21] private EMPTY_ARRAY_21 = [
        0, /**  1 */
        0, /**  2 */
        0, /**  3 */
        0, /**  4 */
        0, /**  5 */
        0, /**  6 */
        0, /**  7 */
        0, /**  8 */
        0, /**  9 */
        0, /** 10 */
        0, /** 11 */
        0, /** 12 */
        0, /** 13 */
        0, /** 14 */
        0, /** 15 */
        0, /** 16 */
        0, /** 17 */
        0, /** 18 */
        0, /** 19 */
        0, /** 20 */
        0 /**  21 */
    ];

    //////////////////////
    //    Inmutables    //
    //////////////////////

    VRFCoordinatorV2Interface private immutable COORDINATOR;
    uint64 private immutable s_subscriptionId;

    // The gas lane to use, which specifies the maximum gas price to bump to.
    // For a list of available gas lanes on each network,
    // see https://docs.chain.link/docs/vrf-contracts/#configurations
    bytes32 private immutable s_keyHash;

    /////////////////////////////
    //    Public Variables     //
    ////////////////////////////

    uint256 public s_requestId;

    mapping(address => BlackJackTable) public tables;

    mapping(uint256 => BlackJackTable) public tablesRequest;

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
            revert BlackJack3__InsufficientETH();
        }

        BlackJackTable memory table = tables[msg.sender];
        table.amountBet = msg.value;
        table.player = msg.sender;
        table.randomOperationStatus = RandomOperationStatus.Waiting;
        tables[msg.sender] = table;

        performRandomOperation(RandomOperationAt.StartGame, table);
    }

    /////////////
    function hit() public inGame {
        BlackJackTable memory table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Hit, table);
    }

    function stand() public inGame {
        BlackJackTable memory table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Stand, table);
    }

    function surrender() public inGame {
        BlackJackTable memory table = tables[msg.sender];

        if (table.dealerCards.length != 1 || table.playerCards.length != 2) {
            revert BlackJack3__NotInFirstRound();
        }

        uint256 amountToReturn = table.amountBet / 2;
        delete tables[msg.sender];

        (bool success, ) = msg.sender.call{ value: amountToReturn }("");
        require(success);
    }

    function performRandomOperation(RandomOperationAt _randomOperationAt, BlackJackTable memory table) private {
        s_requestId = COORDINATOR.requestRandomWords(
            s_keyHash,
            s_subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );

        table.randomOperationStatus = RandomOperationStatus.Waiting;
        table.randomOperationAt = _randomOperationAt;

        tablesRequest[s_requestId] = table;
        tables[table.player] = table;
    }

    function fulfillRandomWords(uint256 _requestId, uint256[] memory randomWords) internal virtual override {
        BlackJackTable memory table = tablesRequest[_requestId];

        uint256 amountBet = table.amountBet;
        address player = table.player;
        uint256[21] memory emptyArray = EMPTY_ARRAY_21;

        emit FulFillCalled(_requestId);

        ///////////////
        // StartGame //
        ///////////////
        if (table.randomOperationAt == RandomOperationAt.StartGame) {
            // Player
            table.playerCards[table.playerCardsNum] = (randomWords[0] % 13) + 1;
            table.playerCardsNum++;

            table.playerCards[table.playerCardsNum] = (randomWords[1] % 13) + 1;
            table.playerCardsNum++;

            // Dealer
            table.dealerCards[table.dealerCardsNum] = (randomWords[2] % 13) + 1;
            table.dealerCardsNum++;

            table.gameState = GameState.InGame;
            table.randomOperationStatus = RandomOperationStatus.NotSended;

            tables[player] = table;

            emit GameStarted(player);
            return;
        }

        /////////////////
        //    stand    //
        ////////////////

        if (table.randomOperationAt == RandomOperationAt.Stand) {
            uint256 i = 0;

            emit PlayerStand(player);

            do {
                table.dealerCards[table.dealerCardsNum] = (randomWords[i] % 13) + 1;
                table.dealerCardsNum++;
                i++;
            } while (getTotalValueOfCards(table.dealerCards) <= 16);

            uint256[21] memory dealerCards = table.dealerCards;
            uint256[21] memory playerCards = table.playerCards;
            uint256 dealerValue = getTotalValueOfCards(dealerCards);
            uint256 playerValue = getTotalValueOfCards(playerCards);

            tables[player] = BlackJackTable({
                gameState: GameState.NotPlaying,
                randomOperationStatus: RandomOperationStatus.NotSended,
                randomOperationAt: RandomOperationAt.StartGame,
                playerCards: emptyArray,
                playerCardsNum: 0,
                dealerCards: emptyArray,
                dealerCardsNum: 0,
                player: 0x000000000000000000000000000000000000dEaD,
                amountBet: 0
            });

            if (dealerValue > 21 || playerValue > dealerValue) {
                uint256 amountSend = amountBet * 2;

                (bool success, ) = player.call{ value: amountSend }("");
                if (!success) revert BlackJack3__CallNotSuccess();

                emit PlayerWin(player, playerCards, playerValue, dealerCards, dealerValue);

                return;
            } else if (dealerValue == playerValue) {
                (bool success, ) = player.call{ value: amountBet }("");
                if (!success) revert BlackJack3__CallNotSuccess();

                emit PlayerDraft(player, playerCards, playerValue, dealerCards, dealerValue);
                return;
            }
            // Player Lose
            emit PlayerLose(player, playerCards, playerValue, dealerCards, dealerValue);
            return;
        }

        ///////////////
        //    Hit    //
        ///////////////

        if (table.randomOperationAt == RandomOperationAt.Hit) {
            uint256 newCard = (randomWords[0] & 13) + 1;
            table.playerCards[table.playerCardsNum] = newCard;
            table.playerCardsNum++;

            uint256 result = getTotalValueOfCards(table.playerCards);

            emit PlayerHit(player, newCard);

            if (result > 21) {
                uint256[21] memory dealerCards = table.dealerCards;
                uint256[21] memory playerCards = table.playerCards;
                uint256 dealerValue = getTotalValueOfCards(dealerCards);
                uint256 playerValue = getTotalValueOfCards(playerCards);

                tables[player] = BlackJackTable({
                    gameState: GameState.NotPlaying,
                    randomOperationStatus: RandomOperationStatus.NotSended,
                    randomOperationAt: RandomOperationAt.StartGame,
                    playerCards: emptyArray,
                    playerCardsNum: 0,
                    dealerCards: emptyArray,
                    dealerCardsNum: 0,
                    player: 0x000000000000000000000000000000000000dEaD,
                    amountBet: 0
                });

                emit PlayerLose(player, playerCards, playerValue, dealerCards, dealerValue);

                return;
            }

            tables[player] = table;
            return;
        }
    }

    function getTotalValueOfCards(uint256[21] memory cards) private view returns (uint256) {
        uint256 result = 0;
        uint256 numberOfAs = 0;

        for (uint256 i = 0; i < cards.length && cards[i] != 0; i++) {
            result += CARDS_VALUE[cards[i]];
            if (cards[i] == 1) /** AS */
            {
                numberOfAs++;
            }
        }

        for (uint256 j = 0; j < numberOfAs && result > 21; j++) {
            result -= 10;
        }

        return result;
    }

    function getPlayerCards(address _player) public view returns (uint256[21] memory) {
        BlackJackTable memory table = tables[_player];
        return table.playerCards;
    }

    function getDealerCards(address _player) public view returns (uint256[21] memory) {
        BlackJackTable memory table = tables[_player];
        return table.dealerCards;
    }
}
