const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    socket.on('join-room', ({ roomId, userId }) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push(userId);
        
        socket.to(roomId).emit('user-joined', { userId });
        socket.emit('room-users', { 
            users: rooms[roomId].filter(id => id !== userId) 
        });
    });

    socket.on('signal', ({ to, from, signal }) => {
        io.to(to).emit('signal', { from, signal });
    });

    socket.on('leave-room', ({ roomId, userId }) => {
        socket.leave(roomId);
        if (rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter(id => id !== userId);
            io.to(roomId).emit('user-left', { userId });
        }
    });

    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomId => {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
            io.to(roomId).emit('user-left', { userId: socket.id });
        });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});
