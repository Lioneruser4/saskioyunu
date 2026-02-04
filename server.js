const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const STATE_FILE = path.join(__dirname, 'game_state.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Keep-alive ping endpoint
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

// Game state
const rooms = new Map();
const users = new Map();
const connections = new Map();
let roomCounter = 1;

// Load state from file
try {
    if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        roomCounter = data.roomCounter || 1;
        if (data.users) {
            data.users.forEach(([k, v]) => users.set(k, v));
        }
        // Room reconstruction will happen below Room class definition
    }
} catch (e) {
    console.error('State load error:', e);
}

function saveState() {
    try {
        const data = {
            roomCounter,
            users: Array.from(users.entries()),
            rooms: Array.from(rooms.values()).map(r => ({
                code: r.code,
                name: r.name,
                password: r.password,
                config: r.config,
                host: r.host,
                players: r.players,
                gameStarted: r.gameStarted,
                day: r.day,
                phase: r.phase,
                alivePlayers: r.alivePlayers,
                deadPlayers: r.deadPlayers,
                roles: r.roles,
                votes: r.votes,
                mafiaVotes: r.mafiaVotes,
                policeCheck: r.policeCheck,
                doctorSave: r.doctorSave,
                mafiaChat: r.mafiaChat,
                isTraining: r.isTraining
            }))
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
    } catch (e) {
        console.error('State save error:', e);
    }
}

// Room class
class Room {
    constructor(code, config, host, name = null, password = null) {
        this.code = code;
        this.name = name || `Mafia Otağı ${code}`;
        this.password = password;
        this.config = config;
        this.host = host;
        this.players = [];
        this.gameStarted = false;
        this.gameState = null;
        this.day = 1;
        this.phase = 'day';
        this.alivePlayers = [];
        this.deadPlayers = [];
        this.roles = {};
        this.votes = {};
        this.mafiaVotes = {};
        this.policeCheck = null;
        this.doctorSave = null;
        this.mafiaChat = [];
        this.phaseEndTime = null;
        this.phaseTimeoutId = null;
    }

    clearPhaseTimeout() {
        if (this.phaseTimeoutId) {
            clearTimeout(this.phaseTimeoutId);
            this.phaseTimeoutId = null;
        }
    }

    addPlayer(player) {
        if (!this.players.find(p => p.id === player.id)) {
            this.players.push(player);
        }
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        if (this.players.length === 0) {
            return true; // Room should be deleted
        }
        if (this.host === playerId && this.players.length > 0) {
            this.host = this.players[0].id;
        }
        return false;
    }

    canStart() {
        const total = this.config.mafia + this.config.police + this.config.doctor + this.config.citizen;
        return this.players.length === total;
    }

    assignRoles() {
        const roles = [];
        for (let i = 0; i < this.config.mafia; i++) roles.push('mafia');
        for (let i = 0; i < this.config.police; i++) roles.push('police');
        for (let i = 0; i < this.config.doctor; i++) roles.push('doctor');
        for (let i = 0; i < this.config.citizen; i++) roles.push('citizen');

        // Shuffle roles
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        this.players.forEach((player, index) => {
            this.roles[player.id] = roles[index];
        });

        this.alivePlayers = [...this.players];
    }

    startGame() {
        this.gameStarted = true;
        this.assignRoles();
        this.phase = 'night';
        this.day = 1;
    }

    getMafiaPlayers() {
        return this.alivePlayers.filter(p => this.roles[p.id] === 'mafia');
    }

    getCitizenPlayers() {
        return this.alivePlayers.filter(p => this.roles[p.id] !== 'mafia');
    }

    processNightActions() {
        const log = [];

        // Process mafia kill
        const mafiaTarget = this.getMostVoted(this.mafiaVotes);
        let killed = null;

        if (mafiaTarget && mafiaTarget !== this.doctorSave) {
            killed = mafiaTarget;
            this.alivePlayers = this.alivePlayers.filter(p => p.id !== killed);
            const killedPlayer = this.players.find(p => p.id === killed);
            this.deadPlayers.push(killedPlayer);
            log.push(`${killedPlayer.name} gecə öldürüldü.`);
        } else if (mafiaTarget && mafiaTarget === this.doctorSave) {
            const savedPlayer = this.players.find(p => p.id === this.doctorSave);
            log.push(`Mafia ${savedPlayer.name}-i öldürməyə çalışdı, amma doktor onu xilas etdi!`);
        }

        // Reset night actions
        this.mafiaVotes = {};
        this.policeCheck = null;
        this.doctorSave = null;
        this.mafiaChat = [];

        return log;
    }

    processDayVoting() {
        const log = [];
        const eliminated = this.getMostVoted(this.votes);

        if (eliminated) {
            this.alivePlayers = this.alivePlayers.filter(p => p.id !== eliminated);
            const eliminatedPlayer = this.players.find(p => p.id === eliminated);
            this.deadPlayers.push(eliminatedPlayer);
            log.push(`${eliminatedPlayer.name} səsvermə ilə oyundan çıxarıldı. Rolu: ${this.getRoleName(this.roles[eliminated])}`);
        }

        this.votes = {};
        return log;
    }

    getMostVoted(votes) {
        const voteCounts = {};
        Object.values(votes).forEach(targetId => {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        });

        let maxVotes = 0;
        let target = null;
        Object.entries(voteCounts).forEach(([playerId, count]) => {
            if (count > maxVotes) {
                maxVotes = count;
                target = playerId;
            }
        });

        return target;
    }

    checkWinCondition() {
        const mafiaCount = this.getMafiaPlayers().length;
        const citizenCount = this.getCitizenPlayers().length;

        if (mafiaCount === 0) {
            return 'citizens';
        }
        if (mafiaCount >= citizenCount) {
            return 'mafia';
        }
        return null;
    }

    getRoleName(role) {
        const names = {
            mafia: 'Mafia',
            police: 'Polis',
            doctor: 'Doktor',
            citizen: 'Vətəndaş'
        };
        return names[role] || role;
    }

    toJSON() {
        return {
            code: this.code,
            name: this.name,
            hasPassword: !!this.password,
            config: this.config,
            host: this.host,
            players: this.players,
            gameStarted: this.gameStarted
        };
    }
}

// Reconstruct rooms from loaded state
try {
    if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (data.rooms) {
            data.rooms.forEach(roomData => {
                const room = new Room(roomData.code, roomData.config, roomData.host, roomData.name, roomData.password);
                Object.assign(room, roomData);
                rooms.set(room.code, room);
            });
        }
    }
} catch (e) {
    console.error('Room reconstruction error:', e);
}

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    saveState();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    saveState();
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');
    let userId = null;
    let isAlive = true;

    // Heartbeat
    ws.on('pong', () => {
        isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (userId) {
            handleDisconnect(userId);
        }
    });

    function handleMessage(ws, message) {
        const { type, data } = message;

        switch (type) {
            case 'auth':
                userId = data.id;
                users.set(userId, data);
                connections.set(userId, ws);
                sendToClient(ws, 'auth', { success: true });
                break;

            case 'getRooms':
                const roomList = Array.from(rooms.values())
                    .filter(room => !room.gameStarted && room.config)
                    .map(room => room.toJSON());
                sendToClient(ws, 'roomList', roomList);
                break;

            case 'autoJoin':
                handleAutoJoin(userId);
                break;

            case 'joinRoom':
                handleJoinRoom(userId, data.code, data.password);
                break;

            case 'createRoom':
                handleCreateRoom(userId, data);
                break;

            case 'leaveRoom':
                handleLeaveRoom(userId);
                break;

            case 'kickPlayer':
                handleKickPlayer(userId, data.playerId);
                break;

            case 'startGame':
                handleStartGame(userId);
                break;

            case 'mafiaVote':
                handleMafiaVote(userId, data.targetId);
                break;

            case 'policeCheck':
                handlePoliceCheck(userId, data.targetId);
                break;

            case 'doctorSave':
                handleDoctorSave(userId, data.targetId);
                break;

            case 'vote':
                handleVote(userId, data.targetId);
                break;

            case 'mafiaChat':
                handleMafiaChat(userId, data.message);
                break;

            case 'startTraining':
                handleStartTraining(userId, data);
                break;

            case 'syncState':
                handleSyncState(userId);
                break;

            case 'ping':
                sendToClient(ws, 'pong');
                break;
        }
    }
});

function handleAutoJoin(userId) {
    // Find available room (skip password protected and full rooms)
    for (const room of rooms.values()) {
        if (!room.gameStarted && !room.password && room.players.length < getTotalPlayers(room.config)) {
            handleJoinRoom(userId, room.code);
            return;
        }
    }

    // Create new room if no available
    const config = {
        mafia: 2,
        police: 1,
        doctor: 1,
        citizen: 4
    };
    handleCreateRoom(userId, { config });
}

function handleJoinRoom(userId, code, password = null) {
    const room = rooms.get(code);
    if (!room) {
        sendError(userId, 'Otaq tapılmadı');
        return;
    }

    if (room.password && room.password !== password) {
        sendError(userId, 'Şifrə yanlışdır');
        return;
    }

    if (room.gameStarted) {
        sendError(userId, 'Oyun artıq başlayıb');
        return;
    }

    const totalPlayers = getTotalPlayers(room.config);
    if (room.players.length >= totalPlayers) {
        sendError(userId, 'Otaq doludur');
        return;
    }

    const user = users.get(userId);
    room.addPlayer(user);

    sendToClient(connections.get(userId), 'roomJoined', room.toJSON());
    broadcastToRoom(room, 'roomUpdate', room.toJSON());
    saveState();
}

function handleCreateRoom(userId, data) {
    const code = generateRoomCode();
    const config = data.config || data; // Fallback if data is config itself
    const name = data.name;
    const password = data.password;

    const roomName = name || `Mafia Otağı ${roomCounter++}`;
    const room = new Room(code, config, userId, roomName, password);
    const user = users.get(userId);
    room.addPlayer(user);

    rooms.set(code, room);
    sendToClient(connections.get(userId), 'roomJoined', room.toJSON());
    saveState();
}

function handleLeaveRoom(userId) {
    const room = findUserRoom(userId);
    if (room) {
        const shouldDelete = room.removePlayer(userId);
        if (shouldDelete) {
            rooms.delete(room.code);
        } else {
            broadcastToRoom(room, 'roomUpdate', room.toJSON());
        }
        saveState();
    }
}

function handleKickPlayer(userId, playerId) {
    const room = findUserRoom(userId);
    if (room && room.host === userId) {
        room.removePlayer(playerId);
        sendToClient(connections.get(playerId), 'kicked', {});
        broadcastToRoom(room, 'roomUpdate', room.toJSON());
    }
}

function handleStartGame(userId) {
    const room = findUserRoom(userId);
    if (!room || room.host !== userId) {
        sendError(userId, 'Yalnız otaq sahibi oyunu başlada bilər');
        return;
    }

    if (!room.canStart()) {
        sendError(userId, 'Oyunu başlatmaq üçün bütün oyunçular gəlməlidir');
        return;
    }

    room.startGame();

    // Send role to each player
    room.players.forEach(player => {
        const gameData = {
            phase: room.phase,
            day: room.day,
            myRole: room.roles[player.id],
            alivePlayers: room.alivePlayers,
            log: []
        };
        sendToClient(connections.get(player.id), 'gameStarted', gameData);
    });

    // Start night phase
    saveState();
    setTimeout(() => {
        startNightPhase(room);
    }, 5000);
}

function startNightPhase(room) {
    room.phase = 'night';

    room.players.forEach(player => {
        if (room.alivePlayers.find(p => p.id === player.id)) {
            const nightData = {
                phase: 'night',
                day: room.day,
                myRole: room.roles[player.id],
                alivePlayers: room.alivePlayers
            };
            sendToClient(connections.get(player.id), 'nightPhase', nightData);
        }
    });

    // Simulate bot actions if training mode
    if (room.isTraining) {
        simulateBotActions(room);
    }

    // Auto-advance after 60 seconds
    saveState();
    room.phaseEndTime = Date.now() + 60000;
    room.clearPhaseTimeout();
    room.phaseTimeoutId = setTimeout(() => {
        if (room.phase === 'night') {
            startDayPhase(room);
        }
    }, 60000);
}

function startDayPhase(room) {
    room.phase = 'day';

    const log = room.processNightActions();

    // Check win condition
    const winner = room.checkWinCondition();
    if (winner) {
        endGame(room, winner);
        return;
    }

    room.players.forEach(player => {
        if (room.alivePlayers.find(p => p.id === player.id)) {
            const dayData = {
                phase: 'day',
                day: room.day,
                myRole: room.roles[player.id],
                alivePlayers: room.alivePlayers,
                log: log
            };
            sendToClient(connections.get(player.id), 'dayPhase', dayData);
        }
    });

    // Simulate bot actions if training mode
    if (room.isTraining) {
        simulateBotActions(room);
    }

    // Auto-advance after 90 seconds
    saveState();
    room.phaseEndTime = Date.now() + 90000;
    room.clearPhaseTimeout();
    room.phaseTimeoutId = setTimeout(() => {
        if (room.phase === 'day') {
            endDayPhase(room);
        }
    }, 90000);
}

function endDayPhase(room) {
    const log = room.processDayVoting();

    // Check win condition
    const winner = room.checkWinCondition();
    if (winner) {
        endGame(room, winner);
        return;
    }

    room.day++;

    // Start next night
    saveState();
    setTimeout(() => {
        startNightPhase(room);
    }, 5000);
}

function endGame(room, winner) {
    room.players.forEach(player => {
        sendToClient(connections.get(player.id), 'gameEnd', {
            winner: winner,
            roles: room.roles
        });
    });

    // Reset room
    setTimeout(() => {
        room.gameStarted = false;
        room.gameState = null;
        room.day = 1;
        room.phase = 'day';
        room.alivePlayers = [];
        room.deadPlayers = [];
        room.roles = {};
        room.votes = {};
        room.mafiaVotes = {};

        broadcastToRoom(room, 'roomUpdate', room.toJSON());
        saveState();
    }, 10000);
}

function handleMafiaVote(userId, targetId) {
    const room = findUserRoom(userId);
    if (room && room.roles[userId] === 'mafia') {
        room.mafiaVotes[userId] = targetId;

        // Broadcast to other mafia members
        room.getMafiaPlayers().forEach(player => {
            if (player.id !== userId) {
                sendToClient(connections.get(player.id), 'mafiaVoteUpdate', {
                    voter: users.get(userId).name,
                    target: users.get(targetId).name
                });
            }
        });
    }
}

function handlePoliceCheck(userId, targetId) {
    const room = findUserRoom(userId);
    if (room && room.roles[userId] === 'police') {
        room.policeCheck = targetId;
        const targetRole = room.roles[targetId];
        const isMafia = targetRole === 'mafia';

        sendToClient(connections.get(userId), 'policeResult', {
            target: users.get(targetId).name,
            isMafia: isMafia
        });
    }
}

function handleDoctorSave(userId, targetId) {
    const room = findUserRoom(userId);
    if (room && room.roles[userId] === 'doctor') {
        room.doctorSave = targetId;
        sendToClient(connections.get(userId), 'doctorConfirm', {
            target: users.get(targetId).name
        });
    }
}

function handleVote(userId, targetId) {
    const room = findUserRoom(userId);
    if (room && room.phase === 'day') {
        room.votes[userId] = targetId;

        // If everyone voted, finish early
        const votedCount = Object.keys(room.votes).length;
        if (votedCount >= room.alivePlayers.length) {
            room.clearPhaseTimeout();
            endDayPhase(room);
        }
    }
}

function handleMafiaChat(userId, message) {
    const room = findUserRoom(userId);
    if (room && room.roles[userId] === 'mafia') {
        const chatMessage = {
            sender: users.get(userId).name,
            message: message,
            timestamp: Date.now()
        };

        room.mafiaChat.push(chatMessage);

        // Broadcast to all mafia members
        room.getMafiaPlayers().forEach(player => {
            sendToClient(connections.get(player.id), 'mafiaMessage', chatMessage);
        });
    }
}

function handleStartTraining(userId, data) {
    // Realistic bot names
    const botNames = [
        'Əli', 'Vəli', 'Aysel', 'Nigar', 'Rəşad', 'Elvin', 'Səbinə', 'Kamran',
        'Leyla', 'Tural', 'Günay', 'Orxan', 'Aynur', 'Elçin', 'Sevda', 'Rauf',
        'Məleykə', 'Fərid', 'Gül', 'Mübariz', 'Arzu', 'Ramil', 'Nərgiz', 'Elşad'
    ];

    // Shuffle bot names
    const shuffledNames = [...botNames].sort(() => Math.random() - 0.5);

    // Calculate config based on bot count
    const totalPlayers = parseInt(data.botCount);
    const config = {
        mafia: Math.max(1, Math.floor(totalPlayers / 4)),
        police: Math.max(0, Math.floor(totalPlayers / 8)),
        doctor: Math.max(0, Math.floor(totalPlayers / 8)),
        citizen: 0
    };
    config.citizen = totalPlayers - config.mafia - config.police - config.doctor;

    const code = generateRoomCode();
    const room = new Room(code, config, userId);
    const user = users.get(userId);
    room.addPlayer(user);
    room.isTraining = true; // Mark as training room

    // Add bots with realistic names
    for (let i = 0; i < data.botCount - 1; i++) {
        const bot = {
            id: `bot_${code}_${i}`,
            name: shuffledNames[i] || `Bot ${i + 1}`,
            photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(shuffledNames[i] || 'Bot')}&background=random`,
            isBot: true
        };
        room.addPlayer(bot);
        users.set(bot.id, bot); // Add bot to users map
    }

    rooms.set(code, room);
    room.startGame();

    // Override user's role
    room.roles[userId] = data.role;

    const gameData = {
        phase: room.phase,
        day: room.day,
        myRole: room.roles[userId],
        alivePlayers: room.alivePlayers,
        log: ['Məşq rejimi başladı']
    };

    sendToClient(connections.get(userId), 'gameStarted', gameData);

    // Start night phase for training
    saveState();
    setTimeout(() => {
        startNightPhase(room);
    }, 3000);
}

function simulateBotActions(room) {
    if (!room.isTraining) return;

    // Simulate bot actions during night
    if (room.phase === 'night') {
        setTimeout(() => {
            room.alivePlayers.forEach(player => {
                if (player.isBot) {
                    const role = room.roles[player.id];
                    const targets = room.alivePlayers.filter(p => p.id !== player.id && room.roles[p.id] !== 'mafia');

                    if (targets.length > 0) {
                        const randomTarget = targets[Math.floor(Math.random() * targets.length)];

                        if (role === 'mafia') {
                            room.mafiaVotes[player.id] = randomTarget.id;
                        } else if (role === 'doctor') {
                            room.doctorSave = randomTarget.id;
                        } else if (role === 'police') {
                            room.policeCheck = randomTarget.id;
                        }
                    }
                }
            });
        }, 3000);
    }

    // Simulate bot actions during day
    if (room.phase === 'day') {
        setTimeout(() => {
            room.alivePlayers.forEach(player => {
                if (player.isBot) {
                    const targets = room.alivePlayers.filter(p => p.id !== player.id);
                    if (targets.length > 0) {
                        const randomTarget = targets[Math.floor(Math.random() * targets.length)];
                        room.votes[player.id] = randomTarget.id;
                    }
                }
            });
        }, 3000);
    }
}

function handleSyncState(userId) {
    const room = findUserRoom(userId);
    if (room) {
        let remainingTime = 0;
        if (room.phaseEndTime) {
            remainingTime = Math.max(0, Math.floor((room.phaseEndTime - Date.now()) / 1000));
        }

        const gameState = {
            phase: room.phase,
            day: room.day,
            myRole: room.roles[userId],
            alivePlayers: room.alivePlayers,
            log: [],
            remainingTime: remainingTime
        };

        sendToClient(connections.get(userId), 'gameStateSync', {
            room: room.toJSON(),
            gameState: gameState
        });
    } else {
        // No room found, send empty state
        sendToClient(connections.get(userId), 'gameStateSync', {
            room: null,
            gameState: null
        });
    }
}

function handleDisconnect(userId) {
    const room = findUserRoom(userId);
    if (room && room.gameStarted) {
        // Save game state for reconnection
        const userState = {
            roomCode: room.code,
            role: room.roles[userId],
            timestamp: Date.now()
        };
        users.set(`${userId}_state`, userState);
    }
}

function findUserRoom(userId) {
    for (const room of rooms.values()) {
        if (room.players.find(p => p.id === userId)) {
            return room;
        }
    }
    return null;
}

function getTotalPlayers(config) {
    return config.mafia + config.police + config.doctor + config.citizen;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sendToClient(ws, type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

function sendError(userId, message) {
    const ws = connections.get(userId);
    if (ws) {
        sendToClient(ws, 'error', { message });
    }
}

function broadcastToRoom(room, type, data) {
    room.players.forEach(player => {
        const ws = connections.get(player.id);
        if (ws) {
            sendToClient(ws, type, data);
        }
    });
}

// Keep server awake
setInterval(() => {
    console.log('Server is alive:', new Date().toISOString());
}, 20000); // Every 20 seconds

// WebSocket heartbeat - ping all clients
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating dead connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 20000); // Every 20 seconds

// Self-ping to prevent Render sleep
if (process.env.RENDER) {
    const https = require('https');
    setInterval(() => {
        https.get('https://saskioyunu-1.onrender.com/ping', (res) => {
            console.log('Self-ping:', res.statusCode);
        }).on('error', (err) => {
            console.error('Self-ping error:', err);
        });
    }, 20000); // Every 20 seconds
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
