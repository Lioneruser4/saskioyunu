// ==================== ŞAŞKİ OYUNU - PROFESSIONAL ====================

class ShashkiGame {
    constructor() {
        // Oyun durumu
        this.board = [];
        this.currentTurn = 'white'; // white (üst) başlar
        this.selectedPiece = null;
        this.validMoves = [];
        this.mustCapturePieces = [];
        this.capturedWhite = [];
        this.capturedBlack = [];
        
        // AI ve modlar
        this.gameMode = 'ai'; // 'ai' veya 'friend'
        this.difficulty = 'normal'; // easy, normal, hard
        this.isAITurn = false;
        this.aiThinking = false;
        
        // Timer
        this.playerTime = 30;
        this.opponentTime = 30;
        this.timerInterval = null;
        this.isPlayerTurn = true;
        
        // Sesler
        this.soundEnabled = true;
        this.sounds = {
            move: null,
            capture: null,
            king: null,
            win: null
        };
        
        // UI
        this.currentScreen = 'menu';
        this.language = 'az';
        this.user = null;
        
        // Dil çevirileri
        this.translations = {
            az: {
                loading: 'ŞAŞKI',
                difficulty: '⚡ ZORLUK SEVİYESİ ⚡',
                easy: '🟢 EASY',
                normal: '🟠 NORMAL',
                hard: '🔴 HARD',
                playAI: '🤖 BOT İLE OYNA',
                playFriend: '👥 ARKADAŞ İLE',
                ranked: '🔒 DERECELİ (YAKINDA)',
                yourTurn: 'Sizin növbəniz',
                opponentTurn: 'Bot düşünür',
                youWon: 'TƏBRİKLƏR! QAZANDINIZ! 🏆',
                youLost: 'MƏĞLUB OLDUNUZ! 😢',
                mustCapture: '⚠️ Vurmaq MƏCBURİYƏTİ!',
                captureFirst: 'Vurmalı olduğunuz taşlar işıqlanır!',
                invalidMove: '❌ Keçərsiz hərəkət!',
                timeOut: '⏰ Vaxtınız bitdi!'
            },
            en: {
                loading: 'CHECKERS',
                difficulty: '⚡ DIFFICULTY ⚡',
                easy: '🟢 EASY',
                normal: '🟠 NORMAL',
                hard: '🔴 HARD',
                playAI: '🤖 PLAY VS AI',
                playFriend: '👥 PLAY VS FRIEND',
                ranked: '🔒 RANKED (COMING SOON)',
                yourTurn: 'Your turn',
                opponentTurn: 'AI thinking',
                youWon: 'CONGRATULATIONS! YOU WON! 🏆',
                youLost: 'YOU LOST! 😢',
                mustCapture: '⚠️ MUST CAPTURE!',
                captureFirst: 'Pieces that must capture are highlighted!',
                invalidMove: '❌ Invalid move!',
                timeOut: '⏰ Time out!'
            }
        };
        
        this.init();
    }
    
    t(key) {
        return this.translations[this.language][key] || key;
    }
    
    async init() {
        this.loadTelegramData();
        await this.initSounds();
        this.showLoading();
        setTimeout(() => {
            this.showMainMenu();
        }, 1500);
    }
    
    loadTelegramData() {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.expand();
            tg.enableClosingConfirmation();
            this.user = tg.initDataUnsafe?.user || {
                id: Date.now(),
                first_name: 'Player',
                username: 'player',
                photo_url: null
            };
        } else {
            this.user = {
                id: Date.now(),
                first_name: 'Player',
                username: 'player',
                photo_url: null
            };
        }
        
        document.getElementById('userName').textContent = this.user.first_name;
        document.getElementById('userAvatar').src = this.user.photo_url || this.getAvatarUrl(this.user.first_name);
        document.getElementById('gamePlayerName').textContent = this.user.first_name;
        document.getElementById('gamePlayerAvatar').src = this.user.photo_url || this.getAvatarUrl(this.user.first_name);
    }
    
    getAvatarUrl(name) {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%234ecdc4'/%3E%3Ctext x='50' y='67' text-anchor='middle' fill='white' font-size='45' font-weight='bold'%3E${name[0].toUpperCase()}%3C/text%3E%3C/svg%3E`;
    }
    
    async initSounds() {
        // Web Audio API ile basit sesler oluştur
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        this.sounds.move = () => this.playTone(523.25, 0.1); // C5
        this.sounds.capture = () => this.playTone(440, 0.15, 0.2); // A4
        this.sounds.king = () => this.playTone(659.25, 0.2); // E5
        this.sounds.win = () => this.playFanfare();
    }
    
    playTone(frequency, duration, volume = 0.3) {
        if (!this.soundEnabled) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, this.audioContext.currentTime + duration);
        
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }
    
    playFanfare() {
        if (!this.soundEnabled) return;
        this.playTone(523.25, 0.2);
        setTimeout(() => this.playTone(659.25, 0.2), 200);
        setTimeout(() => this.playTone(783.99, 0.4), 400);
    }
    
    showLoading() {
        this.currentScreen = 'loading';
        document.getElementById('loadingScreen').style.display = 'flex';
        document.getElementById('mainMenu').classList.remove('show');
        document.getElementById('gameScreen').classList.remove('active');
    }
    
    showMainMenu() {
        this.currentScreen = 'menu';
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('mainMenu').classList.add('show');
        document.getElementById('gameScreen').classList.remove('active');
        
        this.attachMenuEvents();
    }
    
    attachMenuEvents() {
        // Dil butonları
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.onclick = () => {
                this.language = btn.dataset.lang;
                document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateMenuTexts();
            };
        });
        
        // Zorluk seçimi
        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.onclick = () => {
                this.difficulty = btn.dataset.diff;
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
        
        // Bot ile oyna
        document.getElementById('playVsAI').onclick = () => {
            this.gameMode = 'ai';
            this.startNewGame();
        };
        
        // Arkadaş ile oyna
        document.getElementById('playVsFriend').onclick = () => {
            this.gameMode = 'friend';
            this.startNewGame();
        };
        
        // Ses butonu
        document.getElementById('soundBtn').onclick = () => {
            this.soundEnabled = !this.soundEnabled;
            document.getElementById('soundBtn').textContent = this.soundEnabled ? '🔊' : '🔇';
        };
    }
    
    updateMenuTexts() {
        document.getElementById('difficultyLabel').textContent = this.t('difficulty');
        document.querySelector('.diff-btn.easy').textContent = this.t('easy');
        document.querySelector('.diff-btn.normal').textContent = this.t('normal');
        document.querySelector('.diff-btn.hard').textContent = this.t('hard');
        document.getElementById('playVsAI').innerHTML = this.t('playAI');
        document.getElementById('playVsFriend').innerHTML = this.t('playFriend');
        document.getElementById('rankedBtn').innerHTML = this.t('ranked');
    }
    
    startNewGame() {
        this.initBoard();
        this.currentTurn = 'white';
        this.capturedWhite = [];
        this.capturedBlack = [];
        this.playerTime = 30;
        this.opponentTime = 30;
        this.isPlayerTurn = true;
        this.isAITurn = false;
        this.aiThinking = false;
        
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.showGameScreen();
        this.updateBoardUI();
        this.startTimer();
        
        // Zorunlu vuruş kontrolü
        this.checkMandatoryCaptures();
    }
    
    initBoard() {
        // 8x8 tahta - Şaşki başlangıç dizilimi
        this.board = Array(8).fill().map(() => Array(8).fill(null));
        
        // Siyah taşlar (üst, bot)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    this.board[row][col] = { color: 'black', isKing: false };
                }
            }
        }
        
        // Beyaz taşlar (alt, oyuncu)
        for (let row = 5; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 2 === 1) {
                    this.board[row][col] = { color: 'white', isKing: false };
                }
            }
        }
    }
    
    showGameScreen() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('mainMenu').classList.remove('show');
        document.getElementById('gameScreen').classList.add('active');
        
        document.getElementById('gameOpponentName').textContent = this.gameMode === 'ai' ? '🤖 Bot' : '👤 Arkadaş';
        document.getElementById('gameOpponentAvatar').src = this.gameMode === 'ai' ? 
            'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Ccircle cx=\'50\' cy=\'50\' r=\'50\' fill=\'%23666\'/%3E%3Ctext x=\'50\' y=\'67\' text-anchor=\'middle\' fill=\'white\' font-size=\'45\'%3E🤖%3C/text%3E%3C/svg%3E' :
            this.getAvatarUrl('Friend');
    }
    
    updateBoardUI() {
        const boardElement = document.getElementById('board');
        boardElement.innerHTML = '';
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                const piece = this.board[row][col];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece.color}`;
                    if (piece.isKing) pieceEl.classList.add('king');
                    pieceEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.selectPiece(row, col);
                    });
                    cell.appendChild(pieceEl);
                }
                
                cell.addEventListener('click', () => this.onCellClick(row, col));
                boardElement.appendChild(cell);
            }
        }
        
        this.updateCapturedDisplay();
        this.updateTurnIndicators();
    }
    
    selectPiece(row, col) {
        const piece = this.board[row][col];
        if (!piece) return;
        
        // Sıra kontrolü
        const isMyTurn = (this.currentTurn === 'white' && this.isPlayerTurn);
        if (!isMyTurn && this.gameMode === 'ai') {
            this.showNotification(this.t('opponentTurn'), 1500);
            return;
        }
        
        // Doğru renk mi?
        if (piece.color !== this.currentTurn) return;
        
        this.selectedPiece = { row, col };
        this.validMoves = this.getValidMoves(row, col);
        
        // Zorunlu vuruş varsa sadece vuruş yapabilen taşları göster
        if (this.mustCapturePieces.length > 0) {
            const isMustCapturePiece = this.mustCapturePieces.some(p => p.row === row && p.col === col);
            if (!isMustCapturePiece) {
                this.showNotification(this.t('mustCapture'), 1500);
                this.selectedPiece = null;
                this.validMoves = [];
                return;
            }
        }
        
        this.highlightValidMoves();
    }
    
    getValidMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) return [];
        
        const moves = [];
        const directions = piece.isKing ? 
            [[-1,-1], [-1,1], [1,-1], [1,1]] : 
            (piece.color === 'white' ? [[-1,-1], [-1,1]] : [[1,-1], [1,1]]);
        
        // Vuruş hareketleri
        for (const [dx, dy] of directions) {
            const jumpRow = row + dx * 2;
            const jumpCol = col + dy * 2;
            const midRow = row + dx;
            const midCol = col + dy;
            
            if (this.isValidPosition(jumpRow, jumpCol)) {
                const midPiece = this.board[midRow][midCol];
                const targetPiece = this.board[jumpRow][jumpCol];
                
                if (midPiece && !targetPiece && midPiece.color !== piece.color) {
                    moves.push({
                        toRow: jumpRow,
                        toCol: jumpCol,
                        captured: { row: midRow, col: midCol }
                    });
                }
            }
        }
        
        // Vuruş yoksa normal hareketler
        if (moves.length === 0) {
            for (const [dx, dy] of directions) {
                const newRow = row + dx;
                const newCol = col + dy;
                
                if (this.isValidPosition(newRow, newCol) && !this.board[newRow][newCol]) {
                    moves.push({
                        toRow: newRow,
                        toCol: newCol,
                        captured: null
                    });
                }
            }
        }
        
        return moves;
    }
    
    checkMandatoryCaptures() {
        const allMoves = [];
        const piecesWithCaptures = [];
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentTurn) {
                    const moves = this.getValidMoves(row, col);
                    const hasCapture = moves.some(m => m.captured);
                    allMoves.push(...moves);
                    if (hasCapture) {
                        piecesWithCaptures.push({ row, col, moves });
                    }
                }
            }
        }
        
        this.mustCapturePieces = piecesWithCaptures;
        
        // Zorunlu vuruş varsa vurgula
        if (this.mustCapturePieces.length > 0) {
            this.showNotification(this.t('captureFirst'), 2000);
            this.highlightMustCapturePieces();
        }
        
        return this.mustCapturePieces.length > 0;
    }
    
    highlightMustCapturePieces() {
        this.clearHighlights();
        this.mustCapturePieces.forEach(piece => {
            const cell = document.querySelector(`[data-row="${piece.row}"][data-col="${piece.col}"]`);
            if (cell) cell.classList.add('must-move');
        });
    }
    
    highlightValidMoves() {
        this.clearHighlights();
        
        if (this.selectedPiece) {
            const selectedCell = document.querySelector(`[data-row="${this.selectedPiece.row}"][data-col="${this.selectedPiece.col}"]`);
            if (selectedCell) selectedCell.classList.add('selected');
        }
        
        this.validMoves.forEach(move => {
            const cell = document.querySelector(`[data-row="${move.toRow}"][data-col="${move.toCol}"]`);
            if (cell) {
                cell.classList.add('valid-move');
                if (move.captured) cell.classList.add('capture-move');
            }
        });
    }
    
    clearHighlights() {
        document.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected', 'valid-move', 'capture-move', 'must-move');
        });
    }
    
    onCellClick(row, col) {
        if (!this.selectedPiece) return;
        
        const isValid = this.validMoves.some(m => m.toRow === row && m.toCol === col);
        if (isValid) {
            const move = this.validMoves.find(m => m.toRow === row && m.toCol === col);
            this.makeMove(this.selectedPiece.row, this.selectedPiece.col, move.toRow, move.toCol, move.captured);
        } else {
            this.showNotification(this.t('invalidMove'), 1000);
        }
        
        this.selectedPiece = null;
        this.validMoves = [];
        this.clearHighlights();
    }
    
    makeMove(fromRow, fromCol, toRow, toCol, captured) {
        const piece = this.board[fromRow][fromCol];
        if (!piece) return false;
        
        // Taşı taşı
        this.board[toRow][toCol] = { ...piece };
        this.board[fromRow][fromCol] = null;
        
        // Vuruş varsa
        if (captured) {
            const capturedPiece = this.board[captured.row][captured.col];
            if (capturedPiece) {
                if (capturedPiece.color === 'white') {
                    this.capturedWhite.push(capturedPiece);
                } else {
                    this.capturedBlack.push(capturedPiece);
                }
                this.board[captured.row][captured.col] = null;
                this.playSound('capture');
                
                // Animasyon için
                this.animateCapture(captured.row, captured.col);
            }
            
            // Zincirleme vuruş kontrolü
            const additionalMoves = this.getValidMoves(toRow, toCol);
            const hasMoreCaptures = additionalMoves.some(m => m.captured);
            
            if (hasMoreCaptures) {
                this.selectedPiece = { row: toRow, col: toCol };
                this.validMoves = additionalMoves;
                this.highlightValidMoves();
                return true;
            }
        } else {
            this.playSound('move');
        }
        
        // Taş vezir oluyor mu?
        if ((piece.color === 'white' && toRow === 0) || (piece.color === 'black' && toRow === 7)) {
            this.board[toRow][toCol].isKing = true;
            this.playSound('king');
            this.showNotification('👑 VEZİR OLDU! 👑', 1500);
        }
        
        this.updateBoardUI();
        
        // Sırayı değiştir
        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
        this.isPlayerTurn = !this.isPlayerTurn;
        
        // Kazanma kontrolü
        if (this.checkWinner()) return true;
        
        // Zorunlu vuruş kontrolü
        const hasMandatory = this.checkMandatoryCaptures();
        
        // AI sırası
        if (this.gameMode === 'ai' && !this.isPlayerTurn && !hasMandatory) {
            setTimeout(() => this.aiMove(), 500);
        }
        
        return true;
    }
    
    animateCapture(row, col) {
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.style.transition = 'all 0.2s';
            cell.style.transform = 'scale(0.5)';
            cell.style.opacity = '0';
            setTimeout(() => {
                cell.style.transform = '';
                cell.style.opacity = '';
            }, 200);
        }
    }
    
    async aiMove() {
        if (this.aiThinking || this.isPlayerTurn || this.checkWinner()) return;
        
        this.aiThinking = true;
        this.showNotification('🤖 Bot düşünüyor...', 800);
        
        await this.delay(this.getAIDelay());
        
        const allMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentTurn) {
                    const moves = this.getValidMoves(row, col);
                    moves.forEach(move => {
                        allMoves.push({
                            fromRow: row,
                            fromCol: col,
                            ...move
                        });
                    });
                }
            }
        }
        
        if (allMoves.length === 0) {
            this.endGame('white');
            this.aiThinking = false;
            return;
        }
        
        // Zorunlu vuruş kontrolü
        const captureMoves = allMoves.filter(m => m.captured);
        let selectedMove;
        
        if (captureMoves.length > 0) {
            // Zorunlu vuruş - en çok taş yiyen hamleyi seç
            selectedMove = this.selectBestCaptureMove(captureMoves);
        } else {
            // Zorluk seviyesine göre hamle seç
            selectedMove = this.selectMoveByDifficulty(allMoves);
        }
        
        this.makeMove(
            selectedMove.fromRow, 
            selectedMove.fromCol, 
            selectedMove.toRow, 
            selectedMove.toCol, 
            selectedMove.captured
        );
        
        this.aiThinking = false;
    }
    
    selectBestCaptureMove(moves) {
        // En çok taş yiyen hamleyi bul (zincirleme düşünülmeli)
        return moves[Math.floor(Math.random() * moves.length)];
    }
    
    selectMoveByDifficulty(moves) {
        if (this.difficulty === 'easy') {
            // Rastgele hamle
            return moves[Math.floor(Math.random() * moves.length)];
        } else if (this.difficulty === 'normal') {
            // Biraz akıllı - kenarlara yakın hamleleri tercih et
            const smartMoves = moves.filter(m => {
                return m.toCol === 0 || m.toCol === 7 || m.toRow === 0 || m.toRow === 7;
            });
            if (smartMoves.length > 0) {
                return smartMoves[Math.floor(Math.random() * smartMoves.length)];
            }
            return moves[Math.floor(Math.random() * moves.length)];
        } else {
            // Hard - en iyi hamleyi bul (merkeze doğru ilerle)
            const centerMoves = moves.filter(m => m.toCol >= 2 && m.toCol <= 5 && m.toRow >= 2 && m.toRow <= 5);
            if (centerMoves.length > 0) {
                return centerMoves[Math.floor(Math.random() * centerMoves.length)];
            }
            return moves[Math.floor(Math.random() * moves.length)];
        }
    }
    
    getAIDelay() {
        switch(this.difficulty) {
            case 'easy': return 300;
            case 'normal': return 500;
            case 'hard': return 700;
            default: return 500;
        }
    }
    
    checkWinner() {
        let whiteCount = 0;
        let blackCount = 0;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece) {
                    if (piece.color === 'white') whiteCount++;
                    else blackCount++;
                }
            }
        }
        
        if (whiteCount === 0) {
            this.endGame('black');
            return true;
        }
        if (blackCount === 0) {
            this.endGame('white');
            return true;
        }
        
        // Hamle kontrolü
        let hasMoves = false;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === this.currentTurn) {
                    if (this.getValidMoves(row, col).length > 0) {
                        hasMoves = true;
                        break;
                    }
                }
            }
        }
        
        if (!hasMoves) {
            this.endGame(this.currentTurn === 'white' ? 'black' : 'white');
            return true;
        }
        
        return false;
    }
    
    endGame(winner) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        const isPlayerWin = (winner === 'white' && this.isPlayerTurn === false) || 
                           (winner === 'black' && this.isPlayerTurn === true);
        
        this.playSound('win');
        this.showWinnerAnimation(isPlayerWin);
    }
    
    showWinnerAnimation(isPlayerWin) {
        const overlay = document.createElement('div');
        overlay.className = 'winner-overlay';
        overlay.innerHTML = `
            <div class="winner-content">
                <div class="trophy-icon">${isPlayerWin ? '🏆🎉🏆' : '😢💔😢'}</div>
                <div class="winner-text">${isPlayerWin ? this.t('youWon') : this.t('youLost')}</div>
                <button class="menu-btn primary" id="playAgainBtn">🔄 TEKRAR OYNA</button>
                <button class="menu-btn secondary" id="menuBtn" style="margin-top: 10px;">🏠 MENÜYE DÖN</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        document.getElementById('playAgainBtn').onclick = () => {
            overlay.remove();
            this.startNewGame();
        };
        
        document.getElementById('menuBtn').onclick = () => {
            overlay.remove();
            this.showMainMenu();
        };
    }
    
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            if (this.gameMode === 'ai') {
                if (this.isPlayerTurn) {
                    this.playerTime--;
                    document.getElementById('playerTimer').textContent = this.playerTime;
                    
                    if (this.playerTime <= 0) {
                        clearInterval(this.timerInterval);
                        this.showNotification(this.t('timeOut'), 2000);
                        this.endGame('black');
                    }
                } else {
                    this.opponentTime--;
                    document.getElementById('opponentTimer').textContent = this.opponentTime;
                    
                    if (this.opponentTime <= 0 && !this.aiThinking) {
                        clearInterval(this.timerInterval);
                        this.endGame('white');
                    }
                }
            }
        }, 1000);
    }
    
    updateTurnIndicators() {
        const playerIndicator = document.getElementById('playerTurnIndicator');
        const opponentIndicator = document.getElementById('opponentTurnIndicator');
        
        if (this.isPlayerTurn) {
            playerIndicator.innerHTML = '● Sizin növbəniz';
            playerIndicator.classList.add('active');
            opponentIndicator.innerHTML = '○';
            opponentIndicator.classList.remove('active');
        } else {
            playerIndicator.innerHTML = '○';
            playerIndicator.classList.remove('active');
            opponentIndicator.innerHTML = '● Bot düşünür';
            opponentIndicator.classList.add('active');
        }
    }
    
    updateCapturedDisplay() {
        const whiteCapturedDiv = document.getElementById('capturedWhite');
        const blackCapturedDiv = document.getElementById('capturedBlack');
        
        whiteCapturedDiv.innerHTML = this.capturedWhite.map(() => 
            '<div class="captured-piece-mini white" style="background: radial-gradient(circle at 35% 35%, #fff, #ddd);"></div>'
        ).join('');
        
        blackCapturedDiv.innerHTML = this.capturedBlack.map(() => 
            '<div class="captured-piece-mini black" style="background: radial-gradient(circle at 35% 35%, #444, #111);"></div>'
        ).join('');
    }
    
    showNotification(message, duration) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s reverse';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
    
    playSound(type) {
        if (this.sounds[type]) this.sounds[type]();
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
}

// Oyunu başlat
window.addEventListener('load', () => {
    window.game = new ShashkiGame();
});
