const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Telegram Bot Token'ını .env dosyasından al
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN_HERE';
let telegramBot = null;

if (TELEGRAM_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
}

// Kullanıcı verilerini saklamak için geçici depolama
const users = new Map();
const activePairs = new Map();
const waitingRoom = [];

// Ülke-Şehir verileri
const countryCities = {
  'azerbaycan': ['Bakı', 'Sumqayıt', 'Xırdalan', 'Gəncə', 'Naxçıvan'],
  'turkiye': ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana'],
  'almanya': ['Berlin', 'Hamburg', 'Münih', 'Köln', 'Frankfurt']
};

app.use(express.static('.'));

// API endpoint'leri
app.get('/api/countries', (req, res) => {
  res.json(Object.keys(countryCities));
});

app.get('/api/cities/:country', (req, res) => {
  const country = req.params.country.toLowerCase();
  res.json(countryCities[country] || []);
});

// WebSocket bağlantısı
io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  socket.on('register', (userData) => {
    const userId = socket.id;
    const user = {
      id: userId,
      socketId: userId,
      telegramId: userData.telegramId,
      name: userData.name,
      photo: userData.photo,
      gender: userData.gender,
      country: userData.country,
      city: userData.city,
      isAnonymous: true,
      blurredPhoto: userData.photo + '?blur=10px', // Blurlu fotoğraf efekti
      telegramUsername: userData.telegramUsername
    };
    
    users.set(userId, user);
    socket.userId = userId;
    
    // Kullanıcıyı bekleme odasına ekle
    waitingRoom.push(userId);
    
    // Eşleşme aramaya başla
    findMatch(userId);
    
    socket.emit('registered', { 
      success: true, 
      userId: userId,
      user: {
        ...user,
        photo: user.blurredPhoto // Profilde blurlu fotoğraf göster
      }
    });
  });

  socket.on('requestMatch', () => {
    if (socket.userId) {
      findMatch(socket.userId);
    }
  });

  socket.on('revealProfile', (targetUserId) => {
    const user = users.get(socket.userId);
    const targetUser = users.get(targetUserId);
    
    if (user && targetUser) {
      // Eşleşme kontrolü
      const pairId = [socket.userId, targetUserId].sort().join('_');
      const pair = activePairs.get(pairId);
      
      if (pair) {
        if (!pair.revealRequests) {
          pair.revealRequests = new Set();
        }
        
        pair.revealRequests.add(socket.userId);
        
        // Eğer iki taraf da açma isteğinde bulunduysa
        if (pair.revealRequests.size === 2) {
          // Her iki kullanıcıya da profilleri göster
          io.to(socket.userId).emit('profilesRevealed', {
            partner: {
              name: targetUser.name,
              photo: targetUser.photo,
              telegramUsername: targetUser.telegramUsername,
              telegramLink: targetUser.telegramUsername 
                ? `https://t.me/${targetUser.telegramUsername}` 
                : null
            }
          });
          
          io.to(targetUserId).emit('profilesRevealed', {
            partner: {
              name: user.name,
              photo: user.photo,
              telegramUsername: user.telegramUsername,
              telegramLink: user.telegramUsername 
                ? `https://t.me/${user.telegramUsername}` 
                : null
            }
          });
          
          // Anonimlik kaldırıldı
          user.isAnonymous = false;
          targetUser.isAnonymous = false;
        } else {
          // Sadece bir taraf istedi, diğerine bildirim gönder
          io.to(targetUserId).emit('revealRequest', {
            message: 'Partnerin profilini sana açmak istiyor. Sende istiyorsan dokun.',
            fromUserId: socket.userId,
            timeout: 7000 // 7 saniye
          });
        }
      }
    }
  });

  socket.on('sendMessage', (data) => {
    const user = users.get(socket.userId);
    const targetUserId = data.to;
    
    if (user && targetUserId) {
      const targetUser = users.get(targetUserId);
      if (targetUser) {
        io.to(targetUserId).emit('newMessage', {
          from: socket.userId,
          message: data.message,
          timestamp: new Date().toISOString(),
          senderName: user.isAnonymous ? 'Anonim' : user.name
        });
      }
    }
  });

  socket.on('nextPartner', () => {
    if (socket.userId) {
      // Mevcut eşleşmeyi sonlandır
      endCurrentPair(socket.userId);
      
      // Yeni eşleşme ara
      setTimeout(() => {
        findMatch(socket.userId);
      }, 1000);
    }
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.userId);
    if (socket.userId) {
      // Kullanıcıyı bekleme odasından çıkar
      const index = waitingRoom.indexOf(socket.userId);
      if (index > -1) {
        waitingRoom.splice(index, 1);
      }
      
      // Aktif eşleşmeleri sonlandır
      endCurrentPair(socket.userId);
      
      // Kullanıcıyı veritabanından sil
      users.delete(socket.userId);
    }
  });

  // Eşleşme bulma fonksiyonu
  function findMatch(userId) {
    const user = users.get(userId);
    
    if (!user || waitingRoom.length < 2) {
      // Yeterli kullanıcı yok, bekleme moduna geç
      if (!waitingRoom.includes(userId)) {
        waitingRoom.push(userId);
      }
      return;
    }

    // Kendisi hariç rastgele bir kullanıcı bul
    const otherUsers = waitingRoom.filter(id => 
      id !== userId && 
      users.has(id)
    );

    if (otherUsers.length > 0) {
      const randomIndex = Math.floor(Math.random() * otherUsers.length);
      const partnerId = otherUsers[randomIndex];
      
      // Eşleşme oluştur
      const pairId = [userId, partnerId].sort().join('_');
      activePairs.set(pairId, {
        users: [userId, partnerId],
        createdAt: new Date(),
        revealRequests: new Set()
      });
      
      // Kullanıcıları bekleme odasından çıkar
      const userIndex = waitingRoom.indexOf(userId);
      if (userIndex > -1) waitingRoom.splice(userIndex, 1);
      
      const partnerIndex = waitingRoom.indexOf(partnerId);
      if (partnerIndex > -1) waitingRoom.splice(partnerIndex, 1);
      
      // Her iki kullanıcıya da eşleşme bildirimi gönder
      io.to(userId).emit('matched', {
        partnerId: partnerId,
        partner: {
          name: 'Anonim',
          photo: users.get(partnerId).blurredPhoto,
          isAnonymous: true
        }
      });
      
      io.to(partnerId).emit('matched', {
        partnerId: userId,
        partner: {
          name: 'Anonim',
          photo: user.blurredPhoto,
          isAnonymous: true
        }
      });
    }
  }

  // Mevcut eşleşmeyi sonlandırma fonksiyonu
  function endCurrentPair(userId) {
    for (const [pairId, pair] of activePairs.entries()) {
      if (pair.users.includes(userId)) {
        // Partneri bul
        const partnerId = pair.users.find(id => id !== userId);
        
        if (partnerId) {
          // Partnerine ayrıldı bildirimi gönder
          io.to(partnerId).emit('partnerLeft', {
            message: 'Partnerin ayrıldı. Lobiye yönlendiriliyorsun...'
          });
          
          // Partneri tekrar bekleme odasına ekle
          if (!waitingRoom.includes(partnerId)) {
            waitingRoom.push(partnerId);
          }
          
          // Partneri lobiye yönlendir
          setTimeout(() => {
            io.to(partnerId).emit('returnToLobby');
          }, 2000);
        }
        
        // Eşleşmeyi sil
        activePairs.delete(pairId);
        break;
      }
    }
    
    // Kullanıcıyı bekleme odasına ekle
    if (!waitingRoom.includes(userId)) {
      waitingRoom.push(userId);
    }
  }
});

// Telegram bot entegrasyonu
if (telegramBot) {
  telegramBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = `tg_${chatId}`;
    const userName = msg.from.first_name || 'Kullanıcı';
    const photoUrl = msg.from.photo 
      ? `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${msg.from.photo}`
      : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userName);
    
    telegramBot.sendMessage(chatId, 
      `Merhaba ${userName}! Anonim sohbet uygulamamıza hoş geldin. ` +
      `Web sitemize giderek otomatik giriş yapabilirsin.\n\n` +
      `Site linki: https://saskioyunu.onrender.com\n\n` +
      `Telegram bilgilerin otomatik olarak kaydedilecektir.`
    );
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
