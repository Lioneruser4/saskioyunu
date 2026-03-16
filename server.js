const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let games = {}; // Oda verileri
let waitingPlayer = null; 

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('join', (userData) => {
        socket.userData = userData;

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const roomId = `room_${Date.now()}`;
            const gameData = {
                id: roomId,
                players: [waitingPlayer.userData, userData],
                playerIds: [waitingPlayer.id, socket.id],
                board: setupInitialBoard(),
                turn: 0, // 0: Beyaz, 1: Siyah
                captured: { white: [], black: [] },
                lastActivity: Date.now(),
                afkCounts: [0, 0]
            };
            
            games[roomId] = gameData;
            socket.join(roomId);
            waitingPlayer.join(roomId);
            
            io.to(roomId).emit('gameStart', { ...gameData, yourColor: 1 });
            waitingPlayer.emit('gameUpdate', { ...gameData, yourColor: 0 });
            
            startTurnTimer(roomId);
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
            socket.emit('waiting', true);
        }
    });

    socket.on('move', (data) => {
        const { roomId, move } = data;
        const game = games[roomId];
        if (!game) return;

        // Burada hamle doğrulama (yeme zorunluluğu vb.) yapılır
        // Basitleştirilmiş hamle güncelleme:
        game.board = move.newBoard;
        game.turn = game.turn === 0 ? 1 : 0;
        game.captured = move.captured;
        game.lastActivity = Date.now();
        
        io.to(roomId).emit('gameUpdate', game);
        startTurnTimer(roomId);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
    });
});

function setupInitialBoard() {
    let board = Array(64).fill(null);
    for (let i = 0; i < 64; i++) {
        let row = Math.floor(i / 8);
        let col = i % 8;
        if ((row + col) % 2 !== 0) {
            if (row < 3) board[i] = { color: 'black', isKing: false };
            if (row > 4) board[i] = { color: 'white', isKing: false };
        }
    }
    return board;
}

function startTurnTimer(roomId) {
    if (games[roomId]?.timer) clearInterval(games[roomId].timer);
    let timeLeft = 30;
    games[roomId].timer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit('tick', { timeLeft });
        if (timeLeft <= 0) {
            clearInterval(games[roomId].timer);
            // Otomatik hamle veya AFK işlemi
        }
    }, 1000);
}

server.listen(3000, () => console.log('Server running on port 3000'));
