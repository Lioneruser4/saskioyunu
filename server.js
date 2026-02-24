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

const PORT = process.env.PORT || 3000;

// Game state
let rooms = new Map();
let players = new Map();

// Room class
class Room {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.players = new Map();
        this.maxPlayers = 20;
        this.blueTeam = [];
        this.redTeam = [];
    }

    addPlayer(player) {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }

        // Auto-balance teams
        const team = this.blueTeam.length <= this.redTeam.length ? 'blue' : 'red';
        player.team = team;
        
        if (team === 'blue') {
            this.blueTeam.push(player.id);
        } else {
            this.redTeam.push(player.id);
        }

        this.players.set(player.id, player);
        return true;
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.blueTeam = this.blueTeam.filter(id => id !== playerId);
            this.redTeam = this.redTeam.filter(id => id !== playerId);
            this.players.delete(playerId);
        }
    }

    getGameState() {
        return {
            id: this.id,
            name: this.name,
            players: Array.from(this.players.values()),
            blueTeam: this.blueTeam.length,
            redTeam: this.redTeam.length
        };
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Oyuncu bağlandı: ${socket.id}`);

    // Find game
    socket.on('findGame', (data) => {
        let availableRoom = null;
        
        // Find available room
        for (let [roomId, room] of rooms) {
            if (room.players.size < room.maxPlayers) {
                availableRoom = room;
                break;
            }
        }

        // Create new room if none available
        if (!availableRoom) {
            const roomId = 'room_' + Date.now();
            availableRoom = new Room(roomId, `Oda ${rooms.size + 1}`);
            rooms.set(roomId, availableRoom);
        }

        // Add player to room
        const player = {
            id: data.player.id,
            name: data.player.name,
            position: {
                x: (Math.random() - 0.5) * 20,
                y: 0,
                z: (Math.random() - 0.5) * 20
            },
            rotation: { x: 0, y: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            health: 100,
            ammo: 30,
            isDead: false,
            team: null
        };

        if (availableRoom.addPlayer(player)) {
            socket.join(availableRoom.id);
            socket.currentRoom = availableRoom.id;
            players.set(socket.id, player);

            socket.emit('roomJoined', {
                roomId: availableRoom.id,
                team: player.team
            });

            // Notify other players
            socket.to(availableRoom.id).emit('playerJoined', player);
            socket.emit('gameState', availableRoom.getGameState());
        }
    });

    // Create room
    socket.on('createRoom', (data) => {
        const roomId = 'room_' + Date.now();
        const room = new Room(roomId, data.name);
        rooms.set(roomId, room);

        const player = {
            id: data.player.id,
            name: data.player.name,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            health: 100,
            ammo: 30,
            isDead: false,
            team: 'blue'
        };

        room.addPlayer(player);
        socket.join(roomId);
        socket.currentRoom = roomId;
        players.set(socket.id, player);

        socket.emit('roomJoined', {
            roomId: roomId,
            team: player.team
        });

        socket.emit('gameState', room.getGameState());
    });

    // Join specific room
    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (!room || room.players.size >= room.maxPlayers) {
            socket.emit('error', 'Oda dolu veya bulunamadı');
            return;
        }

        const player = {
            id: data.player.id,
            name: data.player.name,
            position: {
                x: (Math.random() - 0.5) * 20,
                y: 0,
                z: (Math.random() - 0.5) * 20
            },
            rotation: { x: 0, y: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            health: 100,
            ammo: 30,
            isDead: false,
            team: null
        };

        if (room.addPlayer(player)) {
            socket.join(roomId);
            socket.currentRoom = roomId;
            players.set(socket.id, player);

            socket.emit('roomJoined', {
                roomId: roomId,
                team: player.team
            });

            // Notify other players
            socket.to(roomId).emit('playerJoined', player);
            socket.emit('gameState', room.getGameState());
        }
    });

    // Rejoin room after reconnection
    socket.on('rejoinRoom', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            const existingPlayer = room.players.get(data.player.id);
            if (existingPlayer) {
                socket.join(roomId);
                socket.currentRoom = roomId;
                players.set(socket.id, existingPlayer);
                socket.emit('gameState', room.getGameState());
            }
        }
    });

    // Get rooms list
    socket.on('getRooms', () => {
        const roomsList = Array.from(rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            players: Array.from(room.players.values())
        }));
        socket.emit('roomsList', roomsList);
    });

    // Player update
    socket.on('playerUpdate', (data) => {
        const player = players.get(socket.id);
        if (player && socket.currentRoom) {
            player.position = data.position;
            player.rotation = data.rotation;
            player.velocity = data.velocity;

            // Broadcast to other players in room
            socket.to(socket.currentRoom).emit('gameState', {
                players: [player]
            });
        }
    });

    // Shooting
    socket.on('shoot', (data) => {
        const room = rooms.get(socket.currentRoom);
        if (room) {
            // Check for hits
            const bullet = data.bullet;
            const shooter = players.get(socket.id);
            
            if (shooter) {
                room.players.forEach((target, targetId) => {
                    if (targetId !== socket.id && !target.isDead) {
                        // Simple hit detection (distance-based)
                        const distance = Math.sqrt(
                            Math.pow(bullet.position.x - target.position.x, 2) +
                            Math.pow(bullet.position.y - target.position.y, 2) +
                            Math.pow(bullet.position.z - target.position.z, 2)
                        );

                        if (distance < 2) { // Hit threshold
                            let damage = 35; // Body shot default
                            
                            // Headshot detection (simplified)
                            if (bullet.position.y > target.position.y + 1.5) {
                                damage = 100; // Headshot
                            } else if (bullet.position.y < target.position.y + 0.5) {
                                damage = 20; // Leg shot
                            }

                            target.health -= damage;
                            target.health = Math.max(0, target.health);

                            // Send damage update
                            io.to(socket.currentRoom).emit('playerDamaged', {
                                targetId: targetId,
                                damage: damage,
                                newHealth: target.health,
                                attackerId: shooter.id
                            });

                            // Create hit effect
                            io.to(socket.currentRoom).emit('bulletHit', {
                                position: target.position,
                                damage: damage
                            });

                            // Check if player is dead
                            if (target.health <= 0) {
                                target.isDead = true;
                                
                                // Respawn after 5 seconds
                                setTimeout(() => {
                                    target.health = 100;
                                    target.isDead = false;
                                    target.position = {
                                        x: (Math.random() - 0.5) * 20,
                                        y: 0,
                                        z: (Math.random() - 0.5) * 20
                                    };
                                    
                                    io.to(socket.currentRoom).emit('playerRespawned', {
                                        playerId: targetId,
                                        position: target.position
                                    });
                                }, 5000);
                            }
                        }
                    }
                });
            }
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`Oyuncu ayrıldı: ${socket.id}`);
        
        const player = players.get(socket.id);
        if (player && socket.currentRoom) {
            const room = rooms.get(socket.currentRoom);
            if (room) {
                room.removePlayer(player.id);
                
                // Notify other players
                socket.to(socket.currentRoom).emit('playerLeft', player.id);
                
                // Delete room if empty
                if (room.players.size === 0) {
                    rooms.delete(socket.currentRoom);
                }
            }
        }
        
        players.delete(socket.id);
    });
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Route for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        rooms: rooms.size,
        players: players.size,
        timestamp: new Date().toISOString(),
        server: 'https://saskioyunu-1-2d6i.onrender.com'
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Saski FPS sunucusu port ${PORT} üzerinde çalışıyor`);
    console.log(`Render sunucusu: https://saskioyunu-1-2d6i.onrender.com`);
    console.log('Clientlar Render sunucusuna bağlanacak');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});
