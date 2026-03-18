const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statik dosyaları serve et
app.use(express.static(path.join(__dirname, '/')));

// Ana sayfayı yönlendir
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Oyuncuları sakla
let players = {};
let playerColors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ff8844', '#8844ff'];

// Socket.io bağlantıları
io.on('connection', (socket) => {
    console.log('Bir oyuncu bağlandı:', socket.id);
    
    // Yeni oyuncuya renk ata
    const color = playerColors[Object.keys(players).length % playerColors.length];
    
    // Yeni oyuncuyu ekle
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 700 + 50,
        y: Math.random() * 500 + 50,
        color: color,
        name: `Oyuncu ${Object.keys(players).length + 1}`
    };
    
    // Yeni oyuncuya kendi ID'sini gönder
    socket.emit('currentPlayers', { 
        myId: socket.id, 
        players: players 
    });
    
    // Diğer oyunculara yeni oyuncuyu bildir
    socket.broadcast.emit('newPlayer', players[socket.id]);
    
    // Oyuncu hareket ettiğinde
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            
            // Tüm oyunculara pozisyon güncellemesi gönder
            io.emit('playerMoved', {
                id: socket.id,
                x: movementData.x,
                y: movementData.y
            });
        }
    });
    
    // Oyuncu ayrıldığında
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
