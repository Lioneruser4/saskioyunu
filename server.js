// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Game state
const players = new Map();
const rooms = new Map();
const waitingPlayers = [];

class Player {
    constructor(id, telegramId, name) {
        this.id = id;
        this.telegramId = telegramId;
        this.name = name;
        this.position = { x: 0, y: 2, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.roomId = null;
        this.hasKey = false;
        this.isChaser = false;
        this.lastUpdate = Date.now();
    }
}

class Room {
    constructor(id, creatorId) {
        this.id = id;
        this.creatorId = creatorId;
        this.players = [];
        this.keys = this.generateKeys();
        this.chaserType = null;
        this.chaserId = null;
        this.status = 'waiting';
        this.keyPosition = this.generateRandomPosition();
        this.exitPosition = this.generateRandomPosition();
        this.createdAt = Date.now();
    }
    
    generateKeys() {
        return [{
            id: Math.random().toString(36).substr(2, 9),
            position: this.generateRandomPosition()
        }];
    }
    
    generateRandomPosition() {
        return {
            x: (Math.random() - 0.5) * 15,
            y: 1,
            z: (Math.random() - 0.5) * 15
        };
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);
    
    socket.on('player-join', (data) => {
        const player = new Player(socket.id, data.telegramId, data.name);
        players.set(socket.id, player);
        
        socket.emit('game-state', {
            players: Array.from(players.values()),
            rooms: Array.from(rooms.values())
        });
        
        // Check if player was in a room before disconnect
        const lastRoom = Array.from(rooms.values()).find(r => 
            r.players.includes(socket.id)
        );
        
        if (lastRoom) {
            player.roomId = lastRoom.id;
            socket.join(lastRoom.id);
            io.to(lastRoom.id).emit('player-rejoined', player);
        }
        
        io.emit('player-count', players.size);
    });
    
    socket.on('find-game', () => {
        const player = players.get(socket.id);
        if (!player) return;
        
        // Check for available rooms
        const availableRoom = Array.from(rooms.values()).find(r => 
            r.status === 'waiting' && r.players.length < 4
        );
        
        if (availableRoom) {
            joinRoom(socket, player, availableRoom.id);
        } else {
            waitingPlayers.push(socket.id);
        }
    });
    
    socket.on('create-room', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const roomId = Math.random().toString(36).substr(2, 9);
        const room = new Room(roomId, socket.id);
        room.chaserType = data.chaserType;
        
        rooms.set(roomId, room);
        player.roomId = roomId;
        room.players.push(socket.id);
        
        socket.join(roomId);
        socket.emit('room-created', { id: roomId, ...room });
        
        io.emit('room-list-update', Array.from(rooms.values()));
    });
    
    socket.on('join-room', (roomId) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        joinRoom(socket, player, roomId);
    });
    
    socket.on('rejoin-room', (data) => {
        const player = players.get(data.playerId);
        const room = rooms.get(data.roomId);
        
        if (player && room) {
            player.roomId = room.id;
            if (!room.players.includes(data.playerId)) {
                room.players.push(data.playerId);
            }
            
            socket.join(room.id);
            socket.emit('room-joined', room);
            
            // Restore player state
            const lastState = room.playerStates?.[data.playerId];
            if (lastState) {
                player.position = lastState.position;
                player.hasKey = lastState.hasKey;
            }
            
            io.to(room.id).emit('player-joined', player);
        }
    });
    
    socket.on('player-move', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.roomId) return;
        
        player.position = data.position;
        player.rotation = data.rotation;
        player.lastUpdate = Date.now();
        
        socket.to(player.roomId).emit('player-moved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation
        });
        
        // Save player state for reconnection
        const room = rooms.get(player.roomId);
        if (room) {
            if (!room.playerStates) room.playerStates = {};
            room.playerStates[socket.id] = {
                position: data.position,
                hasKey: player.hasKey
            };
        }
    });
    
    socket.on('collect-key', (data) => {
        const player = players.get(socket.id);
        const room = rooms.get(data.roomId);
        
        if (player && room) {
            player.hasKey = true;
            room.keys = room.keys.filter(k => k.id !== data.keyId);
            
            io.to(room.id).emit('key-collected', {
                playerId: socket.id,
                keyId: data.keyId
            });
            
            // Check win condition
            checkWinCondition(room, player);
        }
    });
    
    socket.on('select-chaser', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            room.chaserId = data.chaserId;
            const chaser = players.get(data.chaserId);
            if (chaser) {
                chaser.isChaser = true;
            }
            
            io.to(room.id).emit('chaser-selected', {
                chaserId: data.chaserId,
                type: room.chaserType
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Bağlantı koptu:', socket.id);
        
        const player = players.get(socket.id);
        if (player && player.roomId) {
            const room = rooms.get(player.roomId);
            if (room) {
                // Save player state for reconnection
                if (!room.playerStates) room.playerStates = {};
                room.playerStates[socket.id] = {
                    position: player.position,
                    hasKey: player.hasKey
                };
                
                io.to(room.id).emit('player-disconnected', socket.id);
            }
        }
        
        players.delete(socket.id);
        io.emit('player-count', players.size);
    });
});

function joinRoom(socket, player, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        socket.emit('error', 'Oda bulunamadı');
        return;
    }
    
    if (room.players.length >= 4) {
        socket.emit('error', 'Oda dolu');
        return;
    }
    
    player.roomId = roomId;
    room.players.push(socket.id);
    
    socket.join(roomId);
    socket.emit('room-joined', room);
    
    io.to(roomId).emit('player-joined', player);
    
    // Start game if room is full or creator starts
    if (room.players.length === 4 || room.players.length >= 2) {
        startGame(room);
    }
}

function startGame(room) {
    if (room.status === 'playing') return;
    
    room.status = 'playing';
    
    // Select chaser based on type
    if (room.chaserType === 'random') {
        const randomIndex = Math.floor(Math.random() * room.players.length);
        room.chaserId = room.players[randomIndex];
        
        const chaser = players.get(room.chaserId);
        if (chaser) {
            chaser.isChaser = true;
        }
    }
    
    io.to(room.id).emit('game-start', {
        chaserId: room.chaserId,
        keyPosition: room.keyPosition,
        exitPosition: room.exitPosition
    });
    
    // AI chaser logic
    if (room.chaserType === 'ai') {
        startAIChaser(room);
    }
}

function startAIChaser(room) {
    const aiInterval = setInterval(() => {
        const roomData = rooms.get(room.id);
        if (!roomData || roomData.status !== 'playing') {
            clearInterval(aiInterval);
            return;
        }
        
        // Simple AI: find closest player
        let closestPlayer = null;
        let minDistance = Infinity;
        
        roomData.players.forEach(playerId => {
            if (playerId === roomData.chaserId) return;
            
            const player = players.get(playerId);
            if (player && player.roomId === room.id) {
                const distance = Math.sqrt(
                    Math.pow(player.position.x - roomData.keyPosition.x, 2) +
                    Math.pow(player.position.z - roomData.keyPosition.z, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPlayer = player;
                }
            }
        });
        
        if (closestPlayer && minDistance < 2) {
            // Catch player
            io.to(room.id).emit('player-caught', {
                playerId: closestPlayer.id,
                chaserId: 'ai'
            });
        }
    }, 1000);
}

function checkWinCondition(room, player) {
    if (player.hasKey) {
        const distance = Math.sqrt(
            Math.pow(player.position.x - room.exitPosition.x, 2) +
            Math.pow(player.position.z - room.exitPosition.z, 2)
        );
        
        if (distance < 2) {
            io.to(room.id).emit('game-won', {
                playerId: player.id
            });
            
            room.status = 'ended';
        }
    }
}

// Cleanup old rooms
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, id) => {
        if (now - room.createdAt > 3600000) { // 1 hour
            rooms.delete(id);
        }
    });
}, 60000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        players: players.size,
        rooms: rooms.size,
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.send('Backrooms Server Running');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
