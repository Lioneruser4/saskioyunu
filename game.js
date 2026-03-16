// ==================== ANA SINIF ====================
class ShashkiGame {
    constructor() {
        this.socket = null;
        this.currentScreen = 'loading';
        this.user = null;
        this.roomId = null;
        this.gameState = null;
        this.playerId = null;
        this.opponentId = null;
        this.selectedPiece = null;
        this.validMoves = [];
        this.language = 'az';
        this.timers = {};
        this.reconnectAttempts = 0;
        
        this.translations = {
            az: {
                connecting: 'Sunucuya bağlanır...',
                quickMatch: 'Sürətli oyun',
                createRoom: 'Otaq yarat',
                ranked: 'Kilidli Dərəcəli',
                roomCode: 'Otaq kodu:',
                copy: 'Kopyala',
                waiting: 'Rəqib gözlənilir...',
                yourTurn: 'Sizin növbəniz',
                opponentTurn: 'Rəqibin növbəsi',
                youWon: 'Siz qazandınız!',
                youLost: 'Rəqib qazandı!',
                backToMenu: 'Menyuya qayıt',
                reconnect: 'Yenidən bağlanır...'
            },
            en: {
                connecting: 'Connecting to server...',
                quickMatch: 'Quick Match',
                createRoom: 'Create Room',
                ranked: 'Locked Ranked',
                roomCode: 'Room code:',
                copy: 'Copy',
                waiting: 'Waiting for opponent...',
                yourTurn: 'Your turn',
                opponentTurn: 'Opponent\'s turn',
                youWon: 'You won!',
                youLost: 'You lost!',
                backToMenu: 'Back to Menu',
                reconnect: 'Reconnecting...'
            }
        };
        
        this.init();
    }
    
    t(key) {
        return this.translations[this.language][key] || key;
    }
    
    init() {
        this.showLoading();
        this.loadTelegramData();
        this.connectWebSocket();
    }
    
    loadTelegramData() {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.expand();
            tg.enableClosingConfirmation();
            
            this.user = tg.initDataUnsafe?.user || {
                id: Date.now(),
                first_name: 'Player',
                photo_url: null
            };
        } else {
            this.user = {
                id: Date.now(),
                first_name: 'Test Player',
                photo_url: null
            };
        }
    }
    
    connectWebSocket() {
        // WebSocket sunucusu (gerçek sunucu adresinizi yazın)
        const wsUrl = 'wss://your-server.com/ws'; // Değiştirin!
        
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('WebSocket bağlandı');
            this.reconnectAttempts = 0;
            this.send({
                type: 'user:info',
                data: {
                    id: this.user.id,
                    name: this.user.first_name,
                    photo: this.user.photo_url,
                    lang: this.language
                }
            });
            
            // Yeniden bağlanma varsa
            if (this.roomId) {
                this.send({
                    type: 'reconnect:request',
                    data: { roomId: this.roomId, playerId: this.user.id }
                });
            } else {
                this.showMainMenu();
            }
        };
        
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        
        this.socket.onclose = () => {
            console.log('WebSocket kapandı');
            this.handleDisconnect();
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket hatası:', error);
        };
    }
    
    handleMessage(message) {
        switch(message.type) {
            case 'room:created':
                this.roomId = message.data.roomId;
                this.showRoomCode();
                break;
                
            case 'game:start':
                this.gameState = message.data.game;
                this.opponentId = message.data.players.find(p => p.id !== this.user.id);
                this.playerId = this.user.id;
                this.showGameScreen();
                break;
                
            case 'move:made':
                this.gameState = message.data.game;
                this.updateBoard();
                if (message.data.auto) {
                    this.showMessage('Auto move', 1000);
                }
                break;
                
            case 'timer:update':
                this.updateTimer(message.data.player, message.data.timeLeft);
                break;
                
            case 'game:over':
                this.showWinner(message.data.winner);
                break;
                
            case 'opponent:disconnected':
                this.showMessage('Rəqib ayrıldı', 3000);
                setTimeout(() => this.showMainMenu(), 3000);
                break;
                
            case 'reconnect:success':
                this.gameState = message.data.game;
                this.opponentId = message.data.players.find(p => p.id !== this.user.id);
                this.showGameScreen();
                break;
        }
    }
    
    send(message) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }
    
    handleDisconnect() {
        this.showLoading(this.t('reconnect'));
        
        setTimeout(() => {
            this.reconnectAttempts++;
            if (this.reconnectAttempts < 5) {
                this.connectWebSocket();
            } else {
                alert('Bağlantı kurulamadı');
                this.showMainMenu();
            }
        }, 2000);
    }
    
    // ==================== EKRAN YÖNETİMİ ====================
    
    showLoading(text) {
        this.currentScreen = 'loading';
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="loading-screen">
                <div class="loader"></div>
                <div class="loading-text">${text || this.t('connecting')}</div>
            </div>
        `;
    }
    
    showMainMenu() {
        this.currentScreen = 'menu';
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="main-menu">
                <div class="header">
                    <div class="user-profile">
                        <img src="${this.user.photo_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><circle cx=\'20\' cy=\'20\' r=\'20\' fill=\'%23ccc\'/><text x=\'20\' y=\'25\' text-anchor=\'middle\' fill=\'%23333\' font-size=\'20\'>${this.user.first_name[0]}</text></svg>'}" alt="Profile">
                        <span>${this.user.first_name}</span>
                    </div>
                    <div class="language-selector">
                        <button class="lang-btn ${this.language === 'az' ? 'active' : ''}" data-lang="az">AZ</button>
                        <button class="lang-btn ${this.language === 'en' ? 'active' : ''}" data-lang="en">EN</button>
                    </div>
                </div>
                
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="quickMatchBtn">${this.t('quickMatch')}</button>
                    <button class="menu-btn secondary" id="createRoomBtn">${this.t('createRoom')}</button>
                    <button class="menu-btn locked" id="rankedBtn" disabled>
                        ${this.t('ranked')}
                        <span class="lock-icon">🔒</span>
                    </button>
                </div>
                
                <div class="room-code" id="roomCodeContainer" style="display: none;">
                    <p>${this.t('roomCode')}</p>
                    <div class="code-box" id="roomCode"></div>
                    <button class="copy-btn" id="copyRoomCode">${this.t('copy')}</button>
                </div>
            </div>
        `;
        
        this.attachMenuEvents();
    }
    
    attachMenuEvents() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.language = e.target.dataset.lang;
                document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.showMainMenu();
            });
        });
        
        document.getElementById('quickMatchBtn')?.addEventListener('click', () => {
            this.send({ type: 'match:find', data: {} });
            this.showLoading(this.t('waiting'));
        });
        
        document.getElementById('createRoomBtn')?.addEventListener('click', () => {
            this.send({ type: 'room:create', data: {} });
        });
        
        document.getElementById('copyRoomCode')?.addEventListener('click', () => {
            const code = document.getElementById('roomCode').textContent;
            navigator.clipboard?.writeText(code);
            alert('Kod kopyalandı!');
        });
    }
    
    showRoomCode() {
        document.getElementById('roomCodeContainer').style.display = 'block';
        document.getElementById('roomCode').textContent = this.roomId;
    }
    
    showGameScreen() {
        this.currentScreen = 'game';
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="game-app">
                <div class="game-header">
                    <div class="player-info opponent">
                        <img src="${this.opponentId?.photo || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><circle cx=\'20\' cy=\'20\' r=\'20\' fill=\'%23ccc\'/><text x=\'20\' y=\'25\' text-anchor=\'middle\' fill=\'%23333\' font-size=\'20\'>R</text></svg>'}" alt="Opponent">
                        <span>${this.opponentId?.name || 'Opponent'}</span>
                        <div class="timer-bar" id="opponentTimer">
                            <div class="timer-fill" style="width: 100%"></div>
                            <span class="timer-text">30</span>
                        </div>
                    </div>
                </div>
                
                <div class="game-board-container">
                    <div class="captured-pieces right" id="capturedOpponent"></div>
                    <div class="board" id="chessBoard"></div>
                    <div class="captured-pieces left" id="capturedPlayer"></div>
                </div>
                
                <div class="game-footer">
                    <div class="player-info current">
                        <img src="${this.user.photo_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'><circle cx=\'20\' cy=\'20\' r=\'20\' fill=\'%23ccc\'/><text x=\'20\' y=\'25\' text-anchor=\'middle\' fill=\'%23333\' font-size=\'20\'>${this.user.first_name[0]}</text></svg>'}" alt="Player">
                        <span>${this.user.first_name}</span>
                        <div class="timer-bar" id="playerTimer">
                            <div class="timer-fill" style="width: 100%"></div>
                            <span class="timer-text">30</span>
                        </div>
                    </div>
                </div>
                
                <div class="game-overlay" id="gameOverlay" style="display: none;">
                    <div class="winner-animation">
                        <div class="trophy">🏆</div>
                        <h2 id="winnerMessage"></h2>
                        <button class="menu-btn primary" id="backToMenu">${this.t('backToMenu')}</button>
                    </div>
                </div>
            </div>
        `;
        
        this.createBoard();
        this.attachGameEvents();
    }
    
    // ==================== OYUN MANTIĞI ====================
    
    createBoard() {
        const board = document.getElementById('chessBoard');
        board.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                const piece = this.gameState?.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece.startsWith('b') ? 'black' : 'white'}`;
                    pieceEl.draggable = true;
                    pieceEl.dataset.piece = piece;
                    
                    pieceEl.addEventListener('dragstart', (e) => this.handleDragStart(e, row, col));
                    pieceEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
                    
                    cell.appendChild(pieceEl);
                }
                
                cell.addEventListener('click', () => this.handleCellClick(row, col));
                cell.addEventListener('dragover', (e) => e.preventDefault());
                cell.addEventListener('drop', (e) => this.handleDrop(e, row, col));
                
                board.appendChild(cell);
            }
        }
        
        this.updateCapturedPieces();
    }
    
    handleDragStart(e, row, col) {
        const piece = this.gameState?.board[row][col];
        const isMyTurn = (this.gameState?.turn === 'b' && piece?.startsWith('b')) ||
                        (this.gameState?.turn === 'w' && piece?.startsWith('w'));
        
        if (!isMyTurn) {
            e.preventDefault();
            return;
        }
        
        this.selectedPiece = { row, col, piece };
        this.showValidMoves(row, col);
        
        e.dataTransfer.setData('text/plain', `${row},${col}`);
    }
    
    handleDragEnd(e) {
        this.clearHighlights();
    }
    
    handleDrop(e, toRow, toCol) {
        e.preventDefault();
        
        if (!this.selectedPiece) return;
        
        const fromRow = this.selectedPiece.row;
        const fromCol = this.selectedPiece.col;
        
        this.makeMove([fromRow, fromCol], [toRow, toCol]);
        this.clearHighlights();
        this.selectedPiece = null;
    }
    
    handleCellClick(row, col) {
        const piece = this.gameState?.board[row][col];
        
        if (piece) {
            const isMyTurn = (this.gameState?.turn === 'b' && piece?.startsWith('b')) ||
                            (this.gameState?.turn === 'w' && piece?.startsWith('w'));
            
            if (isMyTurn) {
                this.selectedPiece = { row, col, piece };
                this.showValidMoves(row, col);
            }
        } else if (this.selectedPiece) {
            this.makeMove([this.selectedPiece.row, this.selectedPiece.col], [row, col]);
            this.clearHighlights();
            this.selectedPiece = null;
        }
    }
    
    showValidMoves(row, col) {
        this.validMoves = this.calculateMoves(row, col);
        
        this.validMoves.forEach(move => {
            const cell = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            cell.classList.add('valid-move');
            if (move.capture) {
                cell.classList.add('capture-move');
            }
        });
        
        document.querySelector(`[data-row="${row}"][data-col="${col}"]`).classList.add('selected');
    }
    
    calculateMoves(row, col) {
        const moves = [];
        const piece = this.gameState.board[row][col];
        const isKing = piece.includes('K');
        
        const directions = isKing ? 
            [[-1,-1], [-1,1], [1,-1], [1,1]] : 
            (piece.startsWith('b') ? [[1,-1], [1,1]] : [[-1,-1], [-1,1]]);
        
        // Normal hareket
        directions.forEach(([dx, dy]) => {
            const newRow = row + dx;
            const newCol = col + dy;
            
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                if (!this.gameState.board[newRow][newCol]) {
                    moves.push({ row: newRow, col: newCol, capture: false });
                }
            }
        });
        
        // Yeme
        directions.forEach(([dx, dy]) => {
            const jumpRow = row + dx * 2;
            const jumpCol = col + dy * 2;
            const midRow = row + dx;
            const midCol = col + dy;
            
            if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
                const midPiece = this.gameState.board[midRow][midCol];
                const targetPiece = this.gameState.board[jumpRow][jumpCol];
                
                if (midPiece && !targetPiece) {
                    const isOpponent = (piece.startsWith('b') && midPiece.startsWith('w')) ||
                                      (piece.startsWith('w') && midPiece.startsWith('b'));
                    
                    if (isOpponent) {
                        moves.push({ 
                            row: jumpRow, 
                            col: jumpCol, 
                            capture: true,
                            capturedRow: midRow,
                            capturedCol: midCol
                        });
                    }
                }
            }
        });
        
        return moves;
    }
    
    makeMove(from, to) {
        const isValid = this.validMoves.some(m => m.row === to[0] && m.col === to[1]);
        if (!isValid) return;
        
        const move = {
            from: from,
            to: to,
            captured: null
        };
        
        const captureMove = this.validMoves.find(m => m.row === to[0] && m.col === to[1] && m.capture);
        if (captureMove) {
            move.captured = {
                row: captureMove.capturedRow,
                col: captureMove.capturedCol
            };
        }
        
        this.send({
            type: 'move:make',
            data: { roomId: this.roomId, move: move }
        });
        
        this.send({
            type: 'move:made',
            data: { roomId: this.roomId }
        });
    }
    
    clearHighlights() {
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected', 'valid-move', 'capture-move');
        });
    }
    
    updateBoard() {
        this.createBoard();
    }
    
    updateCapturedPieces() {
        const opponentCaptured = document.getElementById('capturedOpponent');
        const playerCaptured = document.getElementById('capturedPlayer');
        
        if (!opponentCaptured || !playerCaptured) return;
        
        opponentCaptured.innerHTML = '';
        playerCaptured.innerHTML = '';
        
        if (this.gameState?.captured) {
            this.gameState.captured.w?.forEach(() => {
                const piece = document.createElement('div');
                piece.className = 'captured-piece black';
                opponentCaptured.appendChild(piece);
            });
            
            this.gameState.captured.b?.forEach(() => {
                const piece = document.createElement('div');
                piece.className = 'captured-piece white';
                playerCaptured.appendChild(piece);
            });
        }
    }
    
    updateTimer(playerId, timeLeft) {
        const isMe = playerId === this.user.id;
        const timerBar = isMe ? 
            document.getElementById('playerTimer') : 
            document.getElementById('opponentTimer');
        
        if (!timerBar) return;
        
        const fill = timerBar.querySelector('.timer-fill');
        const text = timerBar.querySelector('.timer-text');
        
        const percent = (timeLeft / 30) * 100;
        fill.style.width = `${percent}%`;
        text.textContent = timeLeft;
    }
    
    showWinner(winnerId) {
        const overlay = document.getElementById('gameOverlay');
        const message = document.getElementById('winnerMessage');
        
        if (winnerId === this.user.id) {
            message.textContent = this.t('youWon');
        } else {
            message.textContent = this.t('youLost');
        }
        
        overlay.style.display = 'flex';
        
        document.getElementById('backToMenu').addEventListener('click', () => {
            this.showMainMenu();
        });
    }
    
    showMessage(text, duration) {
        const msg = document.createElement('div');
        msg.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 3000;
        `;
        msg.textContent = text;
        document.body.appendChild(msg);
        
        setTimeout(() => msg.remove(), duration);
    }
    
    attachGameEvents() {
        // Oyun içi eventler
    }
}

// ==================== BAŞLAT ====================
window.game = new ShashkiGame();
