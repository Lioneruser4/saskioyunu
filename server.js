const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

// --- CONFIG ---
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V3.0 ULTRA";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} - Active 🚀`));

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

// 🔗 Get Working Stream URL (V3 logic)
app.get('/get-stream-url', async (req, res) => {
    const { url } = req.query;
    console.log(`[${VERSION}] Stream linki isteniyor: ${url}`);

    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // V3 ULTRA ARGUMENTS: Trying different formats to avoid signature errors
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        }, { binaryPath: execPath });

        const streamUrl = output.trim().split('\n')[0];
        res.json({ streamUrl });
    } catch (err) {
        console.error('🔴 Stream Link Hatası:', err.message);
        res.status(500).json({ error: 'YouTube bağlantısı reddedildi.', details: err.message });
    }
});

// 📤 Telegram Upload API
app.post('/upload-to-telegram', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) {
        return res.status(400).json({ error: 'Dosya sunucuya ulaşamadı.' });
    }

    console.log(`[${VERSION}] Bot gönderimi başlatıldı: ${title}`);

    try {
        // Send notification to user first
        await bot.sendMessage(userId, `📡 *Gelen Dosya:* ${title}\n⚙️ Sunucu üzerinden bota aktarılıyor...`, { parse_mode: 'Markdown' });

        const fileStream = fs.createReadStream(file.path);

        await bot.sendAudio(userId, fileStream, {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `✅ *Bitti!* ${title}\n@NexMusicBot`,
            parse_mode: 'Markdown'
        }, {
            filename: `${title.substring(0, 30)}.mp3`,
            contentType: 'audio/mpeg'
        });

        console.log(`✅ Başarıyla gönderildi: ${userId}`);
        fs.unlinkSync(file.path);
        res.json({ success: true });

    } catch (err) {
        console.error('🔴 Bot Gönderim Hatası:', err.message);
        if (file) fs.unlinkSync(file.path);

        // Notify user about the error via the bot too (if possible)
        bot.sendMessage(userId, `❌ *Hata:* Dosya bota ulaştı ama size gönderilemedi.\nSebep: ${err.message}`).catch(() => { });

        res.status(500).json({ error: 'Telegram katmanı hatası', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} started on port ${PORT}`));
