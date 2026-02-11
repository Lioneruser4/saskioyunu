const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

// Bot Token
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);

// Arama API
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu gerekli' });

    try {
        const r = await yts(query);
        const video = r.videos[0];
        if (video) {
            res.json({
                title: video.title,
                thumbnail: video.thumbnail,
                url: video.url,
                author: video.author.name
            });
        } else {
            res.status(404).json({ error: 'Bulunamadı' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Arama hatası' });
    }
});

// YouTube'dan doğrudan stream linkini alan API
// Bu link tarayıcıda doğrudan indirmeyi sağlar
app.get('/get-stream-url', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    try {
        console.log(`Stream linki alınıyor: ${url}`);

        // yt-dlp ile sadece linki alıyoruz (-g parametresi)
        // Bu işlem sunucuyu yormaz ve ban riskini azaltır
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
            noWarnings: true,
        });

        // Çıktı bazen birden fazla satır olabilir, ilki genellikle ses linkidir
        const streamUrl = output.trim().split('\n')[0];
        res.json({ streamUrl });

    } catch (err) {
        console.error('Stream hatası:', err);
        res.status(500).json({ error: 'Stream linki alınamadı' });
    }
});

// Sitenin indirdiği dosyayı alıp Telegram'a gönderen uç
app.post('/upload-to-telegram', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) return res.status(400).json({ error: 'Eksik dosya veya kullanıcı' });

    try {
        console.log(`Dosya bota gönderiliyor: ${title}`);

        await bot.sendAudio(userId, file.path, {
            title: title,
            performer: author,
            caption: '🎵 Müziğiniz hazır! Keyifli dinlemeler.'
        });

        // Temizlik
        fs.unlinkSync(file.path);
        res.json({ success: true });

    } catch (err) {
        console.error('Telegram gönderim hatası:', err);
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Telegram gönderimi başarısız' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor. (Proxy Modu)`));
