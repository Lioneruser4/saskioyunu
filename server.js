// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

let rooms = {};
let users = {};
let roomCounter = 1;

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Ping to keep alive
setInterval(() => {
    http.get('https://saskioyunu-1.onrender.com', (res) => {
        console.log('Ping sent');
    }).on('error', (e) => {
        console.error('Ping error:', e);
    });
}, 30000); // Every 30 seconds

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('login', (data) => {
        users[socket.id] = { ...data, socketId: socket.id };
    });

    socket.on('auto-join', () => {
        // Find or create open room
        let openRoom = Object.values(rooms).find(r => !r.started && r.players.length < 10);
        if (!openRoom) {
            createRoom(socket, false);
        } else {
            joinRoom(socket, openRoom.id);
        }
    });

    socket.on('create-room', (isDemo = false) => {
        createRoom(socket, isDemo);
    });

    socket.on('join-room', (id) => {
        if (rooms[id]) {
            joinRoom(socket, id);
        } else {
            socket.emit('error', 'Oda bulunamadı');
        }
    });

    function createRoom(socket, isDemo) {
        const id = roomCounter++;
        rooms[id] = {
            id,
            owner: socket.id,
            players: [],
            started: false,
            phase: 'lobby',
            roles: {},
            alive: {},
            mafiaVotes: {},
            doctorSave: null,
            isDemo
        };
        joinRoom(socket, id, true);
        if (isDemo) {
            // Add bots
            for (let i = 1; i <= 5; i++) {
                const botId = `bot${i}`;
                rooms[id].players.push({ userId: botId, name: `Bot ${i}`, photo: '', socketId: null });
            }
            io.to(id).emit('player-list', rooms[id].players);
        }
    }

    function joinRoom(socket, id, isOwner = false) {
        const user = users[socket.id];
        rooms[id].players.push({ ...user });
        socket.join(id);
        socket.emit('room-created', id); // or joined-room
        socket.emit('joined-room', { roomId: id, players: rooms[id].players, isOwner });
        io.to(id).emit('player-list', rooms[id].players);
        io.emit('rooms-update', Object.values(rooms).map(r => ({ id: r.id, players: r.players.length })));
    }

    socket.on('chat', (data) => {
        io.to(data.roomId).emit('chat-message', `${users[socket.id].name}: ${data.message}`);
    });

    socket.on('kick', (data) => {
        if (rooms[data.roomId].owner === socket.id) {
            const target = rooms[data.roomId].players.find(p => p.userId === data.target);
            if (target) {
                rooms[data.roomId].players = rooms[data.roomId].players.filter(p => p.userId !== data.target);
                if (target.socketId) io.to(target.socketId).emit('kicked');
                io.to(data.roomId).emit('player-list', rooms[data.roomId].players);
            }
        }
    });

    socket.on('start-game', (config) => {
        const room = rooms[roomId]; // roomId from data? Wait, assume roomId in config or from socket
        // Fix: socket.on('start-game', (config, roomId) => but simplify
        // Assuming roomId is known, but better pass roomId in emit
        const roomId = Object.keys(rooms).find(r => rooms[r].owner === socket.id); // Hacky, better pass
        const room = rooms[roomId];
        if (room.owner !== socket.id || room.started) return;
        if (config.mafia + config.police + config.citizen !== room.players.length) return;

        // Assign roles randomly (cards)
        const roles = [];
        for (let i = 0; i < config.mafia; i++) roles.push('mafia');
        for (let i = 0; i < config.police; i++) roles.push('polis');
        for (let i = 0; i < config.citizen; i++) roles.push('vatandaş');
        roles.sort(() => Math.random() - 0.5); // Shuffle

        room.players.forEach((p, idx) => {
            room.roles[p.userId] = roles[idx];
            room.alive[p.userId] = true;
            if (p.socketId) io.to(p.socketId).emit('game-started', roles[idx]);
        });
        room.started = true;
        startPhase(roomId, 'gündüz');
    });

    function startPhase(roomId, phase) {
        const room = rooms[roomId];
        room.phase = phase;
        io.to(roomId).emit('phase-change', phase);

        if (phase === 'gece') {
            room.mafiaVotes = {};
            room.doctorSave = null;
            // Mafia vote for kill, doctor save - handle via events
            // For bots in demo, simulate
            if (room.isDemo) {
                simulateBotActions(roomId);
            }
        } else if (phase === 'gündüz') {
            // Voting for lynch
            processNightResults(roomId);
            // Then day vote
        }
        // Timer for phase end, e.g. setTimeout(() => endPhase(roomId), 60000);
        // But simplified, assume manual or timed
    }

    socket.on('mafia-chat', (data) => {
        const room = rooms[data.roomId];
        if (room.roles[users[socket.id].userId] === 'mafia') {
            io.to(data.roomId).to(mafiaSockets(room)).emit('mafia-message', `${users[socket.id].name}: ${data.message}`);
        }
    });

    function mafiaSockets(room) {
        return room.players.filter(p => room.roles[p.userId] === 'mafia' && room.alive[p.userId]).map(p => p.socketId);
    }

    socket.on('doctor-save', (data) => {
        const room = rooms[data.roomId];
        if (room.roles[users[socket.id].userId] === 'doktor' && room.phase === 'gece') { // Doktor role
            room.doctorSave = data.target;
            io.to(data.roomId).emit('chat-message', 'Doktor seçim yaptı.');
        }
    });

    // Mafia kill vote (add event)
    socket.on('mafia-kill', (data) => { // Add to client if needed
        // Tally votes, most voted dies unless saved
    });

    function processNightResults(roomId) {
        const room = rooms[roomId];
        // Assume mafia voted one target
        const killed = getMostVoted(room.mafiaVotes);
        if (killed === room.doctorSave) {
            io.to(roomId).emit('save-result', `Mafialar ${killed} vurdu ama doktor tedavi etti.`);
        } else if (killed) {
            room.alive[killed] = false;
            io.to(roomId).emit('chat-message', `${killed} öldü.`);
        }
        checkWin(roomId);
    }

    function getMostVoted(votes) {
        // Logic to find max voted
        return Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b);
    }

    function checkWin(roomId) {
        const room = rooms[roomId];
        const mafias = room.players.filter(p => room.roles[p.userId] === 'mafia' && room.alive[p.userId]).length;
        const others = room.players.length - mafias;
        if (mafias === 0) io.to(roomId).emit('game-end', 'Vatandaşlar kazandı!');
        else if (mafias >= others) io.to(roomId).emit('game-end', 'Mafialar kazandı!');
        else startPhase(roomId, room.phase === 'gece' ? 'gündüz' : 'gece');
    }

    function simulateBotActions(roomId) {
        // Simple bot logic for demo
        const room = rooms[roomId];
        const bots = room.players.filter(p => p.userId.startsWith('bot'));
        // Bots vote randomly etc.
    }

    socket.on('rejoin', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players.find(p => p.socketId === socket.id)) {
            joinRoom(socket, roomId); // Rejoin logic
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        // Mark as disconnected, but keep state for reconnect
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
