const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const SELF_URL = `https://saskioyunu.onrender.com`;

// 🛡️ RENDER ANTI-SLEEP ENGINE
app.get('/ping', (req, res) => res.send('pong'));
setInterval(async () => {
    try {
        await axios.get(`${SELF_URL}/ping`);
        console.log('[System] Heartbeat: Server Kept Awake.');
    } catch (e) {
        console.log('[System] Heartbeat Error.');
    }
}, 30000);

app.use(express.static(path.join(__dirname)));

// 🎮 GAME STATE MANAGEMENT
const rooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('createRoom', ({ duration, creatorName, creatorPic }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            duration: parseInt(duration) || 5,
            timer: (parseInt(duration) || 5) * 60,
            players: {},
            ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 },
            score: { red: 0, blue: 0 },
            status: 'waiting',
            lastUpdate: Date.now()
        };
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', ({ roomId, user }) => {
        if (!rooms[roomId]) return socket.emit('error', 'Oda bulunamadı!');

        const room = rooms[roomId];
        const team = Object.values(room.players).filter(p => p.team === 'red').length <= Object.values(room.players).filter(p => p.team === 'blue').length ? 'red' : 'blue';

        room.players[socket.id] = {
            id: socket.id,
            name: user.name || 'Oyuncu',
            pic: user.pic || '',
            team: team,
            x: team === 'red' ? -10 : 10,
            y: 1,
            z: 0,
            ry: 0,
            anim: 'idle'
        };

        socket.join(roomId);
        socket.emit('joined', { roomId, room, playerId: socket.id });
        io.to(roomId).emit('updatePlayers', room.players);
    });

    socket.on('switchTeam', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            const p = rooms[roomId].players[socket.id];
            p.team = p.team === 'red' ? 'blue' : 'red';
            p.x = p.team === 'red' ? -10 : 10;
            io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        }
    });

    socket.on('move', ({ roomId, x, y, z, ry, anim }) => {
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            const p = rooms[roomId].players[socket.id];
            p.x = x; p.y = y; p.z = z; p.ry = ry; p.anim = anim;
        }
    });

    socket.on('ballSync', ({ roomId, ball }) => {
        if (rooms[roomId]) {
            rooms[roomId].ball = ball;
            socket.to(roomId).emit('ballUpdate', ball);
        }
    });

    socket.on('goal', ({ roomId, score }) => {
        if (rooms[roomId]) {
            rooms[roomId].score = score;
            rooms[roomId].ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };
            io.to(roomId).emit('goalUpdate', { score, ball: rooms[roomId].ball });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
                if (Object.keys(rooms[roomId].players).length === 0) delete rooms[roomId];
            }
        }
    });
});

// Game Loop for Room Timers
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.status === 'playing' && room.timer > 0) {
            room.timer -= 1;
            if (room.timer <= 0) {
                room.status = 'finished';
                io.to(roomId).emit('gameFinished', room.score);
            }
        }
    }
}, 1000);

server.listen(PORT, () => console.log(`[Game] Titan Football Server running on port ${PORT} 🚀`));
