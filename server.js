const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');
const app = express();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://localhost:3000';

let bot = null;
if (TOKEN) {
    bot = new TelegramBot(TOKEN, { polling: true });
    console.log('✅ Telegram bot aktif');
}

app.use(express.json());
app.use(express.static('public'));

// Veri depolama (memory'de)
let usersData = {};
let trackedAccounts = {};

// Instagram takipçi sayısı çek (hesap gerekmez)
async function getInstagramFollowers(username) {
    try {
        const cleanUsername = username.replace('@', '').replace('https://www.instagram.com/', '').replace('/', '').trim();
        
        // Instagram'ın public API'si
        const url = `https://www.instagram.com/${cleanUsername}/?__a=1&__d=dis`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json',
                'Accept-Language': 'tr-TR,tr;q=0.9',
                'Referer': 'https://www.instagram.com/'
            },
            timeout: 10000
        });
        
        let followers = 0;
        const data = response.data;
        
        if (data?.graphql?.user?.edge_followed_by?.count) {
            followers = data.graphql.user.edge_followed_by.count;
        } else if (data?.data?.user?.edge_followed_by?.count) {
            followers = data.data.user.edge_followed_by.count;
        } else if (data?.user?.edge_followed_by?.count) {
            followers = data.user.edge_followed_by.count;
        }
        
        if (followers > 0) {
            return { success: true, followers, username: cleanUsername, fullName: data?.graphql?.user?.full_name || cleanUsername };
        }
        
        throw new Error('Takipçi sayısı bulunamadı');
        
    } catch (error) {
        console.log(`❌ ${username} çekilemedi:`, error.message);
        return { success: false, error: 'Profil gizli veya bulunamadı' };
    }
}

// Takipçi değişimini kontrol et ve bildirim gönder
async function checkAndNotify(telegramId, username, currentFollowers) {
    const userAccounts = trackedAccounts[telegramId];
    if (!userAccounts || !userAccounts[username]) return false;
    
    const oldData = userAccounts[username];
    const oldFollowers = oldData.followers;
    
    if (currentFollowers !== oldFollowers) {
        const change = currentFollowers - oldFollowers;
        const changeText = change > 0 ? `📈 +${change} takipçi` : `📉 ${change} takipçi`;
        const emoji = change > 0 ? '🎉' : '⚠️';
        
        // Güncelle
        userAccounts[username] = {
            followers: currentFollowers,
            lastCheck: new Date().toISOString(),
            history: [...(oldData.history || []), { followers: currentFollowers, date: new Date().toISOString() }]
        };
        
        // Bildirim gönder
        if (bot && !usersData[telegramId]?.silentMode) {
            const message = `${emoji} *${username}* takipçi değişti!\n\n${changeText}\n\n📊 Eski: ${oldFollowers.toLocaleString()}\n📊 Yeni: ${currentFollowers.toLocaleString()}\n📅 ${new Date().toLocaleString('tr')}`;
            
            await bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
            console.log(`📨 Bildirim: ${username} -> ${change > 0 ? '+' : ''}${change}`);
        }
        return true;
    }
    return false;
}

// Tüm hesapları kontrol et
async function checkAllAccounts() {
    console.log('🔍 Kontrol başladı:', new Date().toLocaleString());
    let totalChanges = 0;
    
    for (const [telegramId, accounts] of Object.entries(trackedAccounts)) {
        for (const [username, data] of Object.entries(accounts)) {
            const result = await getInstagramFollowers(username);
            if (result.success) {
                const changed = await checkAndNotify(telegramId, username, result.followers);
                if (changed) totalChanges++;
            }
            await new Promise(r => setTimeout(r, 1000)); // Rate limit koruması
        }
    }
    console.log(`✅ Kontrol bitti. ${totalChanges} değişiklik bulundu.`);
}

// Her 10 dakikada bir kontrol et
cron.schedule('*/10 * * * *', () => {
    checkAllAccounts();
});

// Telegram bot komutları
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const user = msg.from;
        
        usersData[chatId] = {
            id: chatId,
            first_name: user.first_name,
            username: user.username,
            silentMode: false
        };
        
        if (!trackedAccounts[chatId]) {
            trackedAccounts[chatId] = {};
        }
        
        bot.sendMessage(chatId, `👋 *${user.first_name}* merhaba!\n\nInstagram takipçi takip botuna hoşgeldin.\n\n🔔 Takip ettiğin profillerin takipçi sayısı değiştiğinde sana anında bildirim göndereceğim.\n\n📌 Paneli açarak takip etmek istediğin profilleri ekleyebilirsin.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{
                    text: "📊 Takipçi Takip Paneli",
                    web_app: { url: WEBAPP_URL }
                }]]
            }
        });
    });
}

// API Endpoints
app.post('/api/auto-login', (req, res) => {
    const { telegram_id, first_name, username, photo_url } = req.body;
    
    if (!usersData[telegram_id]) {
        usersData[telegram_id] = {
            id: telegram_id,
            first_name: first_name,
            username: username,
            photo_url: photo_url,
            silentMode: false
        };
        trackedAccounts[telegram_id] = {};
    }
    
    res.json({ 
        success: true, 
        user: usersData[telegram_id],
        silentMode: usersData[telegram_id].silentMode 
    });
});

app.post('/api/add', async (req, res) => {
    const { telegram_id, username } = req.body;
    
    if (!trackedAccounts[telegram_id]) {
        trackedAccounts[telegram_id] = {};
    }
    
    // Takipçi sayısını çek
    const result = await getInstagramFollowers(username);
    
    if (result.success) {
        trackedAccounts[telegram_id][result.username] = {
            followers: result.followers,
            fullName: result.fullName,
            lastCheck: new Date().toISOString(),
            history: [{ followers: result.followers, date: new Date().toISOString() }]
        };
        res.json({ success: true, followers: result.followers, username: result.username });
    } else {
        res.json({ success: false, error: result.error });
    }
});

app.post('/api/remove', (req, res) => {
    const { telegram_id, username } = req.body;
    if (trackedAccounts[telegram_id]) {
        delete trackedAccounts[telegram_id][username];
    }
    res.json({ success: true });
});

app.get('/api/list/:telegram_id', (req, res) => {
    const accounts = trackedAccounts[req.params.telegram_id] || {};
    const list = Object.entries(accounts).map(([username, data]) => ({
        username,
        followers: data.followers,
        lastCheck: data.lastCheck,
        fullName: data.fullName
    }));
    res.json(list);
});

app.post('/api/silent-mode', (req, res) => {
    const { telegram_id, silent } = req.body;
    if (usersData[telegram_id]) {
        usersData[telegram_id].silentMode = silent;
    }
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    const totalTracked = Object.values(trackedAccounts).reduce((a,b) => a + Object.keys(b).length, 0);
    res.json({
        status: 'ok',
        users: Object.keys(usersData).length,
        trackedAccounts: totalTracked,
        bot: !!bot
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server: http://localhost:${PORT}`);
    console.log(`📱 Web App: ${WEBAPP_URL}`);
    console.log(`🤖 Bot: ${TOKEN ? 'Aktif' : 'Token yok'}`);
    
    // İlk kontrolü 10 saniye sonra yap
    setTimeout(() => checkAllAccounts(), 10000);
});
