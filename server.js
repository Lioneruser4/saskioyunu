const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');
const { PassThrough } = require('stream');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V10 ULTRA - INFINITE CORE";

// --- GLOBAL ENGINE REPOSITORY (API-FREE) ---
const ENGINES = [
    { name: 'Core Alpha (iOS)', type: 'ytdlp', client: 'ios' },
    { name: 'Core Beta (Android)', type: 'ytdlp', client: 'android' },
    { name: 'Core Gamma (Web)', type: 'ytdlp', client: 'web' },
    { name: 'Secondary Invidious', type: 'invidious', instance: 'https://invidious.flokinet.is' },
    { name: 'Tertiary Invidious', type: 'invidious', instance: 'https://inv.vern.cc' }
];

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! Running on High-Performance mode. ⚡`));

// 🔍 SEARCH: Ultra-fast YouTube Search
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

// 🛠️ V10 INTELLIGENT ROUTER: Proactively races multiple local engines
app.get('/get-external-link', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    console.log(`[${VERSION}] Request for ${url}`);

    const raceEngine = async (engine) => {
        try {
            if (engine.type === 'ytdlp') {
                const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
                const args = {
                    getUrl: true,
                    format: 'bestaudio/best',
                    noCheckCertificates: true,
                    addHeader: [
                        `user-agent:${engine.client === 'ios' ? 'com.google.ios.youtube/19.01.1 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X; en_US)' : 'Mozilla/5.0'}`,
                        'referer:https://www.youtube.com/'
                    ]
                };
                let output;
                try {
                    output = await ytdlp(url, args, { binaryPath: execPath });
                } catch (execError) {
                    console.error(`[Engine ${engine.name}] Exec Error:`, execError.message);
                    throw execError;
                }

                const link = output.toString().trim().split('\n')[0];
                if (link && link.startsWith('http')) {
                    return { downloadUrl: link, engine: engine.name };
                } else {
                    console.error(`[Engine ${engine.name}] Invalid Output:`, output.substring(0, 100));
                    throw new Error('Invalid output format');
                }
            } else if (engine.type === 'invidious') {
                const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
                const instance = engine.instance || 'https://invidious.projectsegfau.lt';
                const testUrl = `${instance}/latest_version?id=${videoId}&itag=140`;
                return { downloadUrl: testUrl, engine: engine.name };
            }
        } catch (e) { throw e; }
    };

    try {
        // V10 MAGIC: Start all engines and take the first one that works
        const result = await Promise.any(ENGINES.map(raceEngine));
        res.json(result);
    } catch (err) {
        console.error('All engines failed:', err.message);
        res.status(500).json({ error: 'Tüm hatlar dolu. Lütfen farklı bir müzik deneyin.' });
    }
});

// ⚡ HIGH-SPEED PROXY: Transparent piping for concurrency
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 120000, // 2 mins timeout for slow downloads
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy Stream Error');
    }
});

// 📤 HIGH-VOLUME SENDER: Handles multiple uploads with low memory footprint
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) {
        console.log("Upload failed: Missing file or userId");
        return res.status(400).json({ error: 'Dosya bota ulaştırılamadı.' });
    }

    try {
        console.log(`[${VERSION}] Sending ${title} to ${userId}`);

        // Use stream for memory efficiency
        const stream = fs.createReadStream(file.path);

        const safeTitle = (title || 'muzik').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        await bot.sendAudio(userId, stream, {
            title: title || 'Müzik',
            performer: author || 'Global Ağ',
            caption: `✅ *İşlem Başarılı!* \n📦 ${VERSION} altyapısı ile saniyeler içinde indirildi.`,
            parse_mode: 'Markdown'
        }, {
            filename: `${safeTitle}.mp3`,
            contentType: 'audio/mpeg'
        });

        res.json({ success: true });

        // Clean up after response
        fs.unlink(file.path, (err) => { if (err) console.error("File delete error:", err); });

    } catch (err) {
        console.error('Bot Send Error:', err.message);
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot katmanında bir sorun oluştu.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online on Port ${PORT} 🚀`));
