const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V13 ULTRA - HYBRID FINAL";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! 🚀`));

// 🔍 Arama API
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

// �️ V13: RACING ENGINE (Prefer M4A for compatibility)
app.get('/get-tunnel-url', async (req, res) => {
    const { url } = req.query;
    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // M4A formatı (140 itag) Telegram için en uyumlu "Müzik" formatıdır.
        const output = await ytdlp(url, {
            getUrl: true,
            format: '140/bestaudio[ext=m4a]/bestaudio', // Önce M4A dene
            noCheckCertificates: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
        }, { binaryPath: execPath });

        const directUrl = output.trim().split('\n')[0];
        res.json({ tunnelUrl: `/proxy?url=${encodeURIComponent(directUrl)}` });
    } catch (err) {
        res.status(500).json({ error: 'YouTube Linki Alınamadı.', details: err.message });
    }
});

// ⚡ PROXY: Veriyi tarayıcıya tüneller
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' }
        });
        // M4A olarak işaretle (Telegram'ın en sevdiği format)
        res.setHeader('Content-Type', 'audio/mp4');
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy hatası');
    }
});

// 📤 BOT GÖNDERİMİ: Dosyayı gerçek müzik olarak işaretle
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Dosya yok' });

    try {
        const safeTitle = (title || 'Music').replace(/[^a-z0-9]/gi, '_').substring(0, 50);

        // sendAudio kullanarak "Müzik" olarak gitmesini sağlıyoruz
        await bot.sendAudio(userId, fs.createReadStream(file.path), {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `✅ *Müziğiniz Hazır!* \n@NexMusicBot`,
            parse_mode: 'Markdown'
        }, {
            filename: `${safeTitle}.m4a`, // Dosya adını m4a yapıyoruz
            contentType: 'audio/mp4'     // İçeriği audio/mp4 yapıyoruz
        });

        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot gönderim hatası' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} Aktif!`));
