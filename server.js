const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = app.listen(process.env.PORT || 8080, () => {
    console.log(`Server running on port ${process.env.PORT || 8080}`);
});

app.use(express.static(path.join(__dirname, '.')));

const wss = new WebSocket.Server({ server });

let players = [];
let currentTurn = 0;
let gameState = { player1Ships: null, player2Ships: null };

wss.on('connection', (ws) => {
    if (players.length < 2) {
        players.push(ws);
        ws.send(JSON.stringify({ type: 'gameStatus', message: players.length === 1 ? 'Waiting for opponent...' : 'Game started! Your turn!' }));
        if (players.length === 2) {
            players[1].send(JSON.stringify({ type: 'gameStatus', message: 'Game started! Waiting for opponent...' }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'gameStatus', message: 'Game full!' }));
        ws.close();
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const playerIndex = players.indexOf(ws);

        switch(data.type) {
            case 'start':
                break;
            case 'shipsPlaced':
                // Ships are now an array of arrays (each inner array is a ship's positions)
                const ships = data.ships.map(shipPositions => ({
                    positions: shipPositions,
                    hits: new Set()
                }));

                if (playerIndex === 0) {
                    gameState.player1Ships = ships;
                } else {
                    gameState.player2Ships = ships;
                }

                console.log(`Player ${playerIndex} ships:`, ships);

                if (gameState.player1Ships && gameState.player2Ships) {
                    players[0].send(JSON.stringify({ type: 'gameStatus', message: 'Game started! Your turn!' }));
                    players[1].send(JSON.stringify({ type: 'gameStatus', message: 'Game started! Waiting for opponent...' }));
                    currentTurn = 0;
                }
                break;
            case 'move':
                if (playerIndex !== currentTurn) return;

                const opponentIndex = playerIndex === 0 ? 1 : 0;
                const opponentShips = playerIndex === 0 ? gameState.player2Ships : gameState.player1Ships;
                const hit = opponentShips.some(ship => ship.positions.includes(data.position));

                // Send the hit/miss message first
                players[opponentIndex].send(JSON.stringify({
                    type: 'opponentMove',
                    position: data.position
                }));
                ws.send(JSON.stringify({
                    type: hit ? 'hit' : 'miss',
                    position: data.position
                }));

                if (hit) {
                    const ship = opponentShips.find(s => s.positions.includes(data.position));
                    ship.hits.add(data.position);

                    console.log(`Hit on Player ${opponentIndex}'s ship at position ${data.position}. Ship positions:`, ship.positions, "Hits:", Array.from(ship.hits));

                    if (ship.hits.size === ship.positions.length) {
                        console.log(`Player ${opponentIndex}'s ship sunk at positions:`, ship.positions);
                        const adjacentPositions = new Set();
                        const boardSize = 10;
                        ship.positions.forEach(pos => {
                            const row = Math.floor(pos / boardSize);
                            const col = pos % boardSize;
                            const directions = [
                                [-1, -1], [-1, 0], [-1, 1],
                                [0, -1],           [0, 1],
                                [1, -1],  [1, 0],  [1, 1]
                            ];

                            for (const [dr, dc] of directions) {
                                const newRow = row + dr;
                                const newCol = col + dc;
                                if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize) {
                                    const adjacentPos = newRow * boardSize + newCol;
                                    if (!opponentShips.some(s => s.positions.includes(adjacentPos))) {
                                        adjacentPositions.add(adjacentPos);
                                    }
                                }
                            }
                        });

                        console.log(`Marking adjacent positions for Player ${opponentIndex}:`, Array.from(adjacentPositions));

                        // Notify both players to mark adjacent squares
                        players[playerIndex].send(JSON.stringify({
                            type: 'markAdjacent',
                            positions: Array.from(adjacentPositions),
                            boardType: 'opponent'
                        }));
                        players[opponentIndex].send(JSON.stringify({
                            type: 'markAdjacent',
                            positions: Array.from(adjacentPositions),
                            boardType: 'player'
                        }));
                    }
                }

                currentTurn = currentTurn === 0 ? 1 : 0;
                players[currentTurn].send(JSON.stringify({ type: 'gameStatus', message: 'Your turn!' }));
                players[currentTurn === 0 ? 1 : 0].send(JSON.stringify({ type: 'gameStatus', message: 'Waiting for opponent...' }));
                break;
            case 'gameOver':
                players.forEach((player, index) => {
                    if (player !== ws) {
                        player.send(JSON.stringify({ type: 'gameOver', result: 'win' }));
                    }
                    player.send(JSON.stringify({ type: 'gameOver', result: playerIndex === index ? 'lose' : 'win' }));
                });
                players = [];
                gameState = { player1Ships: null, player2Ships: null };
                break;
            case 'chat':
                players.forEach((player, index) => {
                    player.send(JSON.stringify({
                        type: 'chat',
                        message: `Player ${playerIndex + 1}: ${data.message}`
                    }));
                });
                break;
        }
    });

    ws.on('close', () => {
        players = players.filter(player => player !== ws);
        if (players.length === 1) {
            players[0].send(JSON.stringify({ type: 'gameStatus', message: 'Opponent disconnected. Game over!' }));
            players = [];
            gameState = { player1Ships: null, player2Ships: null };
        }
    });
});