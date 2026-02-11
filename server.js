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

// Local yt-dlp path (postinstall ile indirilen)
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');

app.get('/', (req, res) => res.send('NexMusic Proxy Server v2.0 - Active'));

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
                author: video.author.name,
                duration: video.timestamp
            });
        } else {
            res.status(404).json({ error: 'Bulunamadı' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Arama hatası' });
    }
});

// Stream URL API
app.get('/get-stream-url', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    try {
        console.log(`Stream alınıyor: ${url}`);

        // binary path kontrolü
        const executablePath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
            noWarnings: true,
            // 2026 poToken ve Bot korumaları için ek parametreler
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ]
        }, {
            binaryPath: executablePath
        });

        const streamUrl = output.trim().split('\n')[0];
        res.json({ streamUrl });

    } catch (err) {
        console.error('yt-dlp hatası:', err);
        res.status(500).json({ error: 'YouTube bağlantısı sunucu tarafında başarısız oldu.' });
    }
});

app.post('/upload-to-telegram', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) return res.status(400).json({ error: 'Dosya alınamadı.' });

    try {
        await bot.sendAudio(userId, file.path, {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `✅ *${title}* başarıyla indirildi.`,
            parse_mode: 'Markdown'
        });

        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot gönderimi sırasında hata oluştu.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NexMusic v2.0 running on ${PORT}`));
