const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Oyun verileri
const rooms = new Map();
const users = new Map();

// Static files
app.use(express.static(__dirname));
app.use(express.json());

// Ana route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Telegram auth (basit)
app.post('/api/auth', (req, res) => {
    const { initData } = req.body;
    let userData;
    
    try {
        if (initData) {
            // Telegram'dan giriş
            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            userData = JSON.parse(userStr);
        } else {
            // Guest giriş
            userData = {
                id: `guest_${Date.now()}`,
                first_name: `Qonaq_${Math.floor(Math.random() * 1000)}`,
                username: `guest_${Math.random().toString(36).substr(2, 5)}`
            };
        }
        
        const token = uuidv4();
        const user = {
            id: userData.id.toString(),
            name: userData.first_name || userData.username,
            username: userData.username,
            isGuest: !initData
        };
        
        users.set(user.id, user);
        
        res.json({
            success: true,
            token: token,
            user: user
        });
        
    } catch (error) {
        res.json({
            success: true,
            token: uuidv4(),
            user: {
                id: `guest_${Date.now()}`,
                name: `Qonaq_${Math.floor(Math.random() * 1000)}`,
                isGuest: true
            }
        });
    }
});

// Socket.io
io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);
    
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.emit('room-joined', roomId);
    });
    
    socket.on('create-room', () => {
        const roomId = uuidv4().substr(0, 6).toUpperCase();
        rooms.set(roomId, {
            id: roomId,
            players: [],
            gameState: 'waiting'
        });
        socket.emit('room-created', roomId);
    });
    
    socket.on('disconnect', () => {
        console.log('Bağlantı koptu:', socket.id);
    });
});

// Keep alive
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT} portunda işləyir`);
    console.log(`Link: https://saskioyunu-1.onrender.com`);
});
