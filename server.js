const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Oyun odaları
const rooms = new Map();
const players = new Map();

// Oyun durumları
const gameStates = new Map();

// Oda sınıfı
class Room {
    constructor(id, hostId, duration) {
        this.id = id;
        this.hostId = hostId;
        this.duration = duration; // dakika
        this.players = [];
        this.blueTeam = [];
        this.redTeam = [];
        this.gameState = null;
        this.startTime = null;
        this.isPlaying = false;
        this.scores = { blue: 0, red: 0 };
    }
    
    addPlayer(playerId, username, photoUrl) {
        const player = {
            id: playerId,
            socketId: null,
            username,
            photoUrl,
            team: null,
            position: null,
            score: 0,
            isReady: false
        };
        
        // Takım dengeli dağıtım
        if (this.blueTeam.length <= this.redTeam.length) {
            player.team = 'blue';
            this.blueTeam.push(player);
        } else {
            player.team = 'red';
            this.redTeam.push(player);
        }
        
        this.players.push(player);
        return player;
    }
    
    switchTeam(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return false;
        
        // Takım değiştir
        if (player.team === 'blue') {
            this.blueTeam = this.blueTeam.filter(p => p.id !== playerId);
            player.team = 'red';
            this.redTeam.push(player);
        } else {
            this.redTeam = this.redTeam.filter(p => p.id !== playerId);
            player.team = 'blue';
            this.blueTeam.push(player);
        }
        
        return true;
    }
    
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.blueTeam = this.blueTeam.filter(p => p.id !== playerId);
        this.redTeam = this.redTeam.filter(p => p.id !== playerId);
        
        // Oda boşsa sil
        if (this.players.length === 0) {
            rooms.delete(this.id);
            gameStates.delete(this.id);
        }
    }
    
    startGame() {
        this.isPlaying = true;
        this.startTime = Date.now();
        
        // Başlangıç pozisyonları
        const positions = {
            blue: [
                { x: -30, y: 1, z: 0 },
                { x: -25, y: 1, z: -10 },
                { x: -25, y: 1, z: 10 }
            ],
            red: [
                { x: 30, y: 1, z: 0 },
                { x: 25, y: 1, z: -10 },
                { x: 25, y: 1, z: 10 }
            ]
        };
        
        // Oyunculara pozisyon ata
        this.blueTeam.forEach((player, index) => {
            player.position = positions.blue[index % positions.blue.length];
        });
        
        this.redTeam.forEach((player, index) => {
            player.position = positions.red[index % positions.red.length];
        });
        
        // Oyun durumu oluştur
        this.gameState = {
            ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 },
            players: [],
            scores: { blue: 0, red: 0 },
            timeLeft: this.duration * 60, // saniye
            isActive: true
        };
        
        return this.gameState;
    }
    
    updateGameState(state) {
        this.gameState = state;
        this.scores = state.scores;
    }
    
    getTimeLeft() {
        if (!this.startTime) return this.duration * 60;
        const elapsed = (Date.now() - this.startTime) / 1000;
        return Math.max(0, this.duration * 60 - elapsed);
    }
}

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);
    
    socket.on('join', async (data) => {
        const { userId, username, photoUrl, roomId } = data;
        
        // Odaya katıl veya yeni oda oluştur
        let room = rooms.get(roomId);
        if (!roomId || !room) {
            // Yeni oda oluştur
            const newRoomId = Math.random().toString(36).substr(2, 9);
            room = new Room(newRoomId, userId, 10); // Varsayılan 10 dakika
            rooms.set(newRoomId, room);
        }
        
        // Oyuncuyu ekle
        const player = room.addPlayer(userId, username, photoUrl);
        player.socketId = socket.id;
        players.set(socket.id, { userId, roomId: room.id });
        
        socket.join(room.id);
        
        // Oyuncu bilgilerini gönder
        socket.emit('joined', {
            roomId: room.id,
            player: player,
            room: {
                players: room.players,
                blueTeam: room.blueTeam,
                redTeam: room.redTeam,
                duration: room.duration
            }
        });
        
        // Diğer oyunculara bildir
        socket.to(room.id).emit('playerJoined', {
            player: player,
            room: {
                players: room.players,
                blueTeam: room.blueTeam,
                redTeam: room.redTeam
            }
        });
    });
    
    socket.on('switchTeam', (data) => {
        const { userId, roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && !room.isPlaying) {
            const success = room.switchTeam(userId);
            if (success) {
                io.to(room.id).emit('teamUpdated', {
                    blueTeam: room.blueTeam,
                    redTeam: room.redTeam
                });
            }
        }
    });
    
    socket.on('setDuration', (data) => {
        const { roomId, duration } = data;
        const room = rooms.get(roomId);
        
        if (room && room.hostId === players.get(socket.id)?.userId) {
            room.duration = duration;
            io.to(room.id).emit('durationUpdated', duration);
        }
    });
    
    socket.on('startGame', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && room.hostId === players.get(socket.id)?.userId) {
            const gameState = room.startGame();
            gameStates.set(roomId, gameState);
            
            io.to(room.id).emit('gameStarted', {
                gameState: gameState,
                players: room.players
            });
        }
    });
    
    socket.on('playerMove', (data) => {
        const { roomId, userId, position, rotation } = data;
        const room = rooms.get(roomId);
        
        if (room && room.isPlaying) {
            // Oyun durumunu güncelle
            const gameState = gameStates.get(roomId);
            if (gameState) {
                // Oyuncu hareketini diğerlerine yayınla
                socket.to(room.id).emit('playerMoved', {
                    userId,
                    position,
                    rotation
                });
            }
        }
    });
    
    socket.on('ballKick', (data) => {
        const { roomId, force, direction } = data;
        const room = rooms.get(roomId);
        
        if (room && room.isPlaying) {
            const gameState = gameStates.get(roomId);
            if (gameState) {
                // Top hareketini hesapla
                gameState.ball.vx = direction.x * force;
                gameState.ball.vy = direction.y * force;
                gameState.ball.vz = direction.z * force;
                
                io.to(room.id).emit('ballMoved', {
                    position: gameState.ball,
                    velocity: { x: gameState.ball.vx, y: gameState.ball.vy, z: gameState.ball.vz }
                });
            }
        }
    });
    
    socket.on('goal', (data) => {
        const { roomId, team } = data;
        const room = rooms.get(roomId);
        
        if (room && room.isPlaying) {
            room.scores[team]++;
            
            // Oyun durumunu güncelle
            const gameState = gameStates.get(roomId);
            if (gameState) {
                gameState.scores[team]++;
                gameState.ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };
                
                io.to(room.id).emit('goalScored', {
                    team,
                    scores: room.scores,
                    ballPosition: gameState.ball
                });
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Bağlantı kesildi:', socket.id);
        
        const playerData = players.get(socket.id);
        if (playerData) {
            const { userId, roomId } = playerData;
            const room = rooms.get(roomId);
            
            if (room) {
                room.removePlayer(userId);
                
                // Diğer oyunculara bildir
                socket.to(room.id).emit('playerLeft', {
                    userId,
                    room: {
                        players: room.players,
                        blueTeam: room.blueTeam,
                        redTeam: room.redTeam
                    }
                });
                
                players.delete(socket.id);
            }
        }
    });
});

// Oyun durumu güncelleme döngüsü
setInterval(() => {
    rooms.forEach((room, roomId) => {
        if (room.isPlaying) {
            const gameState = gameStates.get(roomId);
            if (gameState) {
                // Fizik güncellemeleri
                // Top hareketi
                gameState.ball.x += gameState.ball.vx;
                gameState.ball.y += gameState.ball.vy;
                gameState.ball.z += gameState.ball.vz;
                
                // Yerçekimi
                gameState.ball.vy -= 0.01;
                
                // Zemin çarpışması
                if (gameState.ball.y < 0.5) {
                    gameState.ball.y = 0.5;
                    gameState.ball.vy *= -0.8; // Sönümleme
                }
                
                // Alan sınırları
                const fieldSize = 40;
                if (Math.abs(gameState.ball.x) > fieldSize || Math.abs(gameState.ball.z) > fieldSize) {
                    // Topu sıfırla
                    gameState.ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };
                }
                
                // Zaman güncelleme
                gameState.timeLeft = room.getTimeLeft();
                
                // Oyun süresi doldu mu?
                if (gameState.timeLeft <= 0 && gameState.isActive) {
                    gameState.isActive = false;
                    io.to(room.id).emit('gameEnded', {
                        scores: room.scores,
                        players: room.players
                    });
                    room.isPlaying = false;
                }
                
                // Durumu kaydet
                gameStates.set(roomId, gameState);
                
                // Oyunculara gönder
                io.to(room.id).emit('gameUpdate', gameState);
            }
        }
    });
}, 1000 / 60); // 60 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});
