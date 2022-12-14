// SPDX-License-Identifier:MIT
pragma solidity ^0.8.9;

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
struct BlackJackTable {
    GameState gameState;
    RandomOperationStatus randomOperationStatus;
    RandomOperationAt randomOperationAt;
    uint16[21] playerCards;
    uint16 playerCardsNum;
    uint16[21] dealerCards;
    uint16 dealerCardsNum;
    uint256 amountBet;
    address player;
}
