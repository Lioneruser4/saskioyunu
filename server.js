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
const VERSION = "V5 ULTRA - TUNNEL MODE";

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
                author: video.author.name,
                duration: video.timestamp
            });
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// �️ V5 TUNNEL: Get a stable URL for the client to fetch through our server
app.get('/get-tunnel-url', async (req, res) => {
    const { url } = req.query;
    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
        }, { binaryPath: execPath });

        const directUrl = output.trim().split('\n')[0];
        // We return an encrypted or direct link that the client will use with our /proxy endpoint
        res.json({ tunnelUrl: `/proxy?url=${encodeURIComponent(directUrl)}` });
    } catch (err) {
        res.status(500).json({ error: 'YouTube engeline takıldık.', details: err.message });
    }
});

// ⚡ PROXY TUNNEL: This solves CORS and IP blocks at the same time
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://www.youtube.com/'
            }
        });

        // Copy headers to allow client to see progress
        res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (err) {
        console.error('Proxy Error:', err.message);
        res.status(500).send('Proxy failure');
    }
});

// 📤 FINAL UPLOAD TO TELEGRAM
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) return res.status(400).json({ error: 'Dosya kayboldu.' });

    try {
        await bot.sendAudio(userId, fs.createReadStream(file.path), {
            title: title || 'Music',
            performer: author || 'Artist',
            caption: `✅ *Müzik Hazır!* \n@NexMusicBot`,
            parse_mode: 'Markdown'
        }, {
            filename: `${title.substring(0, 30)}.mp3`,
            contentType: 'audio/mpeg'
        });

        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot hatası', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} running on ${PORT}`));
