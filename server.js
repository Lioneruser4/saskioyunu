const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== VERİTABANI (Geçici) ====================
let players = new Map(); // Tüm oyuncular
let rooms = new Map(); // Oyun odaları
let matchmakingQueue = []; // Eşleşme kuyruğu

// ==================== OYUNCU SINIFI ====================
class Player {
    constructor(ws, data) {
        this.id = uuidv4();
        this.ws = ws;
        this.username = data.username || 'Guest';
        this.photo = data.photo || null;
        this.platform = data.platform || 'web'; // 'telegram' veya 'web'
        this.roomId = null;
        this.gameMode = null;
        this.rating = 1000;
        this.gamesPlayed = 0;
        this.gamesWon = 0;
        this.status = 'online'; // online, inGame, searching
    }
}

// ==================== ODA SINIFI ====================
class Room {
    constructor(code, mode, difficulty = 'medium') {
        this.code = code;
        this.mode = mode; // 'online', 'private', 'bot'
        this.difficulty = difficulty; // 'easy', 'medium', 'hard'
        this.players = [];
        this.gameState = 'waiting'; // waiting, playing, finished
        this.gameData = null;
        this.createdAt = Date.now();
        this.maxPlayers = mode === 'bot' ? 1 : 2;
    }

    addPlayer(player) {
        if (this.players.length < this.maxPlayers) {
            this.players.push(player);
            player.roomId = this.code;
            player.status = 'inGame';
            
            if (this.players.length === this.maxPlayers) {
                this.gameState = 'playing';
                this.gameData = this.initGameData();
            }
            return true;
        }
        return false;
    }

    initGameData() {
        return {
            balls: this.createBalls(),
            currentPlayer: this.players[0].id,
            playerBalls: {},
            turn: 0,
            scores: {},
            gameOver: false,
            winner: null
        };
    }

    createBalls() {
        // Bilardo topları
        return [
            { id: 0, x: 400, y: 300, vx: 0, vy: 0, type: 'white', potted: false }, // Beyaz
            { id: 1, x: 600, y: 280, vx: 0, vy: 0, type: 'solid', number: 1, color: '#ffff00', potted: false },
            { id: 2, x: 620, y: 300, vx: 0, vy: 0, type: 'solid', number: 2, color: '#0000ff', potted: false },
            { id: 3, x: 580, y: 320, vx: 0, vy: 0, type: 'solid', number: 3, color: '#ff0000', potted: false },
            { id: 4, x: 600, y: 320, vx: 0, vy: 0, type: 'solid', number: 4, color: '#800080', potted: false },
            { id: 5, x: 620, y: 280, vx: 0, vy: 0, type: 'solid', number: 5, color: '#ffa500', potted: false },
            { id: 6, x: 580, y: 280, vx: 0, vy: 0, type: 'solid', number: 6, color: '#008000', potted: false },
            { id: 7, x: 640, y: 300, vx: 0, vy: 0, type: 'solid', number: 7, color: '#8b4513', potted: false },
            { id: 8, x: 560, y: 300, vx: 0, vy: 0, type: 'black', number: 8, color: '#000000', potted: false },
            // Çizgili toplar
            { id: 9, x: 600, y: 260, vx: 0, vy: 0, type: 'striped', number: 9, color: '#ffff00', potted: false },
            { id: 10, x: 620, y: 340, vx: 0, vy: 0, type: 'striped', number: 10, color: '#0000ff', potted: false },
            { id: 11, x: 580, y: 340, vx: 0, vy: 0, type: 'striped', number: 11, color: '#ff0000', potted: false },
            { id: 12, x: 640, y: 280, vx: 0, vy: 0, type: 'striped', number: 12, color: '#800080', potted: false },
            { id: 13, x: 560, y: 320, vx: 0, vy: 0, type: 'striped', number: 13, color: '#ffa500', potted: false },
            { id: 14, x: 640, y: 320, vx: 0, vy: 0, type: 'striped', number: 14, color: '#008000', potted: false },
            { id: 15, x: 560, y: 280, vx: 0, vy: 0, type: 'striped', number: 15, color: '#8b4513', potted: false }
        ];
    }
}

// ==================== WEB SOCKET BAĞLANTILARI ====================
wss.on('connection', (ws, req) => {
    console.log('Yeni bağlantı:', req.url);
    
    let player = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Gelen mesaj:', data.type);

            switch(data.type) {
                case 'REGISTER':
                    // Oyuncu kaydı
                    player = new Player(ws, data.data);
                    players.set(player.id, player);
                    
                    ws.send(JSON.stringify({
                        type: 'REGISTER_SUCCESS',
                        data: {
                            playerId: player.id,
                            username: player.username,
                            photo: player.photo,
                            platform: player.platform
                        }
                    }));
                    
                    // Lobi durumunu gönder
                    sendLobbyStatus(player);
                    break;

                case 'JOIN_MATCHMAKING':
                    // Eşleşme kuyruğuna ekle
                    if (player) {
                        player.status = 'searching';
                        player.gameMode = data.mode || '8ball';
                        matchmakingQueue.push(player.id);
                        
                        // Eşleşme kontrolü
                        checkMatchmaking();
                    }
                    break;

                case 'CREATE_PRIVATE_ROOM':
                    // Özel oda oluştur
                    if (player) {
                        const roomCode = generateRoomCode();
                        const room = new Room(roomCode, 'private', data.difficulty);
                        rooms.set(roomCode, room);
                        room.addPlayer(player);
                        
                        ws.send(JSON.stringify({
                            type: 'ROOM_CREATED',
                            data: {
                                roomCode: roomCode,
                                players: room.players.map(p => ({
                                    id: p.id,
                                    username: p.username,
                                    photo: p.photo
                                }))
                            }
                        }));
                    }
                    break;

                case 'JOIN_PRIVATE_ROOM':
                    // Özel odaya katıl
                    if (player) {
                        const roomCode = data.roomCode;
                        const room = rooms.get(roomCode);
                        
                        if (room && room.players.length < 2) {
                            room.addPlayer(player);
                            
                            // Odadaki tüm oyunculara bildir
                            broadcastToRoom(room, {
                                type: 'PLAYER_JOINED',
                                data: {
                                    players: room.players.map(p => ({
                                        id: p.id,
                                        username: p.username,
                                        photo: p.photo
                                    }))
                                }
                            });
                            
                            // Oyun başladıysa
                            if (room.gameState === 'playing') {
                                broadcastToRoom(room, {
                                    type: 'GAME_START',
                                    data: room.gameData
                                });
                            }
                        } else {
                            ws.send(JSON.stringify({
                                type: 'ROOM_ERROR',
                                data: { message: 'Oda bulunamadı veya dolu' }
                            }));
                        }
                    }
                    break;

                case 'JOIN_BOT_GAME':
                    // Bot ile oyna
                    if (player) {
                        const roomCode = 'BOT_' + generateRoomCode();
                        const room = new Room(roomCode, 'bot', data.difficulty);
                        rooms.set(roomCode, room);
                        room.addPlayer(player);
                        
                        // Bot oyuncu ekle
                        const botPlayer = new Player(null, {
                            username: 'Bot ' + (data.difficulty === 'easy' ? '🐣' : data.difficulty === 'hard' ? '👑' : '⚡'),
                            platform: 'bot'
                        });
                        room.addPlayer(botPlayer);
                        
                        ws.send(JSON.stringify({
                            type: 'GAME_START',
                            data: {
                                ...room.gameData,
                                isBotGame: true,
                                difficulty: data.difficulty
                            }
                        }));
                    }
                    break;

                case 'PLAYER_ACTION':
                    // Oyuncu hareketi (vuruş, top hareketi vb.)
                    if (player && player.roomId) {
                        const room = rooms.get(player.roomId);
                        if (room) {
                            // Fizik hesaplamaları ve oyun mantığı
                            const updatedGameData = processGameAction(room.gameData, data.action);
                            room.gameData = updatedGameData;
                            
                            // Tüm oyunculara gönder
                            broadcastToRoom(room, {
                                type: 'GAME_UPDATE',
                                data: updatedGameData
                            });
                            
                            // Oyun bittiyse
                            if (updatedGameData.gameOver) {
                                broadcastToRoom(room, {
                                    type: 'GAME_OVER',
                                    data: {
                                        winner: updatedGameData.winner,
                                        scores: updatedGameData.scores
                                    }
                                });
                                
                                // Skor güncelle
                                updatePlayerStats(room);
                            }
                        }
                    }
                    break;

                case 'LEAVE_ROOM':
                    // Odadan ayrıl
                    if (player && player.roomId) {
                        const room = rooms.get(player.roomId);
                        if (room) {
                            room.players = room.players.filter(p => p.id !== player.id);
                            
                            broadcastToRoom(room, {
                                type: 'PLAYER_LEFT',
                                data: { playerId: player.id }
                            });
                            
                            if (room.players.length === 0) {
                                rooms.delete(room.roomCode);
                            }
                        }
                        player.roomId = null;
                        player.status = 'online';
                    }
                    break;

                case 'PING':
                    ws.send(JSON.stringify({ type: 'PONG' }));
                    break;
            }
        } catch (error) {
            console.error('Mesaj işleme hatası:', error);
        }
    });

    ws.on('close', () => {
        console.log('Bağlantı kapandı');
        if (player) {
            // Kuyruktan çıkar
            matchmakingQueue = matchmakingQueue.filter(id => id !== player.id);
            
            // Odadan çıkar
            if (player.roomId) {
                const room = rooms.get(player.roomId);
                if (room) {
                    broadcastToRoom(room, {
                        type: 'PLAYER_DISCONNECTED',
                        data: { playerId: player.id }
                    });
                    
                    room.players = room.players.filter(p => p.id !== player.id);
                    if (room.players.length === 0) {
                        rooms.delete(room.roomCode);
                    }
                }
            }
            
            players.delete(player.id);
        }
    });
});

// ==================== EŞLEŞME SİSTEMİ ====================
function checkMatchmaking() {
    if (matchmakingQueue.length >= 2) {
        const player1Id = matchmakingQueue.shift();
        const player2Id = matchmakingQueue.shift();
        
        const player1 = players.get(player1Id);
        const player2 = players.get(player2Id);
        
        if (player1 && player2 && player1.ws && player2.ws) {
            // Oda oluştur
            const roomCode = generateRoomCode();
            const room = new Room(roomCode, 'online');
            
            room.addPlayer(player1);
            room.addPlayer(player2);
            
            rooms.set(roomCode, room);
            
            // Her iki oyuncuya da bildir
            [player1, player2].forEach(p => {
                p.ws.send(JSON.stringify({
                    type: 'MATCH_FOUND',
                    data: {
                        roomCode: roomCode,
                        opponent: {
                            id: p.id === player1.id ? player2.id : player1.id,
                            username: p.id === player1.id ? player2.username : player1.username,
                            photo: p.id === player1.id ? player2.photo : player1.photo,
                            rating: p.id === player1.id ? player2.rating : player1.rating
                        }
                    }
                }));
            });
            
            // Oyun başlat
            setTimeout(() => {
                broadcastToRoom(room, {
                    type: 'GAME_START',
                    data: room.gameData
                });
            }, 2000);
        }
    }
}

// ==================== OYUN FİZİĞİ ====================
function processGameAction(gameData, action) {
    // Top hareketleri ve fizik hesaplamaları
    const { ballId, power, angle, cueX, cueY } = action;
    
    // Beyaz topa vuruş
    if (ballId === 0) {
        const whiteBall = gameData.balls.find(b => b.id === 0);
        if (whiteBall) {
            whiteBall.vx = Math.cos(angle) * power * 15;
            whiteBall.vy = Math.sin(angle) * power * 15;
        }
    }
    
    // Fizik simülasyonu
    let anyMoving = true;
    let iterations = 0;
    
    while (anyMoving && iterations < 100) {
        anyMoving = false;
        
        gameData.balls.forEach(ball => {
            if (ball.potted) return;
            
            if (Math.abs(ball.vx) > 0.1 || Math.abs(ball.vy) > 0.1) {
                anyMoving = true;
                
                // Sürtünme
                ball.vx *= 0.98;
                ball.vy *= 0.98;
                
                // Pozisyon güncelle
                ball.x += ball.vx;
                ball.y += ball.vy;
                
                // Sınır kontrolü
                if (ball.x < 50 || ball.x > 750) ball.vx *= -0.8;
                if (ball.y < 50 || ball.y > 550) ball.vy *= -0.8;
            }
        });
        
        // Top çarpışmaları
        for (let i = 0; i < gameData.balls.length; i++) {
            for (let j = i + 1; j < gameData.balls.length; j++) {
                const ball1 = gameData.balls[i];
                const ball2 = gameData.balls[j];
                
                if (ball1.potted || ball2.potted) continue;
                
                const dx = ball2.x - ball1.x;
                const dy = ball2.y - ball1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 24) { // Top çapı
                    const angle = Math.atan2(dy, dx);
                    const force = (24 - dist) * 0.5;
                    
                    ball1.vx -= Math.cos(angle) * force;
                    ball1.vy -= Math.sin(angle) * force;
                    ball2.vx += Math.cos(angle) * force;
                    ball2.vy += Math.sin(angle) * force;
                }
            }
        }
        
        // Cep kontrolü
        const pockets = [
            [50, 50], [400, 50], [750, 50],
            [50, 550], [400, 550], [750, 550]
        ];
        
        gameData.balls.forEach(ball => {
            if (ball.potted) return;
            
            pockets.forEach(([px, py]) => {
                const dx = ball.x - px;
                const dy = ball.y - py;
                if (Math.sqrt(dx * dx + dy * dy) < 30) {
                    ball.potted = true;
                    
                    // Skor güncelle
                    if (ball.id === 0) {
                        // Beyaz top düşerse
                        gameData.currentPlayer = gameData.currentPlayer === gameData.players[0] ? 
                            gameData.players[1] : gameData.players[0];
                    }
                }
            });
        });
        
        iterations++;
    }
    
    // Sıra değişimi
    if (!anyMoving) {
        gameData.turn++;
        const currentPlayerIndex = gameData.players.indexOf(gameData.currentPlayer);
        const nextPlayerIndex = (currentPlayerIndex + 1) % gameData.players.length;
        gameData.currentPlayer = gameData.players[nextPlayerIndex];
    }
    
    // Oyun bitiş kontrolü
    const blackBall = gameData.balls.find(b => b.id === 8);
    if (blackBall.potted) {
        gameData.gameOver = true;
        gameData.winner = gameData.currentPlayer; // Son vuruşu yapan kazanır
    }
    
    return gameData;
}

// ==================== YARDIMCI FONKSİYONLAR ====================
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function broadcastToRoom(room, message) {
    room.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

function sendLobbyStatus(player) {
    const onlinePlayers = Array.from(players.values())
        .filter(p => p.status === 'online' || p.status === 'searching')
        .map(p => ({
            id: p.id,
            username: p.username,
            photo: p.photo,
            rating: p.rating,
            status: p.status
        }));
    
    const activeRooms = Array.from(rooms.values())
        .filter(r => r.mode === 'private' && r.gameState === 'waiting')
        .map(r => ({
            code: r.code,
            players: r.players.length,
            maxPlayers: r.maxPlayers
        }));
    
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify({
            type: 'LOBBY_UPDATE',
            data: {
                onlinePlayers,
                activeRooms,
                queuePosition: matchmakingQueue.indexOf(player.id) + 1,
                totalInQueue: matchmakingQueue.length
            }
        }));
    }
}

// ==================== HTTP ENDPOINTS ====================
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/api/players', (req, res) => {
    const playersList = Array.from(players.values()).map(p => ({
        id: p.id,
        username: p.username,
        photo: p.photo,
        rating: p.rating,
        gamesPlayed: p.gamesPlayed,
        gamesWon: p.gamesWon,
        status: p.status
    }));
    res.json(playersList);
});

app.get('/api/rooms', (req, res) => {
    const roomsList = Array.from(rooms.values()).map(r => ({
        code: r.code,
        mode: r.mode,
        players: r.players.length,
        maxPlayers: r.maxPlayers,
        status: r.gameState
    }));
    res.json(roomsList);
});

app.post('/api/telegram-auth', (req, res) => {
    const { username, photo } = req.body;
    // Telegram auth logic
    res.json({ success: true, message: 'Telegram ile giriş yapıldı' });
});

// ==================== SUNUCU BAŞLAT ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`WebSocket adresi: ws://0.0.0.0:${PORT}`);
});

// Periyodik lobby güncellemesi
setInterval(() => {
    players.forEach(player => {
        sendLobbyStatus(player);
    });
}, 5000);
