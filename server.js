const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// Oyun odaları
const rooms = new Map();

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.maxPlayers = 6;
        this.status = 'waiting'; // waiting, playing
        this.teams = { red: [], blue: [] };
        this.scores = { red: 0, blue: 0 };
        this.map = this.generateMap();
    }

    generateMap() {
        return {
            walls: [
                // Harita sınırları
                { pos: [0, 2.5, -25], size: [50, 5, 2], color: 0x666666 },
                { pos: [0, 2.5, 25], size: [50, 5, 2], color: 0x666666 },
                { pos: [-25, 2.5, 0], size: [2, 5, 50], color: 0x666666 },
                { pos: [25, 2.5, 0], size: [2, 5, 50], color: 0x666666 },
                
                // Engel olarak kutular
                { pos: [-10, 1, -10], size: [3, 2, 3], color: 0x8B4513 },
                { pos: [10, 1, 10], size: [3, 2, 3], color: 0x8B4513 },
                { pos: [-15, 1, 15], size: [4, 2, 4], color: 0x8B4513 },
                { pos: [15, 1, -15], size: [4, 2, 4], color: 0x8B4513 },
                { pos: [-5, 1, 5], size: [2, 2, 2], color: 0x8B4513 },
                { pos: [5, 1, -5], size: [2, 2, 2], color: 0x8B4513 }
            ],
            spawnPoints: {
                red: [
                    { x: -20, y: 1, z: -20 },
                    { x: -20, y: 1, z: -15 },
                    { x: -20, y: 1, z: -10 }
                ],
                blue: [
                    { x: 20, y: 1, z: 20 },
                    { x: 20, y: 1, z: 15 },
                    { x: 20, y: 1, z: 10 }
                ]
            }
        };
    }

    addPlayer(player) {
        this.players.set(player.id, player);
        
        // Takım seçimi
        const team = this.teams.red.length <= this.teams.blue.length ? 'red' : 'blue';
        player.team = team;
        this.teams[team].push(player.id);
        
        return team;
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.teams[player.team] = this.teams[player.team].filter(id => id !== playerId);
            this.players.delete(playerId);
        }
    }

    getState() {
        return {
            id: this.id,
            players: Array.from(this.players.values()).map(p => p.getPublicData()),
            teams: this.teams,
            scores: this.scores,
            map: this.map
        };
    }
}

class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.team = null;
        this.health = 100;
        this.maxHealth = 100;
        this.position = { x: 0, y: 1, z: 0 };
        this.rotation = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.isGrounded = true;
        this.isAlive = true;
        this.kills = 0;
        this.deaths = 0;
        this.weapon = {
            name: 'Pistol',
            damage: 34,
            ammo: 12,
            maxAmmo: 12,
            fireRate: 200,
            lastShot: 0
        };
        this.inputs = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            shoot: false
        };
    }

    getPublicData() {
        return {
            id: this.id,
            name: this.name,
            team: this.team,
            health: this.health,
            position: this.position,
            rotation: this.rotation,
            isAlive: this.isAlive,
            kills: this.kills,
            deaths: this.deaths,
            weapon: this.weapon.name
        };
    }

    update(deltaTime) {
        if (!this.isAlive) return;

        // Hareket
        const speed = this.inputs.sprint ? 8 : 5;
        
        if (this.inputs.forward) {
            this.position.x -= Math.sin(this.rotation.y) * speed * deltaTime;
            this.position.z -= Math.cos(this.rotation.y) * speed * deltaTime;
        }
        if (this.inputs.backward) {
            this.position.x += Math.sin(this.rotation.y) * speed * deltaTime;
            this.position.z += Math.cos(this.rotation.y) * speed * deltaTime;
        }
        if (this.inputs.left) {
            this.position.x -= Math.cos(this.rotation.y) * speed * deltaTime;
            this.position.z += Math.sin(this.rotation.y) * speed * deltaTime;
        }
        if (this.inputs.right) {
            this.position.x += Math.cos(this.rotation.y) * speed * deltaTime;
            this.position.z -= Math.sin(this.rotation.y) * speed * deltaTime;
        }

        // Zıplama
        if (this.inputs.jump && this.isGrounded) {
            this.velocity.y = 8;
            this.isGrounded = false;
        }

        // Yerçekimi
        this.velocity.y -= 20 * deltaTime;
        this.position.y += this.velocity.y * deltaTime;

        // Yer kontrolü
        if (this.position.y < 1) {
            this.position.y = 1;
            this.velocity.y = 0;
            this.isGrounded = true;
        }

        // Harita sınırları
        this.position.x = Math.max(-22, Math.min(22, this.position.x));
        this.position.z = Math.max(-22, Math.min(22, this.position.z));
    }

    shoot() {
        const now = Date.now();
        if (now - this.weapon.lastShot < this.weapon.fireRate) return null;
        if (this.weapon.ammo <= 0) return null;

        this.weapon.lastShot = now;
        this.weapon.ammo--;

        return {
            position: { ...this.position },
            direction: {
                x: Math.sin(this.rotation.y),
                z: Math.cos(this.rotation.y)
            },
            damage: this.weapon.damage,
            shooterId: this.id
        };
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
        }
        return this.health <= 0;
    }

    respawn(team) {
        this.health = this.maxHealth;
        this.isAlive = true;
        this.weapon.ammo = this.weapon.maxAmmo;
        
        // Spawn noktası seç
        const room = Array.from(rooms.values()).find(r => r.players.has(this.id));
        if (room) {
            const spawns = room.map.spawnPoints[team];
            this.position = { ...spawns[Math.floor(Math.random() * spawns.length)] };
        }
    }
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log('🔵 Yeni oyuncu bağlandı:', socket.id);

    // Ana odaya katıl
    socket.join('lobby');

    // Oyun listesini gönder
    const roomsList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        players: room.players.size,
        maxPlayers: room.maxPlayers,
        status: room.status
    }));
    
    socket.emit('rooms-list', roomsList);

    // Oda oluştur
    socket.on('create-room', (data) => {
        const roomId = Math.random().toString(36).substring(7);
        const room = new GameRoom(roomId);
        rooms.set(roomId, room);
        
        socket.emit('room-created', roomId);
        io.emit('rooms-list', Array.from(rooms.values()).map(r => ({
            id: r.id,
            players: r.players.size,
            maxPlayers: r.maxPlayers,
            status: r.status
        })));
    });

    // Odaya katıl
    socket.on('join-room', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) {
            socket.emit('error', 'Oda bulunamadı');
            return;
        }

        if (room.players.size >= room.maxPlayers) {
            socket.emit('error', 'Oda dolu');
            return;
        }

        // Oyuncuyu oluştur
        const player = new Player(socket.id, data.playerName || 'Oyuncu');
        const team = room.addPlayer(player);

        // Socket'i odaya ekle
        socket.leave('lobby');
        socket.join(room.id);

        // Oyuncuya oda durumunu gönder
        socket.emit('room-joined', {
            roomId: room.id,
            playerId: socket.id,
            team: team,
            players: Array.from(room.players.values()).map(p => p.getPublicData()),
            map: room.map,
            scores: room.scores
        });

        // Diğer oyunculara yeni oyuncuyu bildir
        socket.to(room.id).emit('player-joined', player.getPublicData());

        // Oda listesini güncelle
        io.emit('rooms-list', Array.from(rooms.values()).map(r => ({
            id: r.id,
            players: r.players.size,
            maxPlayers: r.maxPlayers,
            status: r.status
        })));

        console.log(`${player.name} odaya katıldı: ${room.id}`);
    });

    // Oyuncu girdileri
    socket.on('player-input', (data) => {
        // Oyuncunun odasını bul
        let playerRoom = null;
        let player = null;

        for (const room of rooms.values()) {
            if (room.players.has(socket.id)) {
                playerRoom = room;
                player = room.players.get(socket.id);
                break;
            }
        }

        if (!player || !playerRoom) return;

        // Girdileri güncelle
        if (data.inputs) {
            player.inputs = { ...player.inputs, ...data.inputs };
        }

        if (data.rotation) {
            player.rotation.y += data.rotation.x * 0.002;
            player.rotation.x += data.rotation.y * 0.002;
            player.rotation.x = Math.max(-1, Math.min(1, player.rotation.x));
        }

        // Ateş etme
        if (player.inputs.shoot && player.isAlive) {
            const shot = player.shoot();
            if (shot) {
                // Vuruş kontrolü
                for (const target of playerRoom.players.values()) {
                    if (target.id === player.id || !target.isAlive) continue;

                    const dx = target.position.x - player.position.x;
                    const dz = target.position.z - player.position.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);

                    if (dist < 30) {
                        const angle = Math.atan2(dx, dz);
                        const angleDiff = Math.abs(player.rotation.y - angle);
                        
                        if (angleDiff < 0.5) {
                            target.takeDamage(shot.damage);
                            
                            if (!target.isAlive) {
                                player.kills++;
                                playerRoom.scores[player.team]++;
                                
                                io.to(playerRoom.id).emit('player-died', {
                                    killer: player.id,
                                    victim: target.id,
                                    killerName: player.name,
                                    victimName: target.name
                                });
                            }
                            
                            io.to(target.id).emit('player-hit', {
                                health: target.health,
                                attacker: player.id
                            });
                        }
                    }
                }

                io.to(playerRoom.id).emit('shot-fired', {
                    shooter: player.id,
                    position: shot.position,
                    direction: shot.direction
                });
            }
        }
    });

    // Yeniden doğma
    socket.on('respawn', () => {
        for (const room of rooms.values()) {
            const player = room.players.get(socket.id);
            if (player && !player.isAlive) {
                player.respawn(player.team);
                socket.emit('respawned', {
                    position: player.position,
                    health: player.health,
                    ammo: player.weapon.ammo
                });
                break;
            }
        }
    });

    // Bağlantı kesilme
    socket.on('disconnect', () => {
        console.log('🔴 Oyuncu ayrıldı:', socket.id);

        for (const room of rooms.values()) {
            if (room.players.has(socket.id)) {
                room.removePlayer(socket.id);
                io.to(room.id).emit('player-left', socket.id);

                // Oda boşsa sil
                if (room.players.size === 0) {
                    rooms.delete(room.id);
                }

                // Oda listesini güncelle
                io.emit('rooms-list', Array.from(rooms.values()).map(r => ({
                    id: r.id,
                    players: r.players.size,
                    maxPlayers: r.maxPlayers,
                    status: r.status
                })));

                break;
            }
        }
    });
});

// Oyun döngüsü
let lastTime = Date.now();
setInterval(() => {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 100;
    lastTime = currentTime;

    for (const room of rooms.values()) {
        const updates = [];

        for (const player of room.players.values()) {
            player.update(deltaTime);
            
            updates.push({
                id: player.id,
                position: player.position,
                rotation: player.rotation,
                health: player.health,
                isAlive: player.isAlive,
                kills: player.kills,
                deaths: player.deaths
            });
        }

        if (updates.length > 0) {
            io.to(room.id).emit('game-update', {
                players: updates,
                scores: room.scores
            });
        }
    }
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════╗
    ║     PROFESYONEL FPS SUNUCUSU       ║
    ║     Port: ${PORT}                         ║
    ║     Status: ÇALIŞIYOR               ║
    ╚════════════════════════════════════╝
    `);
});
