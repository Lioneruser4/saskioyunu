const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Game state
let rooms = {};
let players = {};

// Load state if exists
if (fs.existsSync('gameState.json')) {
    const state = JSON.parse(fs.readFileSync('gameState.json'));
    rooms = state.rooms || {};
    players = state.players || {};
}

function saveState() {
    fs.writeFileSync('gameState.json', JSON.stringify({ rooms, players }));
}

setInterval(saveState, 10000); // Save every 10 seconds

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            health: 100,
            position: { x: 0, y: 0.9, z: 0 },
            rotation: 0,
            team: null,
            roomId: null
        };
        socket.emit('joined', { success: true });
    });

    socket.on('findGame', () => {
        let roomId = null;
        for (let id in rooms) {
            if (rooms[id].players.length < 20 && rooms[id].status === 'waiting') {
                roomId = id;
                break;
            }
        }
        if (!roomId) {
            roomId = 'room_' + Date.now();
            rooms[roomId] = { players: [], status: 'waiting' };
        }
        socket.emit('roomFound', { roomId });
    });

    socket.on('getRooms', () => {
        const roomList = Object.keys(rooms).map(id => ({
            id,
            players: rooms[id].players.length,
            status: rooms[id].status
        }));
        socket.emit('rooms', roomList);
    });

    socket.on('createRoom', (data) => {
        const roomId = 'room_' + Date.now();
        rooms[roomId] = { players: [], status: 'waiting', aiType: data.aiType };
        socket.emit('roomCreated', { roomId });
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players.length < 20) {
            const player = players[socket.id];
            player.roomId = roomId;
            rooms[roomId].players.push(socket.id);

            // Assign team
            const blueCount = rooms[roomId].players.filter(id => players[id].team === 'blue').length;
            const redCount = rooms[roomId].players.filter(id => players[id].team === 'red').length;
            player.team = blueCount <= redCount ? 'blue' : 'red';

            socket.join(roomId);
            io.to(roomId).emit('playersUpdate', rooms[roomId].players.map(id => players[id]));
            socket.emit('joinedRoom', { roomId, team: player.team, players: rooms[roomId].players.map(id => players[id]) });
        } else {
            socket.emit('joinFailed', { reason: 'Room full or not found' });
        }
    });

    socket.on('startGame', () => {
        const player = players[socket.id];
        if (player && rooms[player.roomId] && rooms[player.roomId].players.length >= 2) {
            rooms[player.roomId].status = 'playing';
            io.to(player.roomId).emit('gameStarted');
        }
    });

    socket.on('updatePosition', (data) => {
        const player = players[socket.id];
        if (player) {
            player.position = data.position;
            player.rotation = data.rotation;
            socket.to(player.roomId).emit('playerUpdate', { id: socket.id, position: data.position, rotation: data.rotation });
        }
    });

    socket.on('hit', (data) => {
        const target = players[data.targetId];
        if (target && target.roomId === players[socket.id].roomId) {
            target.health -= data.damage;
            io.to(target.roomId).emit('playerHit', { id: data.targetId, damage: data.damage });
            if (target.health <= 0) {
                target.health = 100;
                target.position = { x: 0, y: 0.9, z: 0 };
                io.to(target.roomId).emit('playerRespawn', { id: data.targetId });
            }
        }
    });

    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player && player.roomId && rooms[player.roomId]) {
            rooms[player.roomId].players = rooms[player.roomId].players.filter(id => id !== socket.id);
            if (rooms[player.roomId].players.length === 0) {
                delete rooms[player.roomId];
            } else {
                io.to(player.roomId).emit('playersUpdate', rooms[player.roomId].players.map(id => players[id]));
            }
        }
        delete players[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
