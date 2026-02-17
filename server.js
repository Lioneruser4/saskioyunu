// ==================== SERVER.JS ====================
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://xaliqmustafayev7313_db_user:R4Cno5z1Enhtr09u@sayt.1oqunne.mongodb.net/domino_game?retryWrites=true&w=majority')
.then(() => console.log('✅ MongoDB bağlandı'))
.catch(err => console.log('❌ MongoDB hata:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// ==================== MODELS ====================
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    username: String,
    avatar: String,
    balance: { type: Number, default: 0 },
    lastBonusTime: { type: Date, default: null },
    inventory: [{
        itemId: String,
        color: String,
        equipped: { type: Boolean, default: false }
    }],
    equipped: {
        hat: { itemId: String, color: String },
        shirt: { itemId: String, color: String },
        pants: { itemId: String, color: String },
        shoes: { itemId: String, color: String },
        accessory: { itemId: String, color: String }
    },
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
    name: String,
    ownerId: String,
    ownerName: String,
    users: [{
        userId: String,
        username: String,
        avatar: String,
        x: Number,
        y: Number,
        equipped: Object,
        socketId: String
    }],
    messages: [{
        userId: String,
        username: String,
        message: String,
        timestamp: { type: Date, default: Date.now }
    }],
    password: { type: String, default: null },
    isPrivate: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const ItemSchema = new mongoose.Schema({
    itemId: String,
    name: String,
    category: String,
    price: Number,
    colors: [String],
    description: String
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Item = mongoose.model('Item', ItemSchema);

// ==================== İTEMLERİ EKLE ====================
async function addItems() {
    const items = [
        // ŞAPKALAR
        { itemId: "hat1", name: "Kasket", category: "hat", price: 5, colors: ["#8B4513", "#000000", "#0000FF"], description: "Klasik kasket" },
        { itemId: "hat2", name: "Bere", category: "hat", price: 10, colors: ["#FF0000", "#0000FF", "#000000"], description: "Sıcak bere" },
        { itemId: "hat3", name: "Beyzbol Şapkası", category: "hat", price: 15, colors: ["#0000FF", "#FF0000", "#000000"], description: "Spor şapka" },
        { itemId: "hat4", name: "Hasır Şapka", category: "hat", price: 25, colors: ["#F4A460", "#DEB887"], description: "Yazlık hasır" },
        { itemId: "hat5", name: "Kovboy Şapkası", category: "hat", price: 30, colors: ["#8B4513", "#000000"], description: "Vahşi batı" },
        { itemId: "hat6", name: "Kral Tacı", category: "hat", price: 100, colors: ["#FFD700", "#C0C0C0"], description: "Altın taç" },
        
        // GÖMLEKLER
        { itemId: "shirt1", name: "Tişört", category: "shirt", price: 10, colors: ["#FFFFFF", "#000000", "#FF0000", "#0000FF", "#00FF00"], description: "Basic tişört" },
        { itemId: "shirt2", name: "Gömlek", category: "shirt", price: 20, colors: ["#FFFFFF", "#0000FF", "#FF0000"], description: "Resmi gömlek" },
        { itemId: "shirt3", name: "Sweatshirt", category: "shirt", price: 35, colors: ["#808080", "#000000", "#FF0000"], description: "Rahat sweatshirt" },
        { itemId: "shirt4", name: "Ceket", category: "shirt", price: 50, colors: ["#000000", "#8B4513", "#808080"], description: "Şık ceket" },
        { itemId: "shirt5", name: "Deri Ceket", category: "shirt", price: 75, colors: ["#000000", "#8B4513"], description: "Deri ceket" },
        
        // PANTOLONLAR
        { itemId: "pants1", name: "Kot Pantolon", category: "pants", price: 15, colors: ["#0000FF", "#000000", "#808080"], description: "Kot pantolon" },
        { itemId: "pants2", name: "Eşofman", category: "pants", price: 20, colors: ["#000000", "#808080", "#FF0000"], description: "Rahat eşofman" },
        { itemId: "pants3", name: "Şort", category: "pants", price: 10, colors: ["#FF0000", "#0000FF", "#00FF00"], description: "Spor şort" },
        { itemId: "pants4", name: "Resmi Pantolon", category: "pants", price: 40, colors: ["#000000", "#808080"], description: "Resmi pantolon" },
        
        // AYAKKABILAR
        { itemId: "shoes1", name: "Spor Ayakkabı", category: "shoes", price: 15, colors: ["#FFFFFF", "#000000", "#FF0000"], description: "Spor ayakkabı" },
        { itemId: "shoes2", name: "Bot", category: "shoes", price: 30, colors: ["#8B4513", "#000000"], description: "Kışlık bot" },
        { itemId: "shoes3", name: "Terlik", category: "shoes", price: 5, colors: ["#00FFFF", "#FF69B4", "#FFFF00"], description: "Plaj terliği" },
        
        // AKSESUARLAR
        { itemId: "acc1", name: "Güneş Gözlüğü", category: "accessory", price: 15, colors: ["#000000", "#8B4513"], description: "Güneş gözlüğü" },
        { itemId: "acc2", name: "Zincir Kolye", category: "accessory", price: 50, colors: ["#FFD700", "#C0C0C0"], description: "Altın zincir" },
        { itemId: "acc3", name: "Kol Saati", category: "accessory", price: 30, colors: ["#FFD700", "#C0C0C0", "#000000"], description: "Kol saati" },
        { itemId: "acc4", name: "Sırt Çantası", category: "accessory", price: 40, colors: ["#FF0000", "#0000FF", "#00FF00"], description: "Sırt çantası" }
    ];

    for (const item of items) {
        await Item.findOneAndUpdate(
            { itemId: item.itemId },
            item,
            { upsert: true, new: true }
        );
    }
    console.log('✅ İtemler eklendi');
}

// Admin ID'leri
const ADMIN_IDS = ['123456789', '987654321']; // Telegram ID'lerinizi girin

// ==================== ROUTES ====================
// Giriş
app.post('/api/login', async (req, res) => {
    try {
        const { telegramId, username, avatar } = req.body;
        
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({
                telegramId,
                username,
                avatar,
                balance: 0,
                isAdmin: ADMIN_IDS.includes(telegramId)
            });
            await user.save();
        }
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bonus al
app.post('/api/claim-bonus', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }
        
        const now = new Date();
        const twoHours = 2 * 60 * 60 * 1000;
        
        if (user.lastBonusTime) {
            const timeDiff = now - new Date(user.lastBonusTime);
            if (timeDiff < twoHours) {
                const remaining = Math.ceil((twoHours - timeDiff) / (60 * 1000));
                return res.json({ success: false, remainingMinutes: remaining });
            }
        }
        
        user.balance += 10;
        user.lastBonusTime = now;
        await user.save();
        
        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Market ürünleri
app.get('/api/market/items', async (req, res) => {
    try {
        const items = await Item.find();
        res.json({ success: true, items });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Ürün satın al
app.post('/api/market/buy', async (req, res) => {
    try {
        const { telegramId, itemId, color } = req.body;
        
        const user = await User.findOne({ telegramId });
        const item = await Item.findOne({ itemId });
        
        if (!user || !item) {
            return res.status(404).json({ success: false, error: 'Kullanıcı veya ürün bulunamadı' });
        }
        
        if (user.balance < item.price) {
            return res.json({ success: false, error: 'Yetersiz bakiye' });
        }
        
        user.balance -= item.price;
        user.inventory.push({ itemId: item.itemId, color: color, equipped: false });
        await user.save();
        
        res.json({ success: true, newBalance: user.balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Giyin
app.post('/api/equip', async (req, res) => {
    try {
        const { telegramId, itemId, color, category } = req.body;
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }
        
        // Eski eşyayı çıkar
        if (user.equipped[category] && user.equipped[category].itemId) {
            const oldItemIndex = user.inventory.findIndex(i => 
                i.itemId === user.equipped[category].itemId && 
                i.color === user.equipped[category].color
            );
            if (oldItemIndex !== -1) {
                user.inventory[oldItemIndex].equipped = false;
            }
        }
        
        // Yeni eşyayı giy
        const itemIndex = user.inventory.findIndex(i => i.itemId === itemId && i.color === color);
        if (itemIndex !== -1) {
            user.inventory[itemIndex].equipped = true;
            user.equipped[category] = { itemId, color };
        }
        
        await user.save();
        
        res.json({ success: true, equipped: user.equipped });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin para ekle
app.post('/api/admin/addmoney', async (req, res) => {
    try {
        const { adminId, targetId, amount } = req.body;
        
        const admin = await User.findOne({ telegramId: adminId });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Yetkisiz erişim' });
        }
        
        const target = await User.findOne({ telegramId: targetId });
        if (!target) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }
        
        target.balance += amount;
        await target.save();
        
        res.json({ success: true, newBalance: target.balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin ban
app.post('/api/admin/ban', async (req, res) => {
    try {
        const { adminId, targetId } = req.body;
        
        const admin = await User.findOne({ telegramId: adminId });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Yetkisiz erişim' });
        }
        
        const target = await User.findOne({ telegramId: targetId });
        if (!target) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }
        
        target.isBanned = !target.isBanned;
        await target.save();
        
        res.json({ success: true, isBanned: target.isBanned });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SOCKET.IO ====================
const activeRooms = new Map();

io.on('connection', (socket) => {
    console.log('🔌 Yeni bağlantı:', socket.id);
    
    // Odaya katıl
    socket.on('join-room', async (data) => {
        const { roomId, user } = data;
        
        const dbUser = await User.findOne({ telegramId: user.telegramId });
        if (dbUser?.isBanned) {
            socket.emit('banned');
            return;
        }
        
        socket.join(roomId);
        socket.userData = { ...user, socketId: socket.id };
        
        if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, []);
        }
        
        const roomUsers = activeRooms.get(roomId);
        
        // Rastgele spawn noktası
        const x = Math.random() * 700 + 50;
        const y = Math.random() * 300 + 100;
        
        const userData = {
            ...user,
            x,
            y,
            equipped: dbUser?.equipped || {},
            socketId: socket.id
        };
        
        roomUsers.push(userData);
        
        // Odaya yayınla
        io.to(roomId).emit('user-joined', userData);
        socket.emit('room-users', roomUsers);
    });
    
    // Karakter hareketi
    socket.on('character-move', (data) => {
        const { roomId, x, y } = data;
        
        if (activeRooms.has(roomId)) {
            const roomUsers = activeRooms.get(roomId);
            const user = roomUsers.find(u => u.socketId === socket.id);
            if (user) {
                user.x = x;
                user.y = y;
                socket.to(roomId).emit('character-moved', {
                    userId: user.userId,
                    x, y
                });
            }
        }
    });
    
    // İtme
    socket.on('character-push', (data) => {
        const { roomId, targetId, newX, newY } = data;
        socket.to(roomId).emit('character-pushed', { targetId, newX, newY });
    });
    
    // Chat mesajı
    socket.on('send-message', (data) => {
        const { roomId, message } = data;
        
        if (activeRooms.has(roomId)) {
            const roomUsers = activeRooms.get(roomId);
            const user = roomUsers.find(u => u.socketId === socket.id);
            
            if (user) {
                const msgData = {
                    userId: user.userId,
                    username: user.username,
                    message,
                    timestamp: new Date()
                };
                
                io.to(roomId).emit('new-message', msgData);
            }
        }
    });
    
    // Özel mesaj
    socket.on('send-private-message', (data) => {
        const { targetId, message } = data;
        
        if (activeRooms.has('global')) {
            const roomUsers = activeRooms.get('global');
            const target = roomUsers.find(u => u.userId === targetId);
            const sender = roomUsers.find(u => u.socketId === socket.id);
            
            if (target && sender) {
                io.to(target.socketId).emit('private-message', {
                    from: sender.username,
                    fromId: sender.userId,
                    message
                });
            }
        }
    });
    
    // Çıkış
    socket.on('leave-room', (roomId) => {
        if (activeRooms.has(roomId)) {
            const roomUsers = activeRooms.get(roomId);
            const index = roomUsers.findIndex(u => u.socketId === socket.id);
            
            if (index !== -1) {
                roomUsers.splice(index, 1);
                io.to(roomId).emit('user-left', socket.userData?.userId);
            }
            
            socket.leave(roomId);
        }
    });
    
    // Bağlantı kopması
    socket.on('disconnect', () => {
        console.log('🔌 Bağlantı koptu:', socket.id);
        
        activeRooms.forEach((users, roomId) => {
            const index = users.findIndex(u => u.socketId === socket.id);
            if (index !== -1) {
                users.splice(index, 1);
                io.to(roomId).emit('user-left', socket.userData?.userId);
            }
        });
    });
});

// ==================== SERVER BAŞLAT ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✅ Server http://localhost:${PORT} adresinde çalışıyor`);
    await addItems();
});
