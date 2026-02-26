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

// Statik dosyaları serve et
app.use(express.static(path.join(__dirname, 'public')));

// Oyun konfigürasyonu
const CONFIG = {
    MAP_SIZE: 100,
    PLAYER_SPEED: 5,
    JUMP_FORCE: 8,
    GRAVITY: 20,
    MAX_PLAYERS_PER_TEAM: 10,
    RESPAWN_TIME: 3000, // 3 saniye
    ROUND_TIME: 600000, // 10 dakika
    WEAPONS: {
        PISTOL: { damage: 25, range: 50, fireRate: 200, ammo: 12 },
        RIFLE: { damage: 34, range: 100, fireRate: 100, ammo: 30 },
        SHOTGUN: { damage: 80, range: 20, fireRate: 800, ammo: 8 }
    }
};

// Oyun durumu
class GameState {
    constructor() {
        this.players = new Map();
        this.teams = { red: [], blue: [] };
        this.scores = { red: 0, blue: 0 };
        this.projectiles = [];
        this.pickups = this.generatePickups();
        this.roundTimer = CONFIG.ROUND_TIME;
        this.gameStarted = false;
    }

    generatePickups() {
        return [
            // Sağlık paketleri
            { type: 'health', position: { x: 20, y: 1, z: 20 }, respawn: 10000 },
            { type: 'health', position: { x: -20, y: 1, z: -20 }, respawn: 10000 },
            { type: 'health', position: { x: 30, y: 1, z: -30 }, respawn: 10000 },
            // Mermi paketleri
            { type: 'ammo', position: { x: -30, y: 1, z: 30 }, respawn: 5000 },
            { type: 'ammo', position: { x: 0, y: 1, z: 40 }, respawn: 5000 },
            // Silah yükseltmeleri
            { type: 'weapon', weapon: 'RIFLE', position: { x: 40, y: 1, z: 0 }, respawn: 15000 },
            { type: 'weapon', weapon: 'SHOTGUN', position: { x: -40, y: 1, z: 0 }, respawn: 15000 }
        ];
    }
}

const gameState = new GameState();

// Harita verileri
const MAP = {
    walls: [
        // Ana duvarlar (harita sınırları)
        { position: { x: 0, y: 5, z: -50 }, size: { x: 100, y: 10, z: 2 } },
        { position: { x: 0, y: 5, z: 50 }, size: { x: 100, y: 10, z: 2 } },
        { position: { x: -50, y: 5, z: 0 }, size: { x: 2, y: 10, z: 100 } },
        { position: { x: 50, y: 5, z: 0 }, size: { x: 2, y: 10, z: 100 } },
        
        // İç duvarlar ve engeller
        { position: { x: -30, y: 2, z: -30 }, size: { x: 5, y: 4, z: 5 } },
        { position: { x: 30, y: 2, z: 30 }, size: { x: 5, y: 4, z: 5 } },
        { position: { x: -20, y: 3, z: 20 }, size: { x: 8, y: 6, z: 2 } },
        { position: { x: 20, y: 3, z: -20 }, size: { x: 8, y: 6, z: 2 } },
        { position: { x: 0, y: 1, z: 0 }, size: { x: 10, y: 2, z: 10 } }, // Merkez platform
        
        // Siperler
        { position: { x: -40, y: 1, z: -40 }, size: { x: 3, y: 2, z: 3 } },
        { position: { x: 40, y: 1, z: 40 }, size: { x: 3, y: 2, z: 3 } },
        { position: { x: -40, y: 1, z: 40 }, size: { x: 3, y: 2, z: 3 } },
        { position: { x: 40, y: 1, z: -40 }, size: { x: 3, y: 2, z: 3 } }
    ],
    
    spawnPoints: {
        red: [
            { x: -45, y: 1, z: -45 },
            { x: -45, y: 1, z: -40 },
            { x: -45, y: 1, z: -35 },
            { x: -40, y: 1, z: -45 },
            { x: -35, y: 1, z: -45 }
        ],
        blue: [
            { x: 45, y: 1, z: 45 },
            { x: 45, y: 1, z: 40 },
            { x: 45, y: 1, z: 35 },
            { x: 40, y: 1, z: 45 },
            { x: 35, y: 1, z: 45 }
        ]
    },
    
    ground: {
        size: { x: 200, z: 200 },
        texture: 'ground'
    }
};

// Oyuncu sınıfı
class Player {
    constructor(id, name, team) {
        this.id = id;
        this.name = name;
        this.team = team;
        this.health = 100;
        this.maxHealth = 100;
        this.position = this.getSpawnPosition(team);
        this.rotation = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.isGrounded = true;
        this.isAlive = true;
        this.kills = 0;
        this.deaths = 0;
        this.score = 0;
        this.weapon = {
            type: 'PISTOL',
            ammo: CONFIG.WEAPONS.PISTOL.ammo,
            lastShot: 0
        };
        this.inputs = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            shoot: false,
            aim: false
        };
        this.lastRespawn = 0;
    }

    getSpawnPosition(team) {
        const spawns = MAP.spawnPoints[team];
        const randomSpawn = spawns[Math.floor(Math.random() * spawns.length)];
        return { ...randomSpawn };
    }

    takeDamage(amount, attackerId) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die(attackerId);
        }
        return this.health <= 0;
    }

    die(killerId) {
        this.isAlive = false;
        this.deaths++;
        this.lastRespawn = Date.now();
        
        const killer = gameState.players.get(killerId);
        if (killer) {
            killer.kills++;
            killer.score += 100;
            gameState.scores[killer.team]++;
        }
    }

    respawn() {
        this.isAlive = true;
        this.health = this.maxHealth;
        this.position = this.getSpawnPosition(this.team);
        this.weapon = {
            type: 'PISTOL',
            ammo: CONFIG.WEAPONS.PISTOL.ammo,
            lastShot: 0
        };
    }

    update(deltaTime) {
        if (!this.isAlive) {
            if (Date.now() - this.lastRespawn > CONFIG.RESPAWN_TIME) {
                this.respawn();
            }
            return;
        }

        // Hareket fiziği
        const moveSpeed = this.inputs.sprint ? CONFIG.PLAYER_SPEED * 1.5 : CONFIG.PLAYER_SPEED;
        
        if (this.inputs.forward) {
            this.velocity.x -= Math.sin(this.rotation.y) * moveSpeed * deltaTime;
            this.velocity.z -= Math.cos(this.rotation.y) * moveSpeed * deltaTime;
        }
        if (this.inputs.backward) {
            this.velocity.x += Math.sin(this.rotation.y) * moveSpeed * deltaTime;
            this.velocity.z += Math.cos(this.rotation.y) * moveSpeed * deltaTime;
        }
        if (this.inputs.left) {
            this.velocity.x -= Math.cos(this.rotation.y) * moveSpeed * deltaTime;
            this.velocity.z += Math.sin(this.rotation.y) * moveSpeed * deltaTime;
        }
        if (this.inputs.right) {
            this.velocity.x += Math.cos(this.rotation.y) * moveSpeed * deltaTime;
            this.velocity.z -= Math.sin(this.rotation.y) * moveSpeed * deltaTime;
        }

        // Zıplama
        if (this.inputs.jump && this.isGrounded) {
            this.velocity.y = CONFIG.JUMP_FORCE;
            this.isGrounded = false;
        }

        // Yerçekimi
        this.velocity.y -= CONFIG.GRAVITY * deltaTime;

        // Pozisyon güncelleme
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
        this.position.z += this.velocity.z;

        // Yer ile çarpışma
        if (this.position.y < 1) {
            this.position.y = 1;
            this.velocity.y = 0;
            this.isGrounded = true;
        }

        // Duvar çarpışma kontrolü
        this.checkCollisions();

        // Sürtünme
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
    }

    checkCollisions() {
        for (const wall of MAP.walls) {
            if (this.checkBoxCollision(
                this.position, { x: 0.5, y: 1, z: 0.5 },
                wall.position, wall.size
            )) {
                // Çarpışma çözümü
                this.resolveCollision(wall);
            }
        }
    }

    checkBoxCollision(pos1, size1, pos2, size2) {
        return Math.abs(pos1.x - pos2.x) < (size1.x + size2.x) / 2 &&
               Math.abs(pos1.y - pos2.y) < (size1.y + size2.y) / 2 &&
               Math.abs(pos1.z - pos2.z) < (size1.z + size2.z) / 2;
    }

    resolveCollision(wall) {
        // Basit çarpışma çözümü
        const dx = this.position.x - wall.position.x;
        const dz = this.position.z - wall.position.z;
        
        if (Math.abs(dx) > Math.abs(dz)) {
            this.position.x = wall.position.x + (dx > 0 ? 1 : -1) * (wall.size.x / 2 + 0.5);
        } else {
            this.position.z = wall.position.z + (dz > 0 ? 1 : -1) * (wall.size.z / 2 + 0.5);
        }
    }

    shoot() {
        const now = Date.now();
        const weapon = CONFIG.WEAPONS[this.weapon.type];
        
        if (now - this.weapon.lastShot < weapon.fireRate) return null;
        if (this.weapon.ammo <= 0) return null;
        
        this.weapon.lastShot = now;
        this.weapon.ammo--;
        
        return {
            position: { ...this.position },
            direction: {
                x: Math.sin(this.rotation.y) * Math.cos(this.rotation.x),
                y: Math.sin(this.rotation.x),
                z: Math.cos(this.rotation.y) * Math.cos(this.rotation.x)
            },
            damage: weapon.damage,
            range: weapon.range,
            shooterId: this.id
        };
    }
}

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    console.log(`🎮 Oyuncu bağlandı: ${socket.id}`);

    // Oyun durumunu gönder
    socket.emit('map-data', MAP);

    // Oyuna katılma
    socket.on('join-game', (data) => {
        const { name, team } = data;
        
        // Takım seçimi (otomatik dengeleme)
        let selectedTeam = team;
        if (!selectedTeam) {
            selectedTeam = gameState.teams.red.length <= gameState.teams.blue.length ? 'red' : 'blue';
        }
        
        // Takım kapasite kontrolü
        if (gameState.teams[selectedTeam].length >= CONFIG.MAX_PLAYERS_PER_TEAM) {
            socket.emit('team-full', selectedTeam);
            return;
        }

        // Yeni oyuncu oluştur
        const player = new Player(socket.id, name || 'Oyuncu', selectedTeam);
        gameState.players.set(socket.id, player);
        gameState.teams[selectedTeam].push(socket.id);

        // Oyuncuya hazır olduğunu bildir
        socket.emit('game-ready', {
            id: socket.id,
            team: selectedTeam,
            position: player.position,
            players: Array.from(gameState.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                team: p.team,
                position: p.position,
                health: p.health,
                isAlive: p.isAlive
            })),
            pickups: gameState.pickups,
            scores: gameState.scores
        });

        // Diğer oyunculara yeni oyuncuyu bildir
        socket.broadcast.emit('player-joined', {
            id: socket.id,
            name: player.name,
            team: player.team,
            position: player.position
        });

        console.log(`✅ ${player.name} (${selectedTeam}) oyuna katıldı`);
    });

    // Oyuncu girdileri
    socket.on('player-input', (inputData) => {
        const player = gameState.players.get(socket.id);
        if (!player) return;

        // Girdileri güncelle
        player.inputs = { ...player.inputs, ...inputData.inputs };
        
        // Fare hareketi
        if (inputData.rotation) {
            player.rotation.x += inputData.rotation.x;
            player.rotation.y += inputData.rotation.y;
            
            // Dikey rotasyon sınırı
            player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, player.rotation.x));
        }

        // Ateş etme
        if (player.inputs.shoot && player.isAlive) {
            const shot = player.shoot();
            if (shot) {
                // Raycast vuruş kontrolü
                const hit = performRaycast(shot);
                if (hit) {
                    io.emit('player-hit', {
                        shooter: socket.id,
                        victim: hit.playerId,
                        damage: shot.damage,
                        position: hit.position
                    });
                }
                
                // Mermi efektini herkese gönder
                io.emit('shot-fired', {
                    shooter: socket.id,
                    position: shot.position,
                    direction: shot.direction
                });
            }
        }
    });

    // Pickup toplama
    socket.on('collect-pickup', (pickupIndex) => {
        const player = gameState.players.get(socket.id);
        if (!player || !player.isAlive) return;

        const pickup = gameState.pickups[pickupIndex];
        if (!pickup) return;

        // Pickup etkisini uygula
        switch (pickup.type) {
            case 'health':
                player.health = Math.min(player.maxHealth, player.health + 50);
                break;
            case 'ammo':
                player.weapon.ammo += 15;
                break;
            case 'weapon':
                if (pickup.weapon) {
                    player.weapon.type = pickup.weapon;
                    player.weapon.ammo = CONFIG.WEAPONS[pickup.weapon].ammo;
                }
                break;
        }

        // Pickup'ı gizle (respawn mekanizması)
        pickup.available = false;
        setTimeout(() => {
            pickup.available = true;
            io.emit('pickup-respawned', pickupIndex);
        }, pickup.respawn);

        io.emit('pickup-collected', {
            playerId: socket.id,
            pickupIndex: pickupIndex,
            type: pickup.type
        });
    });

    // Yeniden doğma
    socket.on('request-respawn', () => {
        const player = gameState.players.get(socket.id);
        if (player && !player.isAlive) {
            player.respawn();
            socket.emit('respawned', {
                position: player.position,
                health: player.health,
                weapon: player.weapon
            });
        }
    });

    // Bağlantı kesilme
    socket.on('disconnect', () => {
        const player = gameState.players.get(socket.id);
        if (player) {
            // Takımdan çıkar
            gameState.teams[player.team] = gameState.teams[player.team].filter(id => id !== socket.id);
            gameState.players.delete(socket.id);
            
            // Diğer oyunculara bildir
            io.emit('player-left', {
                id: socket.id,
                name: player.name
            });
            
            console.log(`❌ ${player.name} oyundan ayrıldı`);
        }
    });
});

// Raycast vuruş kontrolü
function performRaycast(shot) {
    let closestHit = null;
    let closestDist = Infinity;

    for (const [id, player] of gameState.players) {
        if (id === shot.shooterId || !player.isAlive) continue;

        // Oyuncuya vektör
        const toPlayer = {
            x: player.position.x - shot.position.x,
            y: player.position.y - shot.position.y,
            z: player.position.z - shot.position.z
        };

        // Mesafe kontrolü
        const dist = Math.sqrt(toPlayer.x**2 + toPlayer.y**2 + toPlayer.z**2);
        if (dist > shot.range) continue;

        // Yön vektörü ile nokta çarpımı (açı kontrolü)
        const dir = shot.direction;
        const dot = (toPlayer.x * dir.x + toPlayer.y * dir.y + toPlayer.z * dir.z) / dist;
        
        // 10 derecelik koni içinde mi? (cos(10°) ≈ 0.985)
        if (dot > 0.985 && dist < closestDist) {
            closestDist = dist;
            closestHit = {
                playerId: id,
                position: player.position,
                distance: dist
            };
        }
    }

    if (closestHit) {
        const victim = gameState.players.get(closestHit.playerId);
        victim.takeDamage(shot.damage, shot.shooterId);
    }

    return closestHit;
}

// Oyun döngüsü
let lastTime = Date.now();
setInterval(() => {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000; // saniye cinsinden
    lastTime = currentTime;

    // Tüm oyuncuları güncelle
    for (const player of gameState.players.values()) {
        player.update(deltaTime);
    }

    // Oyun durumunu tüm oyunculara gönder
    const gameUpdate = {
        players: Array.from(gameState.players.values()).map(p => ({
            id: p.id,
            position: p.position,
            rotation: p.rotation,
            health: p.health,
            isAlive: p.isAlive,
            team: p.team,
            weapon: p.weapon.type
        })),
        scores: gameState.scores,
        pickups: gameState.pickups.filter(p => p.available)
    };

    io.emit('game-update', gameUpdate);

}, 50); // 20 FPS güncelleme

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════╗
    ║   TAKIM SAVAŞI FPS SUNUCUSU       ║
    ║   Port: ${PORT}                         ║
    ║   Harita: Arena v1.0               ║
    ║   Oyuncular: 0/20                  ║
    ╚════════════════════════════════════╝
    `);
});
