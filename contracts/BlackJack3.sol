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

    event GameStarted(address indexed player, uint256 playerCard_1, uint256 playerCard_2, uint256 dealerCard);
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
    event RandomOperationResponse(uint256 indexed requestId, RandomOperationAt randomOperationAt, address player);
    event RandomOperationRequest(uint256 indexed requestId, RandomOperationAt randomOperationAt, address player);

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

    uint32 private constant CALLBACK_GAS_LIMIT = 2500000;

    uint16 private constant REQUEST_CONFIRMATIONS = 3;

    uint32 private constant NUM_WORDS = 8;

    uint256 public constant MIN_AMOUNT = 10000000000000000; // 0.01 ETH

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

    mapping(address => BlackJackTable) public tables;

    mapping(uint256 => BlackJackTable) public tablesRequest;

    /////////////////////////////
    //    Constructor         //
    ////////////////////////////
    constructor(
        uint64 subscriptionId,
        address vrfCoordinator,
        bytes32 keyHash
    ) VRFConsumerBaseV2(vrfCoordinator) {
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);
        s_keyHash = keyHash;
        s_subscriptionId = subscriptionId;
    }

    /**
     * @notice startGame
     */
    function startGame() public payable notInGame notRandomOperationEmitted {
        if (msg.value < MIN_AMOUNT) {
            revert BlackJack3__InsufficientETH();
        }

        BlackJackTable memory table = tables[msg.sender];
        table.amountBet = msg.value;
        table.player = msg.sender;
        table.randomOperationStatus = RandomOperationStatus.Waiting;
        tables[msg.sender] = table;

        performRandomOperation(RandomOperationAt.StartGame, table);
    }

    /**
     * @notice hit
     */
    function hit() public inGame {
        BlackJackTable memory table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Hit, table);
    }

    /**
     * @notice stand
     */
    function stand() public inGame {
        BlackJackTable memory table = tables[msg.sender];
        performRandomOperation(RandomOperationAt.Stand, table);
    }

    /**
     * @notice stand
     */
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

    /**
     * @notice performRandomOperation send to ChainLink Coordinator a request of random words
     */
    function performRandomOperation(RandomOperationAt _randomOperationAt, BlackJackTable memory table) private {
        uint256 requestId = COORDINATOR.requestRandomWords(
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

        emit RandomOperationRequest(requestId, _randomOperationAt, msg.sender);
    }

    /**
     * @notice fulfillRandomness handles the VRF response. Your contract must
     * @notice implement it. See "SECURITY CONSIDERATIONS" above for important
     * @notice principles to keep in mind when implementing your fulfillRandomness
     * @notice method.
     *
     * @dev VRFConsumerBaseV2 expects its subcontracts to have a method with this
     * @dev signature, and will call it once it has verified the proof
     * @dev associated with the randomness. (It is triggered via a call to
     * @dev rawFulfillRandomness, below.)
     *
     * @param _requestId The Id initially returned by requestRandomness
     * @param _randomWords the VRF output expanded to the requested number of words
     */
    function fulfillRandomWords(uint256 _requestId, uint256[] memory _randomWords) internal virtual override {
        BlackJackTable memory table = tablesRequest[_requestId];

        uint256 amountBet = table.amountBet;
        address player = table.player;

        emit RandomOperationResponse(_requestId, table.randomOperationAt, player);

        ///////////////
        // StartGame //
        ///////////////
        if (table.randomOperationAt == RandomOperationAt.StartGame) {
            // Player
            table.playerCards[table.playerCardsNum] = (_randomWords[0] % 13) + 1;
            table.playerCardsNum++;

            table.playerCards[table.playerCardsNum] = (_randomWords[1] % 13) + 1;
            table.playerCardsNum++;

            // Dealer
            table.dealerCards[table.dealerCardsNum] = (_randomWords[2] % 13) + 1;
            table.dealerCardsNum++;

            table.gameState = GameState.InGame;
            table.randomOperationStatus = RandomOperationStatus.NotSended;

            tables[player] = table;

            emit GameStarted(
                player,
                table.playerCards[table.playerCardsNum - 2],
                table.playerCards[table.playerCardsNum - 1],
                table.dealerCards[table.dealerCardsNum - 1]
            );
            return;
        }

        /////////////////
        //    stand    //
        ////////////////

        if (table.randomOperationAt == RandomOperationAt.Stand) {
            uint256 i = 0;

            emit PlayerStand(player);

            do {
                table.dealerCards[table.dealerCardsNum] = (_randomWords[i] % 13) + 1;
                table.dealerCardsNum++;
                i++;
            } while (getTotalValueOfCards(table.dealerCards) <= 16);

            uint256[21] memory dealerCards = table.dealerCards;
            uint256[21] memory playerCards = table.playerCards;
            uint256 dealerValue = getTotalValueOfCards(dealerCards);
            uint256 playerValue = getTotalValueOfCards(playerCards);

            delete tables[player];

            if (dealerValue > 21 || playerValue > dealerValue) {
                uint256 amountSend = amountBet * 2;

                (bool success, ) = player.call{ value: amountSend }("");
                if (!success) revert BlackJack3__CallNotSuccess();

                emit PlayerWin(player, playerCards, playerValue, dealerCards, dealerValue);

                return;
            }

            if (dealerValue == playerValue) {
                (bool success, ) = player.call{ value: amountBet }("");
                if (!success) revert BlackJack3__CallNotSuccess();

                emit PlayerDraft(player, playerCards, playerValue, dealerCards, dealerValue);

                return;
            }

            emit PlayerLose(player, playerCards, playerValue, dealerCards, dealerValue);
            return;
        }

        ///////////////
        //    Hit    //
        ///////////////

        if (table.randomOperationAt == RandomOperationAt.Hit) {
            uint256 newCard = (_randomWords[0] & 13) + 1;
            table.playerCards[table.playerCardsNum] = newCard;
            table.playerCardsNum++;

            uint256 result = getTotalValueOfCards(table.playerCards);

            emit PlayerHit(player, newCard);

            if (result > 21) {
                uint256[21] memory dealerCards = table.dealerCards;
                uint256[21] memory playerCards = table.playerCards;
                uint256 dealerValue = getTotalValueOfCards(dealerCards);
                uint256 playerValue = getTotalValueOfCards(playerCards);

                delete tables[player];

                emit PlayerLose(player, playerCards, playerValue, dealerCards, dealerValue);

                return;
            }

            tables[player] = table;
            return;
        }

        revert BlackJack3__InvalidRandomOperation();
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
