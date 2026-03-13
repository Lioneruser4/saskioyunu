const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '/')));

// Ping endpoint - Render uyumasın diye
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Oyun odaları ve oyuncular
const rooms = new Map();
const players = new Map();

// 25 saniyede bir kendine ping at
setInterval(() => {
    const https = require('https');
    const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || 'saskioyunu-1-2d6i.onrender.com';
    https.get(`https://${hostname}/ping`, (resp) => {
        console.log(`[${new Date().toLocaleTimeString()}] Ping atıldı - Sunucu canlı`);
    }).on('error', (err) => {
        console.log('Ping hatası:', err.message);
    });
}, 25000);

wss.on('connection', (ws, req) => {
    console.log('Yeni bağlantı:', req.socket.remoteAddress);
    
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Mesaj hatası:', error);
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

// 30 saniyede bir bağlantıları kontrol et
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            console.log('Yanıt vermeyen bağlantı kapatılıyor');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

function handleMessage(ws, data) {
    console.log('Gelen mesaj:', data.type);
    
    switch(data.type) {
        case 'login':
            handleLogin(ws, data);
            break;
        case 'createRoom':
            createRoom(ws, data);
            break;
        case 'joinRoom':
            joinRoom(ws, data);
            break;
        case 'listRooms':
            listRooms(ws);
            break;
        case 'playCard':
            playCard(ws, data);
            break;
        case 'takeCards':
            takeCards(ws, data);
            break;
        case 'pass':
            pass(ws, data);
            break;
        case 'reconnect':
            reconnectPlayer(ws, data);
            break;
        case 'playWithBot':
            playWithBot(ws, data);
            break;
    }
}

function handleLogin(ws, data) {
    const playerId = data.telegramId || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const player = {
        id: playerId,
        name: data.name || 'Guest',
        avatar: data.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'Guest')}&background=random`,
        ws: ws,
        roomId: null,
        lastSeen: Date.now(),
        isGuest: !data.telegramId,
        cards: []
    };
    
    players.set(playerId, player);
    ws.playerId = playerId;
    
    ws.send(JSON.stringify({
        type: 'loginSuccess',
        playerId: playerId,
        player: player
    }));
    
    console.log('Giriş yaptı:', player.name);
}

function createRoom(ws, data) {
    const player = players.get(ws.playerId);
    if (!player) return;
    
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const room = {
        id: roomId,
        name: data.roomName || `${player.name}'in Odası`,
        players: [player],
        status: 'waiting',
        gameState: null,
        afkTimer: null,
        createdAt: Date.now()
    };
    
    rooms.set(roomId, room);
    player.roomId = roomId;
    
    ws.send(JSON.stringify({
        type: 'roomCreated',
        roomId: roomId,
        room: room
    }));
    
    broadcastRooms();
    console.log('Oda kuruldu:', roomId);
}

function joinRoom(ws, data) {
    const player = players.get(ws.playerId);
    const room = rooms.get(data.roomId);
    
    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Oda bulunamadı' }));
        return;
    }
    
    if (room.players.length >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Oda dolu' }));
        return;
    }
    
    room.players.push(player);
    player.roomId = data.roomId;
    room.status = 'playing';
    
    // Oyunu başlat
    startGame(room);
    
    // Odadaki tüm oyunculara bildir
    broadcastToRoom(room.id, {
        type: 'gameStarted',
        gameState: room.gameState,
        players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
    });
    
    broadcastRooms();
    console.log('Oyuncu katıldı:', player.name, '-> Oda:', room.id);
}

function playWithBot(ws, data) {
    const player = players.get(ws.playerId);
    if (!player) return;
    
    const roomId = `bot_room_${Date.now()}`;
    const bot = {
        id: `bot_${Date.now()}`,
        name: 'Bot 🤖',
        avatar: 'https://ui-avatars.com/api/?name=Bot&background=ff0000',
        ws: null,
        isBot: true,
        cards: []
    };
    
    const room = {
        id: roomId,
        name: 'Bot ile Alıştırma',
        players: [player, bot],
        status: 'playing',
        gameState: null,
        isBotGame: true
    };
    
    rooms.set(roomId, room);
    player.roomId = roomId;
    
    startGame(room);
    
    ws.send(JSON.stringify({
        type: 'gameStarted',
        gameState: room.gameState,
        players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot }))
    }));
}

function startGame(room) {
    // Desteyi oluştur
    const deck = createDeck();
    const shuffledDeck = shuffle(deck);
    
    // Koz belirle
    const trump = shuffledDeck[0];
    
    // Kartları dağıt (her oyuncuya 6 kart)
    for (let i = 0; i < room.players.length; i++) {
        room.players[i].cards = shuffledDeck.splice(0, 6);
    }
    
    room.gameState = {
        deck: shuffledDeck,
        trump: trump,
        table: [],
        currentPlayer: room.players[0].id,
        lastMove: Date.now(),
        attacker: room.players[0].id,
        defender: room.players[1].id,
        beatenCards: []
    };
    
    console.log('Oyun başladı, Koz:', trump.value, trump.suit);
}

function handleDisconnect(ws) {
    const player = players.get(ws.playerId);
    if (!player) return;
    
    console.log('Bağlantı koptu:', player.name);
    player.lastSeen = Date.now();
    player.ws = null;
    
    // AFK timer başlat
    if (player.roomId) {
        const room = rooms.get(player.roomId);
        if (room) {
            setTimeout(() => {
                checkAFK(player.roomId, player.id);
            }, 20000);
        }
    }
}

function checkAFK(roomId, playerId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const player = players.get(playerId);
    if (player && !player.ws && Date.now() - player.lastSeen >= 20000) {
        // Oyuncu geri dönmedi
        const winner = room.players.find(p => p.id !== playerId);
        if (winner) {
            broadcastToRoom(roomId, {
                type: 'gameOver',
                winner: winner.id,
                reason: 'afk'
            });
        }
        
        // Oyuncuyu odadan çıkar
        room.players = room.players.filter(p => p.id !== playerId);
        player.roomId = null;
        
        if (room.players.length === 0) {
            rooms.delete(roomId);
        }
    }
}

function reconnectPlayer(ws, data) {
    const player = players.get(data.playerId);
    if (!player) return;
    
    console.log('Yeniden bağlandı:', player.name);
    player.ws = ws;
    player.lastSeen = Date.now();
    ws.playerId = data.playerId;
    
    if (player.roomId) {
        const room = rooms.get(player.roomId);
        if (room) {
            ws.send(JSON.stringify({
                type: 'reconnected',
                room: room,
                gameState: room.gameState,
                myCards: player.cards
            }));
        }
    }
}

function playCard(ws, data) {
    const player = players.get(ws.playerId);
    if (!player) return;
    
    const room = rooms.get(player.roomId);
    if (!room) return;
    
    // Kart oynama mantığı
    const cardIndex = player.cards.findIndex(c => c.suit === data.card.suit && c.value === data.card.value);
    if (cardIndex !== -1) {
        const playedCard = player.cards.splice(cardIndex, 1)[0];
        room.gameState.table.push({ card: playedCard, player: player.id });
        
        // Sırayı değiştir
        room.gameState.currentPlayer = room.players.find(p => p.id !== player.id).id;
        
        broadcastToRoom(room.id, {
            type: 'cardPlayed',
            card: playedCard,
            playerId: player.id,
            gameState: room.gameState
        });
    }
}

function broadcastRooms() {
    const roomsList = Array.from(rooms.values())
        .filter(r => r.status === 'waiting' && !r.isBotGame)
        .map(r => ({
            id: r.id,
            name: r.name,
            players: r.players.length,
            creator: r.players[0]?.name
        }));
    
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'roomsList',
                rooms: roomsList
            }));
        }
    });
}

function broadcastToRoom(roomId, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.players.forEach(player => {
        if (player.isBot) {
            // Bot mantığı
            setTimeout(() => handleBotMove(room), 1000);
            return;
        }
        
        const client = players.get(player.id)?.ws;
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function handleBotMove(room) {
    const bot = room.players.find(p => p.isBot);
    if (!bot || room.gameState.currentPlayer !== bot.id) return;
    
    // Basit bot mantığı - rastgele kart oyna
    if (bot.cards.length > 0) {
        const randomCard = bot.cards[Math.floor(Math.random() * bot.cards.length)];
        const cardIndex = bot.cards.findIndex(c => c.suit === randomCard.suit && c.value === randomCard.value);
        bot.cards.splice(cardIndex, 1);
        
        room.gameState.table.push({ card: randomCard, player: bot.id });
        room.gameState.currentPlayer = room.players.find(p => !p.isBot).id;
        
        broadcastToRoom(room.id, {
            type: 'cardPlayed',
            card: randomCard,
            playerId: bot.id,
            gameState: room.gameState
        });
    }
}

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ 
                suit, 
                value,
                id: `${value}${suit}`,
                isRed: suit === '♥' || suit === '♦'
            });
        }
    }
    return deck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('🚀 DURAK OYUNU SUNUCUSU BAŞLATILDI');
    console.log('='.repeat(50));
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Adres: http://localhost:${PORT}`);
    console.log(`⏰ Zaman: ${new Date().toLocaleString()}`);
    console.log('='.repeat(50));
});
