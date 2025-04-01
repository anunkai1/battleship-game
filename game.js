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
        this.shipsContainer = document.getElementById('shipsContainer');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatBtn = document.getElementById('sendChatBtn');
        
        this.shipsToPlace = [[4, 1], [3, 2], [2, 3], [1, 4]];
        this.remainingShips = [];
        this.playerShips = new Set();
        this.playerShipGroups = []; // Track ships as groups of positions
        this.isPlacingShips = false;
        this.myTurn = false;
        this.hitsRemaining = this.calculateTotalShipCells();
        this.currentShip = null;
        this.hitSound = document.getElementById('hitSound');
        this.missSound = document.getElementById('missSound');
        this.winSound = document.getElementById('winSound');

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
            cell.addEventListener('dragover', (e) => this.handleDragOver(e));
            cell.addEventListener('drop', (e) => this.handleDrop(e));
            cell.addEventListener('dragenter', (e) => this.handleDragEnter(e));
            cell.addEventListener('dragleave', (e) => this.handleDragLeave(e));
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
        this.sendChatBtn.addEventListener('click', () => this.sendChat());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };
    }

    startGame() {
        socket.send(JSON.stringify({ type: 'start' }));
        this.isPlacingShips = true;
        this.remainingShips = [...this.shipsToPlace];
        this.status.textContent = 'Drag and drop your ships onto the board! Pick the orientation you want.';
        this.startBtn.disabled = true;
        this.renderShipsToPlace();
    }

    renderShipsToPlace() {
        this.shipsContainer.innerHTML = '';
        this.remainingShips.forEach(([length, quantity], shipTypeIndex) => {
            for (let i = 0; i < quantity; i++) {
                const shipGroup = document.createElement('div');
                shipGroup.className = `ship-group ${length === 1 ? 'single' : ''}`;

                const label = document.createElement('div');
                label.textContent = `${length}-long ship`;
                label.style.fontSize = '0.9em';
                label.style.color = '#333';
                shipGroup.appendChild(label);

                const horizontalShip = document.createElement('div');
                horizontalShip.className = 'ship-to-place';
                horizontalShip.dataset.length = length;
                horizontalShip.dataset.shipType = shipTypeIndex;
                horizontalShip.dataset.shipIndex = i;
                horizontalShip.dataset.orientation = 'horizontal';
                horizontalShip.draggable = true;
                for (let j = 0; j < length; j++) {
                    const cell = document.createElement('div');
                    horizontalShip.appendChild(cell);
                }

                horizontalShip.addEventListener('dragstart', (e) => this.handleDragStart(e));
                horizontalShip.addEventListener('dragend', () => this.handleDragEnd());

                if (length === 1) {
                    const shipOptions = document.createElement('div');
                    shipOptions.className = 'ship-options';
                    shipOptions.appendChild(horizontalShip);
                    shipGroup.appendChild(shipOptions);
                } else {
                    const verticalShip = document.createElement('div');
                    verticalShip.className = 'ship-to-place vertical';
                    verticalShip.dataset.length = length;
                    verticalShip.dataset.shipType = shipTypeIndex;
                    verticalShip.dataset.shipIndex = i;
                    verticalShip.dataset.orientation = 'vertical';
                    verticalShip.draggable = true;
                    for (let j = 0; j < length; j++) {
                        const cell = document.createElement('div');
                        verticalShip.appendChild(cell);
                    }

                    verticalShip.addEventListener('dragstart', (e) => this.handleDragStart(e));
                    verticalShip.addEventListener('dragend', () => this.handleDragEnd());

                    const orLabel = document.createElement('span');
                    orLabel.className = 'or-label';
                    orLabel.textContent = 'or';

                    const shipOptions = document.createElement('div');
                    shipOptions.className = 'ship-options';
                    shipOptions.appendChild(horizontalShip);
                    shipOptions.appendChild(orLabel);
                    shipOptions.appendChild(verticalShip);
                    shipGroup.appendChild(shipOptions);
                }

                this.shipsContainer.appendChild(shipGroup);
            }
        });
    }

    handleDragStart(e) {
        this.currentShip = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.dataset.length);
    }

    handleDragEnd() {
        if (this.currentShip) {
            this.currentShip.classList.remove('dragging');
            this.currentShip = null;
            for (let i = 0; i < this.boardSize * this.boardSize; i++) {
                this.playerBoard.children[i].classList.remove('preview-valid', 'preview-invalid');
            }
        }
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDragEnter(e) {
        e.preventDefault();
        if (!this.isPlacingShips || !this.currentShip) return;

        const length = parseInt(this.currentShip.dataset.length);
        const orientation = this.currentShip.dataset.orientation;
        const cellIndex = parseInt(e.target.dataset.index);
        const row = Math.floor(cellIndex / this.boardSize);
        const col = cellIndex % this.boardSize;

        let positions = [];
        let fits = true;
        if (orientation === 'horizontal') {
            if (col + length > this.boardSize) fits = false;
            else {
                for (let i = 0; i < length; i++) {
                    positions.push(row * this.boardSize + col + i);
                }
            }
        } else {
            if (row + length > this.boardSize) fits = false;
            else {
                for (let i = 0; i < length; i++) {
                    positions.push((row + i) * this.boardSize + col);
                }
            }
        }

        if (fits) {
            let canPlace = true;
            for (const pos of positions) {
                if (this.playerShips.has(pos) || this.hasAdjacentShip(pos)) {
                    canPlace = false;
                    break;
                }
            }
            positions.forEach(pos => {
                const cell = this.playerBoard.children[pos];
                cell.classList.add(canPlace ? 'preview-valid' : 'preview-invalid');
            });
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        if (!this.isPlacingShips || !this.currentShip) return;

        const length = parseInt(this.currentShip.dataset.length);
        const orientation = this.currentShip.dataset.orientation;
        const cellIndex = parseInt(e.target.dataset.index);
        const row = Math.floor(cellIndex / this.boardSize);
        const col = cellIndex % this.boardSize;

        let positions = [];
        if (orientation === 'horizontal' && col + length <= this.boardSize) {
            for (let i = 0; i < length; i++) {
                positions.push(row * this.boardSize + col + i);
            }
        } else if (orientation === 'vertical' && row + length <= this.boardSize) {
            for (let i = 0; i < length; i++) {
                positions.push((row + i) * this.boardSize + col);
            }
        }

        positions.forEach(pos => {
            const cell = this.playerBoard.children[pos];
            cell.classList.remove('preview-valid', 'preview-invalid');
        });
    }

    handleDrop(e) {
        e.preventDefault();
        if (!this.isPlacingShips || !this.currentShip) return;

        const length = parseInt(this.currentShip.dataset.length);
        const shipTypeIndex = parseInt(this.currentShip.dataset.shipType);
        const shipIndex = parseInt(this.currentShip.dataset.shipIndex);
        const orientation = this.currentShip.dataset.orientation;
        const cellIndex = parseInt(e.target.dataset.index);
        const row = Math.floor(cellIndex / this.boardSize);
        const col = cellIndex % this.boardSize;

        let positions = [];
        if (orientation === 'horizontal') {
            if (col + length > this.boardSize) {
                this.status.textContent = 'Ship doesn’t fit horizontally! Try a different position.';
                return;
            }
            for (let i = 0; i < length; i++) {
                positions.push(row * this.boardSize + col + i);
            }
        } else {
            if (row + length > this.boardSize) {
                this.status.textContent = 'Ship doesn’t fit vertically! Try a different position.';
                return;
            }
            for (let i = 0; i < length; i++) {
                positions.push((row + i) * this.boardSize + col);
            }
        }

        let canPlace = true;
        for (const pos of positions) {
            if (this.playerShips.has(pos) || this.hasAdjacentShip(pos)) {
                canPlace = false;
                break;
            }
        }

        if (canPlace) {
            positions.forEach(pos => {
                this.playerShips.add(pos);
                this.playerBoard.children[pos].classList.add('ship');
            });

            // Store the ship as a group of positions
            this.playerShipGroups.push(positions);

            this.remainingShips[shipTypeIndex][1]--;
            if (this.remainingShips[shipTypeIndex][1] === 0) {
                this.remainingShips.splice(shipTypeIndex, 1);
            } else {
                this.remainingShips[shipTypeIndex] = [length, this.remainingShips[shipTypeIndex][1]];
            }

            this.currentShip.parentElement.parentElement.remove();

            if (this.remainingShips.length > 0) {
                this.renderShipsToPlace();
                this.status.textContent = 'Drag and drop your next ship! Pick the orientation you want.';
            } else {
                this.isPlacingShips = false;
                this.shipsContainer.innerHTML = '';
                this.status.textContent = 'All ships placed! Waiting for opponent...';
                // Send ships as an array of arrays (grouped by ship)
                socket.send(JSON.stringify({ type: 'shipsPlaced', ships: this.playerShipGroups }));
            }
        } else {
            this.status.textContent = 'Cannot place ship here! Ships can’t touch or overlap.';
        }
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

    makeMove(position) {
        if (this.isPlacingShips || !this.myTurn) return;
        const cell = this.opponentBoard.children[position];
        if (cell.classList.contains('hit') || cell.classList.contains('miss') || cell.classList.contains('adjacent')) return;

        socket.send(JSON.stringify({
            type: 'move',
            position: position
        }));
        this.myTurn = false;
        this.status.textContent = 'Waiting for opponent’s move...';
    }

    sendChat() {
        const message = this.chatInput.value.trim();
        if (message) {
            socket.send(JSON.stringify({ type: 'chat', message }));
            this.chatInput.value = '';
        }
    }

    handleMessage(data) {
        switch(data.type) {
            case 'hit':
                this.updateBoard(this.opponentBoard, data.position, 'hit');
                this.hitSound.play();
                break;
            case 'miss':
                this.updateBoard(this.opponentBoard, data.position, 'miss');
                this.missSound.play();
                break;
            case 'opponentMove':
                const hit = this.playerShips.has(data.position);
                this.updateBoard(this.playerBoard, data.position, hit ? 'hit' : 'miss');
                if (hit) {
                    this.hitsRemaining--;
                    this.hitSound.play();
                } else {
                    this.missSound.play();
                }
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
                if (data.result === 'win') {
                    this.winSound.play();
                }
                this.myTurn = false;
                break;
            case 'chat':
                const messageDiv = document.createElement('div');
                messageDiv.textContent = data.message;
                this.chatMessages.appendChild(messageDiv);
                this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
                break;
            case 'markAdjacent':
                const board = data.boardType === 'opponent' ? this.opponentBoard : this.playerBoard;
                data.positions.forEach(pos => {
                    const cell = board.children[pos];
                    if (!cell.classList.contains('hit')) {
                        cell.classList.add('adjacent');
                    }
                });
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