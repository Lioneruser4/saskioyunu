const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

// Telegram Bot Ayarları
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://localhost:3000';

// Veritabanı
const db = new sqlite3.Database('tracker.db');
db.run(`CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS tracked_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT,
  instagram_username TEXT,
  initial_followers INTEGER,
  last_followers INTEGER,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(telegram_id) REFERENCES users(telegram_id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS follower_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracked_id INTEGER,
  change_type TEXT,
  username TEXT,
  full_name TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tracked_id) REFERENCES tracked_accounts(id)
)`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Telegram Bot Komutları
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;
  const username = msg.from.username;
  const photoUrl = msg.from.photo?.length > 0 ? msg.from.photo[0].file_id : null;

  // Kullanıcıyı kaydet
  db.run(`INSERT OR REPLACE INTO users (telegram_id, username, first_name, photo_url) VALUES (?, ?, ?, ?)`,
    [userId, username, firstName, photoUrl]);

  // Web App butonu gönder
  bot.sendMessage(chatId, `👋 Merhaba ${firstName}!`, {
    reply_markup: {
      inline_keyboard: [[{
        text: "🚀 Takipçi Takip Paneli",
        web_app: { url: WEBAPP_URL }
      }]]
    }
  });
});

// Web App'ten gelen verileri al
app.post('/api/verify-user', (req, res) => {
  const { telegram_id } = req.body;
  db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ success: true, user });
  });
});

app.post('/api/add-account', (req, res) => {
  const { telegram_id, instagram_username } = req.body;
  // Burada Instagram takipçi sayısı çekme kodu olacak (API sınırlamaları nedeniyle demo)
  const demoFollowers = Math.floor(Math.random() * 1000);
  db.run(`INSERT INTO tracked_accounts (telegram_id, instagram_username, initial_followers, last_followers) VALUES (?, ?, ?, ?)`,
    [telegram_id, instagram_username, demoFollowers, demoFollowers], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/tracked-accounts/:telegram_id', (req, res) => {
  db.all(`SELECT * FROM tracked_accounts WHERE telegram_id = ? ORDER BY added_at DESC`, 
    [req.params.telegram_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Web App URL: ${WEBAPP_URL}`);
});
