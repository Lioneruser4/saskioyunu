const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Statik dosyalar
app.use(express.static(__dirname));

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Render için health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Oyun sunucusu verileri
const rooms = new Map();
const players = new Map();
const games = new Map();
const connections = new Map();

// Oyun ayarları
const ROLE_EMOJIS = {
    citizen: '👨‍🌾',
    mafia: '🕵️',
    police: '👮',
    doctor: '👨‍⚕️'
};

const ROLE_NAMES = {
    citizen: 'Vatandaş',
    mafia: 'Mafia',
    police: 'Polis',
    doctor: 'Doktor'
};

// Oda ID oluştur
function generateRoomId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Oyuncu ID oluştur
function generatePlayerId() {
    return crypto.randomBytes(8).toString('hex');
}

// Bot oluştur
function createBot(roomId, role) {
    const botId = 'bot_' + crypto.randomBytes(4).toString('hex');
    return {
        id: botId,
        name: `Bot_${role.charAt(0).toUpperCase() + role.slice(1)}`,
        profilePic: `https://ui-avatars.com/api/?name=Bot${role.charAt(0).toUpperCase()}&background=7209b7&color=fff&size=100`,
        role: role,
        alive: true,
        isBot: true,
        roomId: roomId,
        votes: [],
        lastAction: Date.now()
    };
}

// Bot davranışı
function botAction(bot, game) {
    if (!bot.alive) return;
    
    const room = rooms.get(bot.roomId);
    if (!room || !room.game) return;
    
    setTimeout(() => {
        if (bot.role === 'mafia' && game.phase === 'night') {
            // Mafia bot: rastgele bir canlı vatandaşı hedefle
            const targets = game.players.filter(p => 
                p.alive && 
                p.role !== 'mafia' && 
                !p.isBot
            );
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                handleVote({
                    type: 'vote',
                    targetId: target.id,
                    voteType: 'kill'
                }, { userId: bot.id });
            }
        } else if (bot.role === 'police' && game.phase === 'night') {
            // Polis bot: şüpheli birini araştır
            const targets = game.players.filter(p => p.alive && !p.isBot);
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                handleVote({
                    type: 'vote',
                    targetId: target.id,
                    voteType: 'investigate'
                }, { userId: bot.id });
            }
        } else if (bot.role === 'doctor' && game.phase === 'night') {
            // Doktor bot: rastgele birini tedavi et (kendini de olabilir)
            const targets = game.players.filter(p => p.alive);
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                handleVote({
                    type: 'vote',
                    targetId: target.id,
                    voteType: 'heal'
                }, { userId: bot.id });
            }
        } else if (game.phase === 'day' && bot.alive) {
            // Gündüz: rastgele oy ver
            const targets = game.players.filter(p => p.alive && p.id !== bot.id);
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                handleVote({
                    type: 'vote',
                    targetId: target.id,
                    voteType: 'lynch'
                }, { userId: bot.id });
            }
        }
    }, Math.random() * 3000 + 2000); // 2-5 saniye gecikme
}

// Oda oluştur
function createRoom(ownerId, settings) {
    const roomId = generateRoomId();
    const room = {
        id: roomId,
        ownerId: ownerId,
        players: [],
        settings: settings,
        status: 'waiting',
        createdAt: Date.now(),
        game: null
    };
    
    rooms.set(roomId, room);
    return room;
}

// Oyun başlat
function startGame(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.players.length < 4) return null;
    
    const players = [...room.players];
    
    // Rolleri dağıt
    const roles = [];
    
    // Mafialar
    for (let i = 0; i < room.settings.mafiaCount; i++) {
        roles.push('mafia');
    }
    
    // Polisler
    for (let i = 0; i < room.settings.policeCount; i++) {
        roles.push('police');
    }
    
    // Doktorlar
    for (let i = 0; i < room.settings.doctorCount; i++) {
        roles.push('doctor');
    }
    
    // Kalanlar vatandaş
    while (roles.length < players.length) {
        roles.push('citizen');
    }
    
    // Rolleri karıştır ve dağıt
    shuffleArray(roles);
    
    players.forEach((player, index) => {
        player.role = roles[index];
        player.alive = true;
        player.votes = [];
        
        // Oyuncuya rolünü bildir
        const ws = connections.get(player.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'role_assigned',
                role: player.role
            }));
        }
    });
    
    const game = {
        roomId: roomId,
        players: players,
        phase: 'day',
        dayNumber: 1,
        votes: {},
        nightActions: {},
        killedTonight: null,
        healedTonight: null,
        investigatedTonight: [],
        startedAt: Date.now()
    };
    
    room.game = game;
    room.status = 'playing';
    games.set(roomId, game);
    
    // Tüm oyunculara oyunun başladığını bildir
    broadcastToRoom(roomId, {
        type: 'game_start',
        game: {
            role: players.find(p => p.id === room.ownerId)?.role || 'citizen',
            players: players.map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                alive: p.alive,
                profilePic: p.profilePic
            }))
        }
    });
    
    // Botları başlat
    players.filter(p => p.isBot).forEach(bot => {
        botAction(bot, game);
    });
    
    return game;
}

// Dizi karıştır
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Oda içi yayın
function broadcastToRoom(roomId, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.players.forEach(player => {
        const ws = connections.get(player.id);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

// Oyuncuya gönder
function sendToPlayer(playerId, message) {
    const ws = connections.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// Lobi güncelle
function updateLobby() {
    const lobbyData = Array.from(rooms.values()).map(room => ({
        id: room.id,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            profilePic: p.profilePic
        })),
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings,
        status: room.status
    }));
    
    connections.forEach((ws, playerId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'lobby_update',
                rooms: lobbyData
            }));
        }
    });
}

// Faz değiştir
function changePhase(roomId, newPhase) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    game.phase = newPhase;
    
    if (newPhase === 'night') {
        game.nightActions = {};
        game.killedTonight = null;
        game.healedTonight = null;
        game.investigatedTonight = [];
        
        // Gece başında tüm oyları temizle
        game.players.forEach(player => {
            player.votes = [];
        });
    } else if (newPhase === 'day') {
        game.dayNumber++;
        
        // Gece aksiyonlarını işle
        processNightActions(roomId);
        
        // Tüm oyları temizle
        game.votes = {};
    }
    
    broadcastToRoom(roomId, {
        type: 'phase_change',
        phase: newPhase,
        dayNumber: game.dayNumber
    });
    
    // Botları tetikle
    game.players.filter(p => p.isBot && p.alive).forEach(bot => {
        botAction(bot, game);
    });
}

// Gece aksiyonlarını işle
function processNightActions(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    
    // Mafiaların oylarını say
    const mafiaVotes = {};
    game.players
        .filter(p => p.alive && p.role === 'mafia')
        .forEach(mafia => {
            mafia.votes.forEach(vote => {
                if (vote.type === 'kill') {
                    mafiaVotes[vote.targetId] = (mafiaVotes[vote.targetId] || 0) + 1;
                }
            });
        });
    
    // En çok oy alanı bul
    let maxVotes = 0;
    let targetId = null;
    Object.entries(mafiaVotes).forEach(([id, votes]) => {
        if (votes > maxVotes) {
            maxVotes = votes;
            targetId = id;
        }
    });
    
    // Doktor oylarını say
    const doctorVotes = {};
    game.players
        .filter(p => p.alive && p.role === 'doctor')
        .forEach(doctor => {
            doctor.votes.forEach(vote => {
                if (vote.type === 'heal') {
                    doctorVotes[vote.targetId] = (doctorVotes[vote.targetId] || 0) + 1;
                }
            });
        });
    
    // Doktorun hedefi
    let doctorTargetId = null;
    let maxDoctorVotes = 0;
    Object.entries(doctorVotes).forEach(([id, votes]) => {
        if (votes > maxDoctorVotes) {
            maxDoctorVotes = votes;
            doctorTargetId = id;
        }
    });
    
    // Öldürme işlemi
    if (targetId && targetId !== doctorTargetId) {
        const target = game.players.find(p => p.id === targetId);
        if (target && target.alive) {
            target.alive = false;
            game.killedTonight = targetId;
            
            broadcastToRoom(roomId, {
                type: 'vote_result',
                voteType: 'kill',
                targetName: target.name,
                healed: false
            });
        }
    } else if (targetId && targetId === doctorTargetId) {
        // Doktor tedavi etti
        game.healedTonight = targetId;
        
        const target = game.players.find(p => p.id === targetId);
        broadcastToRoom(roomId, {
            type: 'vote_result',
            voteType: 'kill',
            targetName: target.name,
            healed: true
        });
    }
    
    // Polis araştırmaları
    game.players
        .filter(p => p.alive && p.role === 'police')
        .forEach(police => {
            police.votes.forEach(vote => {
                if (vote.type === 'investigate') {
                    const target = game.players.find(p => p.id === vote.targetId);
                    if (target) {
                        sendToPlayer(police.id, {
                            type: 'vote_result',
                            voteType: 'investigate',
                            targetName: target.name,
                            isMafia: target.role === 'mafia'
                        });
                    }
                }
            });
        });
    
    // Oyun bitti mi kontrol et
    checkGameEnd(roomId);
}

// Oylama işle
function handleVote(data, ws) {
    const playerId = ws.userId;
    const roomId = ws.roomId;
    
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    const player = game.players.find(p => p.id === playerId);
    if (!player || !player.alive) return;
    
    // Oy kaydet
    player.votes.push({
        type: data.voteType,
        targetId: data.targetId,
        timestamp: Date.now()
    });
    
    // Tüm oylar tamam mı kontrol et
    checkVotesComplete(roomId, data.voteType);
}

// Oylar tamam mı kontrol et
function checkVotesComplete(roomId, voteType) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    
    let requiredPlayers = [];
    if (voteType === 'kill') {
        requiredPlayers = game.players.filter(p => p.alive && p.role === 'mafia');
    } else if (voteType === 'heal') {
        requiredPlayers = game.players.filter(p => p.alive && p.role === 'doctor');
    } else if (voteType === 'investigate') {
        requiredPlayers = game.players.filter(p => p.alive && p.role === 'police');
    } else if (voteType === 'lynch') {
        requiredPlayers = game.players.filter(p => p.alive);
    }
    
    // Botların oylarını otomatik ekle
    requiredPlayers.filter(p => p.isBot && p.votes.length === 0).forEach(bot => {
        botAction(bot, game);
    });
    
    // Tüm oylar verildi mi kontrol et
    const allVoted = requiredPlayers.every(p => 
        p.votes.some(v => v.type === voteType)
    );
    
    if (allVoted) {
        if (voteType === 'lynch') {
            processLynchVote(roomId);
        } else if (game.phase === 'night') {
            // Gece fazını bitir
            setTimeout(() => {
                changePhase(roomId, 'day');
            }, 3000);
        }
    }
}

// Linç oylaması
function processLynchVote(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    
    // Tüm oyları say
    const voteCount = {};
    game.players
        .filter(p => p.alive)
        .forEach(player => {
            const lynchVote = player.votes.find(v => v.type === 'lynch');
            if (lynchVote) {
                voteCount[lynchVote.targetId] = (voteCount[lynchVote.targetId] || 0) + 1;
            }
        });
    
    // En çok oy alanı bul
    let maxVotes = 0;
    let targetId = null;
    Object.entries(voteCount).forEach(([id, votes]) => {
        if (votes > maxVotes) {
            maxVotes = votes;
            targetId = id;
        }
    });
    
    // Beraberlik kontrolü
    const tiedPlayers = Object.entries(voteCount)
        .filter(([id, votes]) => votes === maxVotes)
        .map(([id]) => id);
    
    if (tiedPlayers.length > 1) {
        // Beraberlik: kimse asılmaz
        broadcastToRoom(roomId, {
            type: 'vote_result',
            voteType: 'lynch',
            targetName: 'Hiç kimse',
            revealedRole: null
        });
    } else if (targetId) {
        // Birini as
        const target = game.players.find(p => p.id === targetId);
        if (target && target.alive) {
            target.alive = false;
            
            broadcastToRoom(roomId, {
                type: 'vote_result',
                voteType: 'lynch',
                targetName: target.name,
                revealedRole: target.role === 'mafia' ? 'Mafia çıktı!' : 'Masum çıktı!'
            });
            
            // Oyun bitti mi kontrol et
            checkGameEnd(roomId);
        }
    }
}

// Oyun bitti mi kontrol et
function checkGameEnd(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    
    const alivePlayers = game.players.filter(p => p.alive);
    const aliveMafias = alivePlayers.filter(p => p.role === 'mafia');
    const aliveCivilians = alivePlayers.filter(p => p.role !== 'mafia');
    
    if (aliveMafias.length === 0) {
        // Vatandaşlar kazandı
        endGame(roomId, 'citizens');
    } else if (aliveMafias.length >= aliveCivilians.length) {
        // Mafialar kazandı
        endGame(roomId, 'mafia');
    }
}

// Oyunu bitir
function endGame(roomId, winner) {
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    
    const game = room.game;
    
    broadcastToRoom(roomId, {
        type: 'game_over',
        winner: winner,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            alive: p.alive,
            profilePic: p.profilePic
        }))
    });
    
    // Oyun durumunu sıfırla ama odayı açık tut
    room.game = null;
    room.status = 'waiting';
    
    // Oyuncuların rollerini sıfırla
    room.players.forEach(player => {
        player.role = null;
        player.alive = true;
        player.votes = [];
    });
    
    games.delete(roomId);
}

// WebSocket bağlantıları
wss.on('connection', (ws, req) => {
    console.log('Yeni WebSocket bağlantısı');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(data, ws);
        } catch (error) {
            console.error('Mesaj parse hatası:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket bağlantısı kapandı');
        
        // Bağlantıyı temizle
        if (ws.userId) {
            connections.delete(ws.userId);
            
            // Oyuncuyu odadan çıkar
            if (ws.roomId) {
                const room = rooms.get(ws.roomId);
                if (room) {
                    room.players = room.players.filter(p => p.id !== ws.userId);
                    
                    // Oda boşsa sil
                    if (room.players.length === 0) {
                        rooms.delete(ws.roomId);
                        games.delete(ws.roomId);
                    } else {
                        // Odadaki diğer oyunculara bildir
                        broadcastToRoom(ws.roomId, {
                            type: 'room_update',
                            room: {
                                id: room.id,
                                players: room.players,
                                ownerId: room.ownerId,
                                settings: room.settings,
                                status: room.status
                            }
                        });
                        
                        // Sahip çıktıysa yeni sahip seç
                        if (room.ownerId === ws.userId && room.players.length > 0) {
                            room.ownerId = room.players[0].id;
                        }
                        
                        updateLobby();
                    }
                }
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket hatası:', error);
    });
});

// Mesaj işleme
function handleMessage(data, ws) {
    switch (data.type) {
        case 'auth':
            handleAuth(data, ws);
            break;
            
        case 'get_lobby':
            sendLobbyUpdate(ws);
            break;
            
        case 'create_room':
            handleCreateRoom(data, ws);
            break;
            
        case 'join_room':
            handleJoinRoom(data, ws);
            break;
            
        case 'leave_room':
            handleLeaveRoom(ws);
            break;
            
        case 'start_game':
            handleStartGame(ws);
            break;
            
        case 'vote':
            handleVote(data, ws);
            break;
            
        case 'chat':
            handleChat(data, ws);
            break;
            
        case 'private_chat':
            handlePrivateChat(data, ws);
            break;
            
        case 'kick_player':
            handleKickPlayer(data, ws);
            break;
            
        case 'add_bot':
            handleAddBot(data, ws);
            break;
            
        case 'start_practice':
            handleStartPractice(data, ws);
            break;
            
        case 'ping':
            // Ping cevabı
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
    }
}

// Kimlik doğrulama
function handleAuth(data, ws) {
    ws.userId = data.userId;
    connections.set(data.userId, ws);
    
    ws.send(JSON.stringify({
        type: 'auth_success',
        userId: data.userId
    }));
}

// Lobi güncellemesi gönder
function sendLobbyUpdate(ws) {
    const lobbyData = Array.from(rooms.values()).map(room => ({
        id: room.id,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            profilePic: p.profilePic
        })),
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings,
        status: room.status
    }));
    
    ws.send(JSON.stringify({
        type: 'lobby_update',
        rooms: lobbyData
    }));
}

// Oda oluştur
function handleCreateRoom(data, ws) {
    if (!ws.userId) return;
    
    const room = createRoom(ws.userId, data.settings);
    
    // Oyuncuyu odaya ekle
    const player = {
        id: ws.userId,
        name: data.userName || 'Oyuncu',
        profilePic: data.profilePic || 'https://ui-avatars.com/api/?name=Oyuncu&background=4361ee&color=fff&size=100',
        roomId: room.id,
        role: null,
        alive: true,
        votes: []
    };
    
    room.players.push(player);
    ws.roomId = room.id;
    
    ws.send(JSON.stringify({
        type: 'room_joined',
        room: {
            id: room.id,
            players: room.players,
            ownerId: room.ownerId,
            settings: room.settings,
            status: room.status
        }
    }));
    
    updateLobby();
}

// Odaya katıl
function handleJoinRoom(data, ws) {
    if (!ws.userId) return;
    
    const room = rooms.get(data.roomId);
    if (!room || room.status !== 'waiting' || room.players.length >= room.settings.maxPlayers) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Odaya katılamadınız'
        }));
        return;
    }
    
    // Oyuncuyu odaya ekle
    const player = {
        id: ws.userId,
        name: data.userName || 'Oyuncu',
        profilePic: data.profilePic || 'https://ui-avatars.com/api/?name=Oyuncu&background=4361ee&color=fff&size=100',
        roomId: room.id,
        role: null,
        alive: true,
        votes: []
    };
    
    room.players.push(player);
    ws.roomId = room.id;
    
    // Katılan oyuncuya bilgi gönder
    ws.send(JSON.stringify({
        type: 'room_joined',
        room: {
            id: room.id,
            players: room.players,
            ownerId: room.ownerId,
            settings: room.settings,
            status: room.status
        }
    }));
    
    // Odadaki diğer oyunculara bildir
    broadcastToRoom(room.id, {
        type: 'room_update',
        room: {
            id: room.id,
            players: room.players,
            ownerId: room.ownerId,
            settings: room.settings,
            status: room.status
        }
    });
    
    updateLobby();
}

// Odadan çık
function handleLeaveRoom(ws) {
    if (!ws.userId || !ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room) return;
    
    // Oyuncuyu çıkar
    room.players = room.players.filter(p => p.id !== ws.userId);
    
    // Oda boşsa sil
    if (room.players.length === 0) {
        rooms.delete(room.id);
        games.delete(room.id);
    } else {
        // Sahip çıktıysa yeni sahip seç
        if (room.ownerId === ws.userId) {
            room.ownerId = room.players[0].id;
        }
        
        // Odadaki diğer oyunculara bildir
        broadcastToRoom(room.id, {
            type: 'room_update',
            room: {
                id: room.id,
                players: room.players,
                ownerId: room.ownerId,
                settings: room.settings,
                status: room.status
            }
        });
    }
    
    ws.roomId = null;
    updateLobby();
}

// Oyun başlat
function handleStartGame(ws) {
    if (!ws.userId || !ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room || room.ownerId !== ws.userId || room.players.length < 4) return;
    
    startGame(room.id);
}

// Sohbet mesajı
function handleChat(data, ws) {
    if (!ws.userId || !ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room) return;
    
    const player = room.players.find(p => p.id === ws.userId);
    if (!player) return;
    
    broadcastToRoom(room.id, {
        type: 'chat_message',
        playerId: player.id,
        name: player.name,
        profilePic: player.profilePic,
        message: data.message,
        isDiscussion: data.isDiscussion || false
    });
}

// Özel sohbet
function handlePrivateChat(data, ws) {
    if (!ws.userId || !ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room || !room.game) return;
    
    const player = room.players.find(p => p.id === ws.userId);
    if (!player) return;
    
    // Mafia sohbeti veya rol bazlı özel sohbet
    const targetRole = data.toRole || player.role;
    
    room.players
        .filter(p => p.role === targetRole && p.alive)
        .forEach(targetPlayer => {
            const targetWs = connections.get(targetPlayer.id);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify({
                    type: 'private_chat',
                    playerId: player.id,
                    name: player.name,
                    profilePic: player.profilePic,
                    message: data.message,
                    toRole: targetRole
                }));
            }
        });
}

// Oyuncu at
function handleKickPlayer(data, ws) {
    if (!ws.userId || !ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room || room.ownerId !== ws.userId) return;
    
    const targetPlayer = room.players.find(p => p.id === data.playerId);
    if (!targetPlayer) return;
    
    // Oyuncuyu çıkar
    room.players = room.players.filter(p => p.id !== data.playerId);
    
    // Oyuncuya bildir
    const targetWs = connections.get(data.playerId);
    if (targetWs) {
        targetWs.send(JSON.stringify({
            type: 'player_kicked',
            playerId: data.playerId
        }));
        
        targetWs.roomId = null;
    }
    
    // Odadaki diğer oyunculara bildir
    broadcastToRoom(room.id, {
        type: 'room_update',
        room: {
            id: room.id,
            players: room.players,
            ownerId: room.ownerId,
            settings: room.settings,
            status: room.status
        }
    });
    
    updateLobby();
}

// Bot ekle
function handleAddBot(data, ws) {
    if (!ws.roomId) return;
    
    const room = rooms.get(ws.roomId);
    if (!room || room.players.length >= room.settings.maxPlayers) return;
    
    const bot = createBot(room.id, data.role);
    room.players.push(bot);
    
    broadcastToRoom(room.id, {
        type: 'room_update',
        room: {
            id: room.id,
            players: room.players,
            ownerId: room.ownerId,
            settings: room.settings,
            status: room.status
        }
    });
    
    updateLobby();
}

// Alıştırma modu
function handleStartPractice(data, ws) {
    if (!ws.userId) return;
    
    // Özel alıştırma odası oluştur
    const roomId = 'practice_' + ws.userId;
    const room = {
        id: roomId,
        ownerId: ws.userId,
        players: [],
        settings: {
            mafiaCount: 2,
            policeCount: 1,
            doctorCount: 1,
            maxPlayers: 10
        },
        status: 'waiting',
        game: null
    };
    
    rooms.set(roomId, room);
    ws.roomId = roomId;
    
    // Oyuncuyu ekle
    const player = {
        id: ws.userId,
        name: data.userName || 'Oyuncu',
        profilePic: data.profilePic || 'https://ui-avatars.com/api/?name=Oyuncu&background=4361ee&color=fff&size=100',
        roomId: roomId,
        role: null,
        alive: true,
        votes: []
    };
    
    room.players.push(player);
    
    // Botlar ekle
    const bots = [
        createBot(roomId, 'citizen'),
        createBot(roomId, 'citizen'),
        createBot(roomId, 'mafia'),
        createBot(roomId, 'police'),
        createBot(roomId, 'doctor')
    ];
    
    bots.forEach(bot => room.players.push(bot));
    
    // Oyunu başlat
    startGame(roomId);
    
    // Oyuncuya istediği rolü ata
    const game = room.game;
    const playerInGame = game.players.find(p => p.id === ws.userId);
    if (playerInGame) {
        playerInGame.role = data.role || 'citizen';
        
        ws.send(JSON.stringify({
            type: 'role_assigned',
            role: playerInGame.role
        }));
    }
}

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
    
    // Render uyumasın diye periyodik ping
    setInterval(() => {
        console.log('Sunucu aktif...');
    }, 60000);
});
