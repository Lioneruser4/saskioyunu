const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(express.json());
app.use(cors());

// --- CONFIG ---
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V4 ULTRA - SERVER MODE";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! 🚀`));

// 🔍 Search API
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });
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
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// 📥 V4 ULTRA DOWNLOAD & SEND (Server-Side)
app.post('/download-v4', async (req, res) => {
    const { url, userId, title, author } = req.body;

    if (!url || !userId) return res.status(400).json({ error: 'Eksik bilgi.' });

    console.log(`[${VERSION}] İndirme isteği: ${title} (${userId})`);

    // Hemen cevap ver ki site "Failed to fetch" demesin (Timeout engelleme)
    res.json({ status: 'started', message: 'Sunucu indirmeyi başlattı.' });

    const safeTitle = (title || 'music').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filePath = path.join(UPLOADS_DIR, `${safeTitle}_${Date.now()}.mp3`);

    try {
        // Kullanıcıya bota gitmesi gerektiğini söyleyelim
        await bot.sendMessage(userId, `📥 *${title}* sunucuya indiriliyor...\nLütfen bekleyin, bitince otomatik gönderilecek.`, { parse_mode: 'Markdown' });

        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // YT-DLP ile doğrudan sunucuya indir (Bypass headers dahil)
        await ytdlp(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: filePath,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'referer:https://www.youtube.com/'
            ]
        }, { binaryPath: execPath });

        if (fs.existsSync(filePath)) {
            console.log(`[${VERSION}] Dosya hazır, Telegram'a gönderiliyor...`);

            await bot.sendAudio(userId, fs.createReadStream(filePath), {
                title: title,
                performer: author,
                caption: `✅ *Müziğiniz Hazır!* \n\n@NexMusicBot`,
                parse_mode: 'Markdown'
            });

            fs.unlinkSync(filePath);
            console.log(`[${VERSION}] Başarıyla bitti: ${userId}`);
        } else {
            throw new Error("Dosya oluşturulamadı.");
        }

    } catch (err) {
        console.error(`🔴 [${VERSION}] HATA:`, err.message);
        bot.sendMessage(userId, `❌ *Üzgünüm:* YouTube bu müziği indirmemizi engelledi.\n\nHata: ${err.message.substring(0, 100)}...`).catch(() => { });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} running on ${PORT}`));
