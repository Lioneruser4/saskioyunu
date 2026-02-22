/**
 * SAŞKİ OYUNU - PROFESYONEL SUNUCU
 * @version 3.0.0
 * @author SAŞKİ GAMES
 * @license MIT
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ==================== KONFİGÜRASYON ====================
const CONFIG = {
  SERVER: {
    PORT: process.env.PORT || 10000,
    NAME: 'SAŞKİ OYUNU V3',
    ENV: process.env.NODE_ENV || 'development',
    VERSION: '3.0.0'
  },
  GAME: {
    MAX_PLAYERS_PER_ROOM: 20,
    MAX_ROOMS: 1000,
    TEAM_BALANCE: true,
    FRIENDLY_FIRE: false,
    RESPAWN_TIME: 5000,
    ROUND_TIME: 600000, // 10 dakika
    WARMUP_TIME: 30000 // 30 saniye
  },
  DAMAGE: {
    HEAD: 100,
    BODY: 35,
    LEG: 20,
    ARM: 25,
    EXPLOSION: 50
  },
  WEAPONS: {
    AK47: {
      damage: 35,
      fireRate: 100,
      reloadTime: 2000,
      ammo: 30,
      range: 100
    },
    M4A4: {
      damage: 33,
      fireRate: 90,
      reloadTime: 2100,
      ammo: 30,
      range: 95
    },
    SNIPER: {
      damage: 100,
      fireRate: 1000,
      reloadTime: 3000,
      ammo: 10,
      range: 200
    },
    SHOTGUN: {
      damage: 20,
      fireRate: 800,
      reloadTime: 2500,
      ammo: 8,
      range: 30,
      pellets: 8
    },
    PISTOL: {
      damage: 25,
      fireRate: 200,
      reloadTime: 1500,
      ammo: 12,
      range: 50
    }
  },
  MAPS: {
    BACKROOMS: {
      name: 'Backrooms - Seviye 1',
      spawns: {
        red: [
          { x: -20, y: 1, z: -20 },
          { x: -15, y: 1, z: -15 },
          { x: -10, y: 1, z: -10 }
        ],
        blue: [
          { x: 20, y: 1, z: 20 },
          { x: 15, y: 1, z: 15 },
          { x: 10, y: 1, z: 10 }
        ]
      },
      objectives: [
        { type: 'flag', pos: { x: 0, y: 1, z: 0 } }
      ]
    },
    WAREHOUSE: {
      name: 'Depo Arenası',
      spawns: {
        red: [
          { x: -15, y: 1, z: -15 },
          { x: -10, y: 1, z: -10 }
        ],
        blue: [
          { x: 15, y: 1, z: 15 },
          { x: 10, y: 1, z: 10 }
        ]
      }
    },
    COMPLEX: {
      name: 'Kompleks B',
      spawns: {
        red: [
          { x: -25, y: 1, z: -25 },
          { x: -20, y: 1, z: -20 }
        ],
        blue: [
          { x: 25, y: 1, z: 25 },
          { x: 20, y: 1, z: 20 }
        ]
      }
    }
  }
};

// ==================== GÜVENLİK KATMANI ====================
const app = express();
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: ['https://saskioyunu.github.io', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100 // her IP'den 100 istek
});
app.use('/api/', limiter);

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://saskioyunu.github.io', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8
});

// ==================== VERİTABANI YÖNETİCİSİ ====================
class DatabaseManager {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.players = new Map();
    this.rooms = new Map();
    this.matches = new Map();
    this.stats = new Map();
    this.leaderboard = [];
    this.bans = new Map();
    this.reports = [];
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadData();
      this.startAutoSave();
      console.log('✅ Veritabanı başlatıldı');
    } catch (error) {
      console.error('❌ Veritabanı hatası:', error);
    }
  }

  startAutoSave() {
    setInterval(() => this.saveData(), 300000); // 5 dakikada bir
  }

  async loadData() {
    try {
      const files = await fs.readdir(this.dataPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = JSON.parse(await fs.readFile(path.join(this.dataPath, file), 'utf8'));
          if (file.startsWith('player_')) {
            this.players.set(data.id, data);
          } else if (file.startsWith('stats_')) {
            this.stats.set(data.id, data);
          }
        }
      }
      this.updateLeaderboard();
      console.log(`📊 ${this.players.size} oyuncu yüklendi`);
    } catch (error) {
      console.error('❌ Veri yükleme hatası:', error);
    }
  }

  async saveData() {
    try {
      for (const [id, player] of this.players) {
        await fs.writeFile(
          path.join(this.dataPath, `player_${id}.json`),
          JSON.stringify(player, null, 2)
        );
      }
      for (const [id, stat] of this.stats) {
        await fs.writeFile(
          path.join(this.dataPath, `stats_${id}.json`),
          JSON.stringify(stat, null, 2)
        );
      }
      console.log('💾 Veriler kaydedildi');
    } catch (error) {
      console.error('❌ Veri kaydetme hatası:', error);
    }
  }

  getPlayer(id) {
    return this.players.get(id) || null;
  }

  createPlayer(telegramId, username) {
    const player = {
      id: telegramId,
      username: username,
      telegramId: telegramId,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      level: 1,
      xp: 0,
      xpNeeded: 1000,
      stats: {
        kills: 0,
        deaths: 0,
        wins: 0,
        losses: 0,
        headshots: 0,
        accuracy: 0,
        shotsFired: 0,
        shotsHit: 0,
        playTime: 0,
        favoriteWeapon: 'AK47'
      },
      inventory: {
        weapons: ['AK47', 'PISTOL'],
        skins: [],
        emotes: []
      },
      settings: {
        sensitivity: 5,
        volume: 80,
        graphics: 'high',
        crosshair: 'default'
      },
      friends: [],
      blocked: [],
      rank: 'BRONZE',
      rankPoints: 0
    };
    this.players.set(telegramId, player);
    this.stats.set(telegramId, player.stats);
    return player;
  }

  updateLeaderboard() {
    this.leaderboard = Array.from(this.stats.entries())
      .map(([id, stats]) => ({
        id,
        username: this.players.get(id)?.username || 'Bilinmiyor',
        ...stats,
        kd: stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills
      }))
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 100);
  }

  addReport(report) {
    this.reports.push({
      ...report,
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      status: 'pending'
    });
  }

  banPlayer(playerId, reason, duration) {
    this.bans.set(playerId, {
      reason,
      duration,
      bannedAt: Date.now(),
      expiresAt: Date.now() + duration
    });
  }
}

// ==================== ODA YÖNETİCİSİ ====================
class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.waitingQueue = [];
    this.roomTypes = {
      QUICK: 'quick',
      RANKED: 'ranked',
      CUSTOM: 'custom',
      TOURNAMENT: 'tournament'
    };
    this.roomStates = {
      WAITING: 'waiting',
      STARTING: 'starting',
      PLAYING: 'playing',
      ENDING: 'ending',
      FINISHED: 'finished'
    };
  }

  generateRoomCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  createRoom(options = {}) {
    const roomId = this.generateRoomCode();
    const room = {
      id: roomId,
      code: roomId,
      name: options.name || `Oda #${roomId}`,
      type: options.type || this.roomTypes.QUICK,
      map: options.map || 'BACKROOMS',
      mode: options.mode || 'team_deathmatch',
      password: options.password || null,
      state: this.roomStates.WAITING,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      
      // Takım bilgileri
      teams: {
        red: {
          players: new Map(),
          score: 0,
          maxPlayers: 10
        },
        blue: {
          players: new Map(),
          score: 0,
          maxPlayers: 10
        }
      },
      
      // Oyuncu listesi (tümü)
      players: new Map(),
      
      // Oyun ayarları
      settings: {
        friendlyFire: false,
        teamBalance: true,
        respawnTime: CONFIG.GAME.RESPAWN_TIME,
        roundTime: CONFIG.GAME.ROUND_TIME,
        warmupTime: CONFIG.GAME.WARMUP_TIME,
        maxScore: 100,
        weapons: ['AK47', 'M4A4', 'SNIPER', 'SHOTGUN', 'PISTOL']
      },
      
      // Oyun durumu
      round: 1,
      maxRounds: 10,
      warmup: true,
      warmupEndTime: Date.now() + CONFIG.GAME.WARMUP_TIME,
      
      // Harita objeleri
      objectives: [],
      pickups: [],
      projectiles: [],
      
      // İstatistikler
      stats: {
        redKills: 0,
        blueKills: 0,
        totalShots: 0,
        totalHits: 0
      },
      
      // Spectator'lar
      spectators: new Map(),
      
      // Sohbet geçmişi
      chatHistory: [],
      
      // Oyun geçmişi
      events: []
    };

    // Haritayı yükle
    this.loadMap(room, options.map);

    this.rooms.set(roomId, room);
    return room;
  }

  loadMap(room, mapName) {
    const mapConfig = CONFIG.MAPS[mapName];
    if (mapConfig) {
      room.mapConfig = mapConfig;
      room.objectives = mapConfig.objectives || [];
    }
  }

  findAvailableRoom(preferences = {}) {
    // Önce uygun oda ara
    for (const [id, room] of this.rooms) {
      if (room.state === this.roomStates.WAITING) {
        const totalPlayers = room.teams.red.players.size + room.teams.blue.players.size;
        if (totalPlayers < CONFIG.GAME.MAX_PLAYERS_PER_ROOM) {
          // Tercihlere uygun mu kontrol et
          if (preferences.map && room.map !== preferences.map) continue;
          if (preferences.mode && room.mode !== preferences.mode) continue;
          if (room.password) continue; // Şifreli odaları atla
          
          return room;
        }
      }
    }
    
    // Uygun oda yoksa yeni oluştur
    return this.createRoom({
      type: this.roomTypes.QUICK,
      map: preferences.map || 'BACKROOMS',
      mode: preferences.mode || 'team_deathmatch'
    });
  }

  addPlayerToRoom(roomId, player) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Takım seçimi (dengeleme)
    let targetTeam = 'red';
    if (CONFIG.GAME.TEAM_BALANCE) {
      const redCount = room.teams.red.players.size;
      const blueCount = room.teams.blue.players.size;
      targetTeam = redCount <= blueCount ? 'red' : 'blue';
    } else {
      // Rastgele takım
      targetTeam = Math.random() < 0.5 ? 'red' : 'blue';
    }

    // Oyuncuyu takıma ekle
    const team = room.teams[targetTeam];
    team.players.set(player.id, player);
    room.players.set(player.id, {
      ...player,
      team: targetTeam,
      joinedAt: Date.now(),
      health: 100,
      armor: 0,
      weapon: 'AK47',
      ammo: 30,
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      position: this.getSpawnPosition(room, targetTeam),
      rotation: { x: 0, y: 0, z: 0 },
      isAlive: true,
      isReady: false,
      ping: 0
    });

    // Oda event'ini kaydet
    room.events.push({
      type: 'player_joined',
      player: player.username,
      team: targetTeam,
      timestamp: Date.now()
    });

    // Oda dolu mu kontrol et
    if (room.teams.red.players.size + room.teams.blue.players.size >= CONFIG.GAME.MAX_PLAYERS_PER_ROOM) {
      this.startRoomCountdown(room);
    }

    return targetTeam;
  }

  getSpawnPosition(room, team) {
    const mapConfig = room.mapConfig;
    if (mapConfig && mapConfig.spawns[team]) {
      const spawns = mapConfig.spawns[team];
      return spawns[Math.floor(Math.random() * spawns.length)];
    }
    // Varsayılan spawn
    return { x: team === 'red' ? -10 : 10, y: 1, z: team === 'red' ? -10 : 10 };
  }

  startRoomCountdown(room) {
    if (room.state !== this.roomStates.WAITING) return;
    
    room.state = this.roomStates.STARTING;
    room.startCountdown = 10; // 10 saniye geri sayım
    
    const countdownInterval = setInterval(() => {
      room.startCountdown--;
      
      // Geri sayımı tüm oyunculara gönder
      io.to(room.id).emit('room:countdown', room.startCountdown);
      
      if (room.startCountdown <= 0) {
        clearInterval(countdownInterval);
        this.startGame(room);
      }
    }, 1000);
  }

  startGame(room) {
    room.state = this.roomStates.PLAYING;
    room.startedAt = Date.now();
    room.warmup = false;
    
    // Tüm oyuncuları canlandır
    for (const [id, player] of room.players) {
      player.isAlive = true;
      player.health = 100;
      player.position = this.getSpawnPosition(room, player.team);
    }
    
    // Oyun başladı event'i
    io.to(room.id).emit('game:started', {
      roomId: room.id,
      map: room.map,
      mode: room.mode,
      teams: {
        red: Array.from(room.teams.red.players.keys()),
        blue: Array.from(room.teams.blue.players.keys())
      }
    });
    
    console.log(`🎮 Oyun başladı: ${room.id}`);
  }

  handlePlayerDamage(room, shooterId, targetId, hitZone, weapon) {
    const shooter = room.players.get(shooterId);
    const target = room.players.get(targetId);
    
    if (!shooter || !target || !target.isAlive) return;
    if (!CONFIG.GAME.FRIENDLY_FIRE && shooter.team === target.team) return;
    
    // Hasar hesapla
    const weaponConfig = CONFIG.WEAPONS[weapon] || CONFIG.WEAPONS.AK47;
    let damage = weaponConfig.damage;
    
    // Hit zone multiplier
    if (hitZone === 'head') damage = CONFIG.DAMAGE.HEAD;
    else if (hitZone === 'body') damage = CONFIG.DAMAGE.BODY;
    else if (hitZone === 'leg') damage = CONFIG.DAMAGE.LEG;
    else if (hitZone === 'arm') damage = CONFIG.DAMAGE.ARM;
    
    target.health -= damage;
    
    // İstatistik güncelle
    shooter.stats.shotsHit++;
    room.stats.totalHits++;
    
    if (target.health <= 0) {
      this.handlePlayerDeath(room, shooterId, targetId, hitZone);
    }
    
    return {
      damage,
      remainingHealth: target.health,
      isDead: target.health <= 0
    };
  }

  handlePlayerDeath(room, killerId, victimId, hitZone) {
    const killer = room.players.get(killerId);
    const victim = room.players.get(victimId);
    
    if (!killer || !victim) return;
    
    victim.isAlive = false;
    victim.deaths++;
    
    killer.kills++;
    if (hitZone === 'head') killer.stats.headshots++;
    
    // Takım skoru güncelle
    if (killer.team === 'red') {
      room.teams.red.score++;
      room.stats.redKills++;
    } else {
      room.teams.blue.score++;
      room.stats.blueKills++;
    }
    
    // Ölüm event'i
    io.to(room.id).emit('player:died', {
      killerId,
      killerName: killer.username,
      victimId,
      victimName: victim.username,
      hitZone,
      teamScore: {
        red: room.teams.red.score,
        blue: room.teams.blue.score
      }
    });
    
    // Respawn timer
    setTimeout(() => {
      this.respawnPlayer(room, victimId);
    }, CONFIG.GAME.RESPAWN_TIME);
    
    // Round bitiş kontrolü
    this.checkRoundEnd(room);
  }

  respawnPlayer(room, playerId) {
    const player = room.players.get(playerId);
    if (!player) return;
    
    player.isAlive = true;
    player.health = 100;
    player.position = this.getSpawnPosition(room, player.team);
    
    io.to(room.id).emit('player:respawned', {
      playerId,
      position: player.position
    });
  }

  checkRoundEnd(room) {
    const redScore = room.teams.red.score;
    const blueScore = room.teams.blue.score;
    const maxScore = room.settings.maxScore;
    
    if (redScore >= maxScore || blueScore >= maxScore) {
      this.endRound(room, redScore >= maxScore ? 'red' : 'blue');
    }
  }

  endRound(room, winner) {
    room.round++;
    
    io.to(room.id).emit('round:ended', {
      winner,
      redScore: room.teams.red.score,
      blueScore: room.teams.blue.score,
      nextRound: room.round
    });
    
    if (room.round > room.maxRounds) {
      this.endGame(room);
    } else {
      // Yeni round için hazırlık
      setTimeout(() => {
        this.startNewRound(room);
      }, 10000);
    }
  }

  startNewRound(room) {
    // Tüm oyuncuları canlandır
    for (const [id, player] of room.players) {
      player.isAlive = true;
      player.health = 100;
      player.position = this.getSpawnPosition(room, player.team);
    }
    
    io.to(room.id).emit('round:started', {
      round: room.round,
      redScore: room.teams.red.score,
      blueScore: room.teams.blue.score
    });
  }

  endGame(room) {
    room.state = this.roomStates.ENDING;
    room.endedAt = Date.now();
    
    const winner = room.teams.red.score > room.teams.blue.score ? 'red' : 'blue';
    
    io.to(room.id).emit('game:ended', {
      winner,
      redScore: room.teams.red.score,
      blueScore: room.teams.blue.score,
      stats: room.stats
    });
    
    // İstatistikleri kaydet
    this.saveGameStats(room);
    
    // 30 saniye sonra odayı temizle
    setTimeout(() => {
      this.cleanupRoom(room.id);
    }, 30000);
  }

  saveGameStats(room) {
    // Oyuncu istatistiklerini güncelle
    for (const [id, player] of room.players) {
      const dbPlayer = db.getPlayer(player.telegramId);
      if (dbPlayer) {
        dbPlayer.stats.kills += player.kills;
        dbPlayer.stats.deaths += player.deaths;
        dbPlayer.stats.playTime += (room.endedAt - room.startedAt) / 1000;
        
        if (player.team === (room.teams.red.score > room.teams.blue.score ? 'red' : 'blue')) {
          dbPlayer.stats.wins++;
        } else {
          dbPlayer.stats.losses++;
        }
        
        // XP hesapla ve level atlat
        const xpGained = (player.kills * 10) + (player.score * 5) + (player.assists * 3);
        dbPlayer.xp += xpGained;
        
        while (dbPlayer.xp >= dbPlayer.xpNeeded) {
          dbPlayer.level++;
          dbPlayer.xp -= dbPlayer.xpNeeded;
          dbPlayer.xpNeeded = Math.floor(dbPlayer.xpNeeded * 1.5);
        }
      }
    }
    
    db.updateLeaderboard();
  }

  cleanupRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      // Tüm oyuncuları odadan çıkar
      for (const [id, player] of room.players) {
        io.to(id).emit('room:closed');
      }
      this.rooms.delete(roomId);
      console.log(`🧹 Oda temizlendi: ${roomId}`);
    }
  }

  removePlayerFromRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.get(playerId);
    if (!player) return;
    
    // Takımdan çıkar
    room.teams[player.team].players.delete(playerId);
    room.players.delete(playerId);
    
    // Event kaydet
    room.events.push({
      type: 'player_left',
      player: player.username,
      timestamp: Date.now()
    });
    
    // Diğer oyunculara bildir
    io.to(roomId).emit('player:left', {
      playerId,
      username: player.username,
      team: player.team,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        team: p.team
      }))
    });
    
    // Oda boşsa temizle
    if (room.players.size === 0) {
      this.cleanupRoom(roomId);
    }
  }
}

// ==================== ANOMALİ TESPİT SİSTEMİ ====================
class AntiCheatSystem {
  constructor() {
    this.suspiciousActivities = new Map();
    this.bannedPlayers = new Set();
    this.thresholds = {
      maxKillsPerSecond: 5,
      maxHeadshotPercentage: 80,
      maxSpeed: 20,
      maxDamagePerSecond: 200,
      suspiciousPing: 50
    };
  }

  checkPlayerActivity(playerId, activity) {
    if (this.bannedPlayers.has(playerId)) return false;
    
    const playerActivity = this.suspiciousActivities.get(playerId) || {
      kills: [],
      shots: [],
      movements: [],
      damage: [],
      reports: 0
    };
    
    const now = Date.now();
    
    // Kill hızı kontrolü
    if (activity.type === 'kill') {
      playerActivity.kills.push(now);
      const recentKills = playerActivity.kills.filter(t => now - t < 1000);
      if (recentKills.length > this.thresholds.maxKillsPerSecond) {
        this.reportSuspicious(playerId, 'KILL_SPEED_HACK', recentKills.length);
        return false;
      }
    }
    
    // Headshot yüzdesi kontrolü
    if (activity.type === 'shot' && activity.hitZone === 'head') {
      playerActivity.shots.push({ hit: true, headshot: true });
    }
    
    // Hız kontrolü
    if (activity.type === 'move') {
      playerActivity.movements.push({ pos: activity.position, time: now });
      if (playerActivity.movements.length > 2) {
        const prev = playerActivity.movements[playerActivity.movements.length - 2];
        const distance = this.calculateDistance(prev.pos, activity.position);
        const timeDiff = (now - prev.time) / 1000;
        const speed = distance / timeDiff;
        
        if (speed > this.thresholds.maxSpeed) {
          this.reportSuspicious(playerId, 'SPEED_HACK', speed);
          return false;
        }
      }
    }
    
    this.suspiciousActivities.set(playerId, playerActivity);
    return true;
  }

  calculateDistance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos2.x - pos1.x, 2) +
      Math.pow(pos2.y - pos1.y, 2) +
      Math.pow(pos2.z - pos1.z, 2)
    );
  }

  reportSuspicious(playerId, reason, value) {
    const activity = this.suspiciousActivities.get(playerId) || { reports: 0 };
    activity.reports++;
    
    console.warn(`⚠️ Şüpheli aktivite: ${playerId} - ${reason} (${value})`);
    
    if (activity.reports >= 3) {
      this.banPlayer(playerId, reason);
    }
    
    this.suspiciousActivities.set(playerId, activity);
  }

  banPlayer(playerId, reason) {
    this.bannedPlayers.add(playerId);
    console.error(`🚫 Oyuncu yasaklandı: ${playerId} - ${reason}`);
    
    // Yasaklı oyuncuyu sunucudan at
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      socket.emit('banned', { reason, duration: 'PERMANENT' });
      socket.disconnect(true);
    }
  }
}

// ==================== EKONOMİ SİSTEMİ ====================
class EconomySystem {
  constructor() {
    this.currencies = {
      GOLD: 'gold',
      GEMS: 'gems',
      TOKENS: 'tokens'
    };
    
    this.shop = {
      weapons: {
        AK47: { price: { gold: 1000 }, level: 1 },
        M4A4: { price: { gold: 1500 }, level: 2 },
        SNIPER: { price: { gold: 2000 }, level: 3 },
        SHOTGUN: { price: { gold: 1200 }, level: 2 }
      },
      skins: {
        GOLD_AK: { price: { gems: 500 }, weapon: 'AK47' },
        RED_M4: { price: { gems: 400 }, weapon: 'M4A4' },
        DRAGON_SNIPER: { price: { gems: 1000 }, weapon: 'SNIPER' }
      },
      emotes: {
        DANCE: { price: { tokens: 100 } },
        LAUGH: { price: { tokens: 50 } },
        THUMBS_UP: { price: { tokens: 30 } }
      }
    };
  }

  purchaseItem(player, category, itemId) {
    const item = this.shop[category]?.[itemId];
    if (!item) return { success: false, reason: 'ITEM_NOT_FOUND' };
    
    // Level kontrolü
    if (item.level && player.level < item.level) {
      return { success: false, reason: 'LEVEL_TOO_LOW' };
    }
    
    // Bakiye kontrolü
    for (const [currency, amount] of Object.entries(item.price)) {
      if ((player.inventory?.[currency] || 0) < amount) {
        return { success: false, reason: 'INSUFFICIENT_BALANCE' };
      }
    }
    
    // Parayı düş
    for (const [currency, amount] of Object.entries(item.price)) {
      player.inventory[currency] -= amount;
    }
    
    // Eşyayı envantere ekle
    if (!player.inventory[category]) {
      player.inventory[category] = [];
    }
    player.inventory[category].push(itemId);
    
    return { success: true, item, newBalance: player.inventory };
  }

  calculateMatchRewards(player, matchStats) {
    let gold = matchStats.kills * 10;
    gold += matchStats.score * 2;
    gold += matchStats.win ? 50 : 10;
    
    let gems = matchStats.mvp ? 5 : 0;
    gems += matchStats.headshots * 2;
    
    let tokens = matchStats.win ? 1 : 0;
    tokens += Math.floor(matchStats.kills / 5);
    
    return { gold, gems, tokens };
  }
}

// ==================== SOHBET SİSTEMİ ====================
class ChatSystem {
  constructor() {
    this.channels = new Map();
    this.filters = ['spam', 'caps', 'links', 'profanity'];
    this.mutedPlayers = new Map();
  }

  createChannel(name, type = 'global') {
    const channel = {
      id: crypto.randomBytes(8).toString('hex'),
      name,
      type,
      messages: [],
      users: new Set(),
      createdAt: Date.now()
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  sendMessage(channelId, player, message) {
    const channel = this.channels.get(channelId);
    if (!channel) return { success: false, reason: 'CHANNEL_NOT_FOUND' };
    
    // Mute kontrolü
    if (this.mutedPlayers.has(player.id)) {
      const mute = this.mutedPlayers.get(player.id);
      if (mute.expiresAt > Date.now()) {
        return { success: false, reason: 'MUTED', expiresAt: mute.expiresAt };
      }
      this.mutedPlayers.delete(player.id);
    }
    
    // Mesaj filtreleme
    const filteredMessage = this.filterMessage(message);
    if (!filteredMessage) {
      return { success: false, reason: 'MESSAGE_BLOCKED' };
    }
    
    const chatMessage = {
      id: crypto.randomBytes(8).toString('hex'),
      playerId: player.id,
      username: player.username,
      message: filteredMessage,
      timestamp: Date.now(),
      channel: channelId
    };
    
    channel.messages.push(chatMessage);
    
    // Mesaj geçmişini sınırla
    if (channel.messages.length > 100) {
      channel.messages.shift();
    }
    
    return { success: true, message: chatMessage };
  }

  filterMessage(message) {
    // Spam kontrolü
    if (message.length > 200) return null;
    
    // Caps kontrolü
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (capsRatio > 0.7) return message.toLowerCase();
    
    // Link kontrolü
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(message) && !message.includes('saskioyunu.com')) {
      return '[LINK ENGELLENDİ]';
    }
    
    return message;
  }

  mutePlayer(playerId, duration, reason) {
    this.mutedPlayers.set(playerId, {
      reason,
      mutedAt: Date.now(),
      expiresAt: Date.now() + duration
    });
  }
}

// ==================== İSTATİSTİK SİSTEMİ ====================
class StatisticsSystem {
  constructor() {
    this.globalStats = {
      totalPlayers: 0,
      totalMatches: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalShots: 0,
      totalHeadshots: 0,
      onlinePlayers: 0,
      activeRooms: 0
    };
    
    this.achievements = {
      FIRST_BLOOD: { name: 'İlk Kan', description: 'İlk öldürmeni yap', xp: 100 },
      DOUBLE_KILL: { name: 'Çifte Kavrulmuş', description: '2 saniyede 2 öldür', xp: 200 },
      TRIPLE_KILL: { name: 'Üçlü Fırtına', description: '3 saniyede 3 öldür', xp: 400 },
      KILLING_SPREE: { name: 'Seri Katil', description: '5 öldürme yap', xp: 500 },
      HEADHUNTER: { name: 'Kafa Avcısı', description: '10 kafa vuruşu yap', xp: 300 },
      SURVIVOR: { name: 'Hayatta Kalan', description: '10 kez ölmeden kal', xp: 250 },
      VETERAN: { name: 'Gazi', description: '100 maç kazan', xp: 1000 },
      SHARPSHOOTER: { name: 'Keskin Nişancı', description: '%60 isabet oranı yakala', xp: 750 }
    };
  }

  updateGlobalStats() {
    this.globalStats.onlinePlayers = io.engine.clientsCount;
    this.globalStats.activeRooms = roomManager.rooms.size;
  }

  checkAchievements(player, stats) {
    const unlocked = [];
    
    for (const [id, achievement] of Object.entries(this.achievements)) {
      if (player.achievements?.includes(id)) continue;
      
      let earned = false;
      switch (id) {
        case 'FIRST_BLOOD':
          earned = stats.kills >= 1;
          break;
        case 'DOUBLE_KILL':
          earned = stats.maxKillsIn2Seconds >= 2;
          break;
        case 'TRIPLE_KILL':
          earned = stats.maxKillsIn3Seconds >= 3;
          break;
        case 'KILLING_SPREE':
          earned = stats.maxKillStreak >= 5;
          break;
        case 'HEADHUNTER':
          earned = stats.headshots >= 10;
          break;
        case 'SURVIVOR':
          earned = stats.survivalCount >= 10;
          break;
        case 'VETERAN':
          earned = stats.wins >= 100;
          break;
        case 'SHARPSHOOTER':
          earned = stats.accuracy >= 0.6;
          break;
      }
      
      if (earned) {
        unlocked.push({
          id,
          ...achievement,
          earnedAt: Date.now()
        });
        
        if (!player.achievements) player.achievements = [];
        player.achievements.push(id);
      }
    }
    
    return unlocked;
  }
}

// ==================== SİSTEMLERİ BAŞLAT ====================
const db = new DatabaseManager();
const roomManager = new RoomManager();
const antiCheat = new AntiCheatSystem();
const economy = new EconomySystem();
const chat = new ChatSystem();
const stats = new StatisticsSystem();

// ==================== API ENDPOINT'LERİ ====================

// Sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    rooms: roomManager.rooms.size
  });
});

// İstatistikler
app.get('/api/stats', (req, res) => {
  stats.updateGlobalStats();
  res.json({
    global: stats.globalStats,
    leaderboard: db.leaderboard.slice(0, 10)
  });
});

// Liderlik tablosu
app.get('/api/leaderboard', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const start = (page - 1) * limit;
  const end = start + limit;
  
  res.json({
    page,
    total: db.leaderboard.length,
    players: db.leaderboard.slice(start, end)
  });
});

// Oyuncu profili
app.get('/api/player/:id', (req, res) => {
  const player = db.getPlayer(req.params.id);
  if (!player) {
    return res.status(404).json({ error: 'Oyuncu bulunamadı' });
  }
  res.json(player);
});

// Aktif odalar
app.get('/api/rooms', (req, res) => {
  const rooms = Array.from(roomManager.rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    map: room.map,
    mode: room.mode,
    state: room.state,
    players: room.players.size,
    redCount: room.teams.red.players.size,
    blueCount: room.teams.blue.players.size,
    hasPassword: !!room.password
  }));
  res.json(rooms);
});

// Oda oluştur
app.post('/api/rooms/create', (req, res) => {
  const { name, map, mode, password, type } = req.body;
  
  const room = roomManager.createRoom({
    name,
    map,
    mode,
    password,
    type
  });
  
  res.json({
    id: room.id,
    code: room.code,
    name: room.name
  });
});

// Oyuncu ara
app.get('/api/search/player/:username', (req, res) => {
  const username = req.params.username.toLowerCase();
  const results = Array.from(db.players.values())
    .filter(p => p.username.toLowerCase().includes(username))
    .map(p => ({
      id: p.id,
      username: p.username,
      level: p.level,
      rank: p.rank
    }))
    .slice(0, 10);
  
  res.json(results);
});

// Rapor gönder
app.post('/api/report', (req, res) => {
  const { reporterId, reportedId, reason, description, evidence } = req.body;
  
  db.addReport({
    reporterId,
    reportedId,
    reason,
    description,
    evidence,
    timestamp: Date.now()
  });
  
  res.json({ success: true, message: 'Rapor alındı' });
});

// ==================== SOCKET.IO OLAYLARI ====================
io.on('connection', (socket) => {
  console.log(`🔌 Yeni bağlantı: ${socket.id} (Toplam: ${io.engine.clientsCount})`);
  
  let currentRoom = null;
  let playerData = null;
  
  // ========== KİMLİK DOĞRULAMA ==========
  socket.on('auth', async (data) => {
    try {
      const { telegramId, username, authToken } = data;
      
      // Anti-cheat kontrolü
      if (antiCheat.bannedPlayers.has(telegramId)) {
        socket.emit('auth:failed', { reason: 'BANNED' });
        socket.disconnect();
        return;
      }
      
      // Oyuncuyu bul veya oluştur
      let player = db.getPlayer(telegramId);
      if (!player) {
        player = db.createPlayer(telegramId, username);
      } else {
        player.lastSeen = Date.now();
        player.username = username; // Güncel username
      }
      
      playerData = {
        ...player,
        socketId: socket.id,
        connectedAt: Date.now()
      };
      
      socket.playerData = playerData;
      
      socket.emit('auth:success', {
        player: {
          id: player.id,
          username: player.username,
          level: player.level,
          xp: player.xp,
          xpNeeded: player.xpNeeded,
          stats: player.stats,
          inventory: player.inventory,
          settings: player.settings,
          rank: player.rank
        },
        server: {
          name: CONFIG.SERVER.NAME,
          version: CONFIG.SERVER.VERSION,
          players: io.engine.clientsCount,
          rooms: roomManager.rooms.size
        }
      });
      
      console.log(`✅ Kimlik doğrulandı: ${player.username} (${player.id})`);
      
    } catch (error) {
      console.error('❌ Kimlik doğrulama hatası:', error);
      socket.emit('auth:failed', { reason: 'SERVER_ERROR' });
    }
  });
  
  // ========== ODA İŞLEMLERİ ==========
  socket.on('room:join', async (data) => {
    try {
      const { roomId, password } = data;
      
      if (!playerData) {
        socket.emit('error', { code: 'NOT_AUTHENTICATED' });
        return;
      }
      
      // Anti-cheat kontrolü
      if (!antiCheat.checkPlayerActivity(socket.id, { type: 'join' })) {
        socket.emit('error', { code: 'ANTICHEAT_TRIGGERED' });
        return;
      }
      
      let room;
      if (roomId) {
        room = roomManager.rooms.get(roomId);
        if (!room) {
          socket.emit('room:join_failed', { reason: 'ROOM_NOT_FOUND' });
          return;
        }
        
        // Şifre kontrolü
        if (room.password && room.password !== password) {
          socket.emit('room:join_failed', { reason: 'WRONG_PASSWORD' });
          return;
        }
      } else {
        // Hızlı oyun - uygun oda bul
        room = roomManager.findAvailableRoom(data.preferences);
      }
      
      // Oyuncuyu odaya ekle
      const team = roomManager.addPlayerToRoom(room.id, playerData);
      
      if (!team) {
        socket.emit('room:join_failed', { reason: 'ROOM_FULL' });
        return;
      }
      
      socket.join(room.id);
      currentRoom = room.id;
      
      // Oda bilgilerini gönder
      socket.emit('room:joined', {
        roomId: room.id,
        roomName: room.name,
        map: room.map,
        mode: room.mode,
        team: team,
        players: Array.from(room.players.values()).map(p => ({
          id: p.id,
          username: p.username,
          team: p.team,
          health: p.health,
          isAlive: p.isAlive,
          kills: p.kills,
          deaths: p.deaths
        })),
        settings: room.settings,
        warmup: room.warmup,
        warmupEndTime: room.warmupEndTime,
        redScore: room.teams.red.score,
        blueScore: room.teams.blue.score,
        round: room.round
      });
      
      console.log(`🎮 ${playerData.username} odaya katıldı: ${room.id} (${team})`);
      
    } catch (error) {
      console.error('❌ Oda katılma hatası:', error);
      socket.emit('error', { code: 'INTERNAL_ERROR' });
    }
  });
  
  socket.on('room:leave', () => {
    if (currentRoom && playerData) {
      roomManager.removePlayerFromRoom(currentRoom, socket.id);
      socket.leave(currentRoom);
      currentRoom = null;
      
      socket.emit('room:left');
      console.log(`🚪 ${playerData.username} odadan ayrıldı`);
    }
  });
  
  socket.on('room:chat', async (data) => {
    try {
      const { message, channel } = data;
      
      if (!playerData || !currentRoom) return;
      
      const result = chat.sendMessage(channel || currentRoom, playerData, message);
      
      if (result.success) {
        io.to(currentRoom).emit('room:chat_message', {
          id: result.message.id,
          username: playerData.username,
          message: result.message.message,
          timestamp: result.message.timestamp,
          team: playerData.team
        });
      } else {
        socket.emit('room:chat_failed', result);
      }
      
    } catch (error) {
      console.error('❌ Sohbet hatası:', error);
    }
  });
  
  // ========== OYUN İÇİ OLAYLAR ==========
  socket.on('player:move', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { position, rotation, velocity } = data;
      
      // Anti-cheat hız kontrolü
      if (!antiCheat.checkPlayerActivity(socket.id, {
        type: 'move',
        position
      })) {
        return;
      }
      
      const room = roomManager.rooms.get(currentRoom);
      if (room) {
        const player = room.players.get(socket.id);
        if (player && player.isAlive) {
          player.position = position;
          player.rotation = rotation;
          
          // Hareketi diğer oyunculara gönder (kendine değil)
          socket.to(currentRoom).emit('player:moved', {
            id: socket.id,
            position,
            rotation,
            velocity
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Hareket hatası:', error);
    }
  });
  
  socket.on('player:shoot', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { targetId, hitZone, weapon, position, direction } = data;
      
      const room = roomManager.rooms.get(currentRoom);
      if (!room) return;
      
      // Atış istatistiklerini güncelle
      room.stats.totalShots++;
      const shooter = room.players.get(socket.id);
      if (shooter) {
        shooter.stats.shotsFired++;
      }
      
      // Anti-cheat kontrolü
      if (!antiCheat.checkPlayerActivity(socket.id, {
        type: 'shot',
        hitZone,
        targetId
      })) {
        return;
      }
      
      // Hasar hesapla
      const result = roomManager.handlePlayerDamage(
        room,
        socket.id,
        targetId,
        hitZone,
        weapon
      );
      
      if (result) {
        // Vuruş efektini herkese gönder
        io.to(currentRoom).emit('player:hit', {
          shooterId: socket.id,
          targetId,
          hitZone,
          damage: result.damage,
          remainingHealth: result.remainingHealth,
          position,
          direction
        });
        
        // Headshot kontrolü
        if (hitZone === 'head') {
          shooter.stats.headshots++;
        }
      }
      
    } catch (error) {
      console.error('❌ Atış hatası:', error);
    }
  });
  
  socket.on('player:reload', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { weapon } = data;
      
      socket.to(currentRoom).emit('player:reloading', {
        id: socket.id,
        weapon
      });
      
    } catch (error) {
      console.error('❌ Reload hatası:', error);
    }
  });
  
  socket.on('player:weapon_switch', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { weapon } = data;
      
      const room = roomManager.rooms.get(currentRoom);
      if (room) {
        const player = room.players.get(socket.id);
        if (player) {
          player.weapon = weapon;
          
          socket.to(currentRoom).emit('player:weapon_changed', {
            id: socket.id,
            weapon
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Silah değiştirme hatası:', error);
    }
  });
  
  socket.on('player:use_item', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { item, target } = data;
      
      io.to(currentRoom).emit('player:used_item', {
        id: socket.id,
        item,
        target
      });
      
    } catch (error) {
      console.error('❌ Item kullanım hatası:', error);
    }
  });
  
  socket.on('player:emote', (data) => {
    try {
      if (!playerData || !currentRoom) return;
      
      const { emote } = data;
      
      io.to(currentRoom).emit('player:emoted', {
        id: socket.id,
        username: playerData.username,
        emote
      });
      
    } catch (error) {
      console.error('❌ Emote hatası:', error);
    }
  });
  
  // ========== OYUNCU AYARLARI ==========
  socket.on('player:settings_update', (data) => {
    try {
      if (!playerData) return;
      
      const { settings } = data;
      
      const player = db.getPlayer(playerData.id);
      if (player) {
        player.settings = {
          ...player.settings,
          ...settings
        };
        
        socket.emit('player:settings_updated', player.settings);
      }
      
    } catch (error) {
      console.error('❌ Ayarlar güncelleme hatası:', error);
    }
  });
  
  socket.on('player:ready', () => {
    try {
      if (!playerData || !currentRoom) return;
      
      const room = roomManager.rooms.get(currentRoom);
      if (room) {
        const player = room.players.get(socket.id);
        if (player) {
          player.isReady = true;
          
          // Tüm oyuncular hazır mı kontrol et
          const allReady = Array.from(room.players.values()).every(p => p.isReady);
          if (allReady && room.players.size >= 2) {
            roomManager.startRoomCountdown(room);
          }
          
          io.to(currentRoom).emit('player:ready_changed', {
            id: socket.id,
            isReady: true
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Hazır durumu hatası:', error);
    }
  });
  
  // ========== ARKADAŞLIK SİSTEMİ ==========
  socket.on('friends:add', (data) => {
    try {
      if (!playerData) return;
      
      const { friendId } = data;
      const player = db.getPlayer(playerData.id);
      const friend = db.getPlayer(friendId);
      
      if (player && friend) {
        if (!player.friends.includes(friendId)) {
          player.friends.push(friendId);
          
          // Arkadaşa bildirim gönder (eğer online ise)
          const friendSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.playerData?.id === friendId);
          
          if (friendSocket) {
            friendSocket.emit('friends:request', {
              from: playerData.id,
              username: playerData.username
            });
          }
          
          socket.emit('friends:added', {
            id: friendId,
            username: friend.username
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Arkadaş ekleme hatası:', error);
    }
  });
  
  // ========== İSTATİSTİK VE BAŞARIMLAR ==========
  socket.on('stats:request', () => {
    try {
      if (!playerData) return;
      
      const player = db.getPlayer(playerData.id);
      if (player) {
        socket.emit('stats:data', {
          stats: player.stats,
          achievements: player.achievements || [],
          level: player.level,
          xp: player.xp,
          xpNeeded: player.xpNeeded,
          rank: player.rank
        });
      }
      
    } catch (error) {
      console.error('❌ İstatistik hatası:', error);
    }
  });
  
  socket.on('leaderboard:request', (data) => {
    try {
      const { page, limit } = data;
      const start = (page - 1) * limit;
      const end = start + limit;
      
      socket.emit('leaderboard:data', {
        page,
        total: db.leaderboard.length,
        players: db.leaderboard.slice(start, end)
      });
      
    } catch (error) {
      console.error('❌ Liderlik tablosu hatası:', error);
    }
  });
  
  // ========== BAĞLANTI KOPMASI ==========
  socket.on('disconnect', (reason) => {
    try {
      if (currentRoom && playerData) {
        roomManager.removePlayerFromRoom(currentRoom, socket.id);
        
        // Yeniden bağlanma için bekle
        setTimeout(() => {
          // Eğer yeniden bağlanmadıysa tamamen temizle
          const stillConnected = Array.from(io.sockets.sockets.values())
            .some(s => s.playerData?.id === playerData.id);
          
          if (!stillConnected && currentRoom) {
            const room = roomManager.rooms.get(currentRoom);
            if (room) {
              roomManager.removePlayerFromRoom(currentRoom, socket.id);
            }
          }
        }, 30000);
      }
      
      console.log(`🔌 Bağlantı koptu: ${socket.id} (${reason})`);
      
    } catch (error) {
      console.error('❌ Bağlantı kopması hatası:', error);
    }
  });
  
  // ========== YENİDEN BAĞLANMA ==========
  socket.on('reconnect', () => {
    try {
      console.log(`🔄 Yeniden bağlanıldı: ${socket.id}`);
      
      if (playerData && currentRoom) {
        socket.join(currentRoom);
        socket.emit('reconnect:success', {
          roomId: currentRoom,
          playerData
        });
      }
      
    } catch (error) {
      console.error('❌ Yeniden bağlanma hatası:', error);
    }
  });
});

// ==================== PERİYODİK GÖREVLER ====================

// Her saniye çalışan görevler
setInterval(() => {
  try {
    // İstatistikleri güncelle
    stats.updateGlobalStats();
    
    // Aktif odaları kontrol et
    for (const [id, room] of roomManager.rooms) {
      // Zaman aşımı kontrolü
      if (room.state === 'playing') {
        const elapsed = Date.now() - room.startedAt;
        if (elapsed > room.settings.roundTime) {
          // Süre doldu, round'u bitir
          roomManager.endRound(room, room.teams.red.score > room.teams.blue.score ? 'red' : 'blue');
        }
      }
      
      // Isınma süresi kontrolü
      if (room.warmup && Date.now() > room.warmupEndTime) {
        room.warmup = false;
        io.to(id).emit('game:warmup_ended');
      }
    }
    
  } catch (error) {
    console.error('❌ Periyodik görev hatası:', error);
  }
}, 1000);

// Her 5 saniyede ping gönder
setInterval(() => {
  try {
    io.emit('ping', Date.now());
  } catch (error) {
    console.error('❌ Ping hatası:', error);
  }
}, 5000);

// Her 20 saniyede sunucuyu uyanık tut
setInterval(() => {
  try {
    http.get(`http://localhost:${CONFIG.SERVER.PORT}/health`, (res) => {
      console.log(`💓 Heartbeat atıldı, durum: ${res.statusCode}`);
    }).on('error', (err) => {
      // Sessizce geç
    });
  } catch (error) {
    // Sessizce geç
  }
}, 20000);

// ==================== SUNUCUYU BAŞLAT ====================
server.listen(CONFIG.SERVER.PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ███████╗ █████╗ ███████╗██╗  ██╗██╗                   ║
║   ██╔════╝██╔══██╗██╔════╝██║ ██╔╝██║                   ║
║   ███████╗███████║█████╗  █████╔╝ ██║                   ║
║   ╚════██║██╔══██║██╔══╝  ██╔═██╗ ██║                   ║
║   ███████║██║  ██║██║     ██║  ██╗██║                   ║
║   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝                   ║
║                                                          ║
║   🚀 SAŞKİ OYUNU - PROFESYONEL SUNUCU                    ║
║   ════════════════════════════════════════════════════   ║
║                                                          ║
║   📡 Sunucu: ${CONFIG.SERVER.NAME}                           ║
║   🔗 Adres: https://saskioyunu-1-2d6i.onrender.com       ║
║   📌 Port: ${CONFIG.SERVER.PORT}                                      ║
║   📦 Versiyon: ${CONFIG.SERVER.VERSION}                                  ║
║   🌍 Ortam: ${CONFIG.SERVER.ENV}                                    ║
║                                                          ║
║   ⏰ Başlangıç: ${new Date().toLocaleString('tr-TR')}           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
  
  console.log('✅ Sistemler başlatıldı:');
  console.log('   📁 Veritabanı Yöneticisi');
  console.log('   🎮 Oda Yöneticisi');
  console.log('   🛡️ Anti-Cheat Sistemi');
  console.log('   💰 Ekonomi Sistemi');
  console.log('   💬 Sohbet Sistemi');
  console.log('   📊 İstatistik Sistemi');
  console.log('');
  console.log('🚀 Sunucu hazır!');
});

// ==================== HATA YAKALAMA ====================
process.on('uncaughtException', (error) => {
  console.error('❌ Yakalanmamış hata:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ İşlenmeyen red:', reason);
});

process.on('SIGTERM', () => {
  console.log('📥 SIGTERM sinyali alındı, sunucu kapatılıyor...');
  db.saveData();
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📥 SIGINT sinyali alındı, sunucu kapatılıyor...');
  db.saveData();
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});
