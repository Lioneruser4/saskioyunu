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

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V6 ULTRA - HYBRID MODE";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is Active 🚀`));

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

// 🛠️ V6 BYPASS: iOS/Android Client Emulation
app.get('/get-tunnel-url', async (req, res) => {
    const { url } = req.query;
    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // V6 Spec: Mobil cihaz taklidi yaparak link çekiyoruz
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
            // Bu kısım YouTube'un mobil uygulamasını taklit eder (2026 Bypass)
            addHeader: [
                'user-agent:com.google.ios.youtube/19.01.1 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X; en_US)',
                'x-youtube-client-name:5',
                'x-youtube-client-version:19.01.1'
            ]
        }, { binaryPath: execPath });

        const directUrl = output.trim().split('\n')[0];
        res.json({ tunnelUrl: `/proxy?url=${encodeURIComponent(directUrl)}` });
    } catch (err) {
        console.error('V6 Hatası:', err.message);
        res.status(500).json({ error: 'YouTube engeline takıldık.', details: err.message });
    }
});

// ⚡ V6 PROXY: Dosyayı tarayıcıya güvenle aktarır
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://www.youtube.com/'
            }
        });
        res.setHeader('Content-Type', 'audio/mpeg');
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy hatası');
    }
});

// 📤 Dosyayı Bota ve Kullanıcıya Gönder
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Dosya yok' });

    try {
        // Kullanıcıya bota aktarıldığı bildirimini ver
        await bot.sendMessage(userId, `🎵 *${title}* sunucu tarafından bota aktarılıyor...`, { parse_mode: 'Markdown' });

        await bot.sendAudio(userId, fs.createReadStream(file.path), {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `✅ *İşlem Tamam!* \n@NexMusicBot`,
            parse_mode: 'Markdown'
        });

        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot hatası', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} Aktif!`));
