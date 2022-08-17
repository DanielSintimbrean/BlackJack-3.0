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
    uint256[21] playerCards; // Baraja jugador
    uint256 playerCardsNum;
    uint256[21] dealerCards; // Baraja dealer
    uint256 dealerCardsNum;
    uint256 amountBet;
    address player;
}
