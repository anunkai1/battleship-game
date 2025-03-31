// game.js
const socket = new WebSocket(`wss://${window.location.host}`);

socket.onopen = () => console.log('WebSocket connected');
socket.onerror = (err) => console.error('WebSocket error:', err);

class Battleship {
    constructor() {
        this.boardSize = 10;
        this.playerBoard = document.getElementById('playerBoard');
        this.opponentBoard = document.getElementById('opponentBoard');
        this.status = document.getElementById('status');
        this.startBtn = document.getElementById('startBtn');
        
        this.shipsToPlace = [[4, 1], [3, 2], [2, 3], [1, 4]];
        this.remainingShips = [...this.shipsToPlace];
        this.playerShips = new Set();
        this.isPlacingShips = false;
        this.myTurn = false;
        this.hitsRemaining = this.calculateTotalShipCells();

        this.initBoards();
        this.setupEventListeners();
    }

    calculateTotalShipCells() {
        return this.shipsToPlace.reduce((total, [length, qty]) => total + length * qty, 0);
    }

    initBoards() {
        for (let i = 0; i < this.boardSize * this.boardSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => this.placeShip(i));
            this.playerBoard.appendChild(cell);
        }

        for (let i = 0; i < this.boardSize * this.boardSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => this.makeMove(i));
            this.opponentBoard.appendChild(cell);
        }
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startGame());
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };
    }

    startGame() {
        socket.send(JSON.stringify({ type: 'start' }));
        this.isPlacingShips = true;
        this.status.textContent = 'Place your ships! Start with the 4-long ship.';
        this.startBtn.disabled = true;
    }

    hasAdjacentShip(pos) {
        const row = Math.floor(pos / this.boardSize);
        const col = pos % this.boardSize;
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (const [dr, dc] of directions) {
            const newRow = row + dr;
            const newCol = col + dc;
            if (newRow >= 0 && newRow < this.boardSize && newCol >= 0 && newCol < this.boardSize) {
                const adjacentPos = newRow * this.boardSize + newCol;
                if (this.playerShips.has(adjacentPos)) return true;
            }
        }
        return false;
    }

    placeShip(position) {
        if (!this.isPlacingShips || this.remainingShips.length === 0) return;

        const [length, quantity] = this.remainingShips[0];
        const row = Math.floor(position / this.boardSize);
        const col = position % this.boardSize;

        if (col + length > this.boardSize) {
            this.status.textContent = 'Ship doesn’t fit! Try a different starting position.';
            return;
        }

        let canPlace = true;
        const positions = [];
        for (let i = 0; i < length; i++) {
            const pos = row * this.boardSize + col + i;
            if (this.playerShips.has(pos) || this.hasAdjacentShip(pos)) {
                canPlace = false;
                break;
            }
            positions.push(pos);
        }

        if (canPlace) {
            positions.forEach(pos => {
                this.playerShips.add(pos);
                this.playerBoard.children[pos].classList.add('ship');
            });

            this.remainingShips[0][1]--;
            if (this.remainingShips[0][1] === 0) this.remainingShips.shift();

            if (this.remainingShips.length > 0) {
                const nextLength = this.remainingShips[0][0];
                this.status.textContent = `Place a ${nextLength}-long ship (${this.remainingShips[0][1]} left).`;
            } else {
                this.isPlacingShips = false;
                this.status.textContent = 'All ships placed! Waiting for opponent...';
                socket.send(JSON.stringify({ type: 'shipsPlaced', ships: Array.from(this.playerShips) }));
            }
        } else {
            this.status.textContent = 'Cannot place ship here! Ships can’t touch or overlap.';
        }
    }

    makeMove(position) {
        if (this.isPlacingShips || !this.myTurn) return;
        const cell = this.opponentBoard.children[position];
        if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

        socket.send(JSON.stringify({
            type: 'move',
            position: position
        }));
        this.myTurn = false;
        this.status.textContent = 'Waiting for opponent’s move...';
    }

    handleMessage(data) {
        switch(data.type) {
            case 'hit':
                this.updateBoard(this.opponentBoard, data.position, 'hit');
                break;
            case 'miss':
                this.updateBoard(this.opponentBoard, data.position, 'miss');
                break;
            case 'opponentMove':
                const hit = this.playerShips.has(data.position);
                this.updateBoard(this.playerBoard, data.position, hit ? 'hit' : 'miss');
                if (hit) this.hitsRemaining--;
                if (this.hitsRemaining === 0) {
                    socket.send(JSON.stringify({ type: 'gameOver', winner: 'opponent' }));
                } else {
                    this.myTurn = true;
                    this.status.textContent = 'Your turn!';
                }
                break;
            case 'gameStatus':
                this.status.textContent = data.message;
                if (data.message === 'Game started! Your turn!') this.myTurn = true;
                break;
            case 'gameOver':
                this.status.textContent = `Game over! ${data.result === 'win' ? 'You won!' : 'You lost!'}`;
                this.myTurn = false;
                break;
        }
    }

    updateBoard(board, position, result) {
        const cell = board.children[position];
        cell.classList.add(result);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Battleship();
});