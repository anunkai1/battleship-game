// server.js
const WebSocket = require('ws');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

let players = [];
let observers = [];
let playersReady = 0;
let currentTurn = 0;
let playerShips = [[], []];

// Serve static files from the current directory
app.use(express.static(__dirname));

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch(data.type) {
            case 'start':
                if (players.length < 2) {
                    players.push(ws);
                    ws.send(JSON.stringify({ type: 'gameStatus', message: 'Waiting for opponent...' }));
                    if (players.length === 2) {
                        broadcastToPlayers({ type: 'gameStatus', message: 'Place your ships!' });
                    }
                } else {
                    observers.push(ws);
                    ws.send(JSON.stringify({ type: 'gameStatus', message: 'Observing game...' }));
                }
                break;

            case 'shipsPlaced':
                const playerIndex = players.indexOf(ws);
                playerShips[playerIndex] = data.ships;
                playersReady++;
                if (playersReady === 2) {
                    players[0].send(JSON.stringify({ type: 'gameStatus', message: 'Game started! Your turn!' }));
                    players[1].send(JSON.stringify({ type: 'gameStatus', message: 'Game started! Waiting for opponent...' }));
                    currentTurn = 0;
                    playersReady = 0;
                }
                break;

            case 'move':
                if (players.indexOf(ws) !== currentTurn) return;
                const opponent = players[currentTurn === 0 ? 1 : 0];
                const hit = playerShips[opponent === players[0] ? 0 : 1].includes(data.position);
                ws.send(JSON.stringify({ type: hit ? 'hit' : 'miss', position: data.position }));
                opponent.send(JSON.stringify({ type: 'opponentMove', position: data.position }));
                currentTurn = currentTurn === 0 ? 1 : 0;
                break;

            case 'gameOver':
                const loserIndex = players.indexOf(ws);
                const winnerIndex = loserIndex === 0 ? 1 : 0;
                players[winnerIndex].send(JSON.stringify({ type: 'gameOver', result: 'win' }));
                players[loserIndex].send(JSON.stringify({ type: 'gameOver', result: 'lose' }));
                const observerMessage = { type: 'gameOver', message: `Player ${winnerIndex + 1} wins!` };
                observers.forEach(o => o.send(JSON.stringify(observerMessage)));
                break;
        }
    });

    ws.on('close', () => {
        players = players.filter(p => p !== ws);
        observers = observers.filter(o => o !== ws);
        playersReady = Math.max(0, playersReady - 1);
        if (players.length < 2) {
            broadcastToPlayers({ type: 'gameStatus', message: 'Opponent disconnected. Game ended.' });
        }
    });
});

function broadcastToPlayers(message) {
    players.forEach(p => p.send(JSON.stringify(message)));
    observers.forEach(o => o.send(JSON.stringify(message)));
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});