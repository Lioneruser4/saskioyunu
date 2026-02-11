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
const VERSION = "V8 ULTRA - INTELLIGENT ENGINES";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is Active 🚀`));

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

// 🛠️ V8 MULTI-ENGINE FALLBACK
// Try Engine 1 (Cobalt), if fails try Engine 2 (Invidious), if fails try Engine 3 (yt-dlp Hybrid)
app.get('/get-external-link', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    console.log(`[${VERSION}] İndirme motorları başlatılıyor: ${url}`);

    // ENGINE 1: COBALT (Ultra High Quality)
    try {
        console.log("Trying Engine 1: Cobalt...");
        const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            downloadMode: 'audio',
            audioFormat: 'mp3'
        }, {
            timeout: 10000,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        if (cobaltRes.data && cobaltRes.data.url) {
            console.log("Engine 1 success!");
            return res.json({ downloadUrl: cobaltRes.data.url, engine: 'Cobalt' });
        }
    } catch (e) { console.log(`Engine 1 failed: ${e.message}`); }

    // ENGINE 2: INVIDIOUS DYNAMIC (Extreme Bypass)
    try {
        console.log("Trying Engine 2: Invidious Tunnel...");
        const invidiousInstances = [
            'https://invidious.snopyta.org',
            'https://yewtu.be',
            'https://invidious.kavin.rocks',
            'https://vid.puffyan.us'
        ];

        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
        const instance = invidiousInstances[Math.floor(Math.random() * invidiousInstances.length)];

        const streamUrl = `${instance}/latest_version?id=${videoId}&itag=140`;

        // Verifying if link is alive
        await axios.head(streamUrl, { timeout: 5000 });
        console.log("Engine 2 success!");
        return res.json({ downloadUrl: streamUrl, engine: 'Invidious' });
    } catch (e) { console.log(`Engine 2 failed: ${e.message}`); }

    // ENGINE 3: YT-DLP HYBRID (Local Power)
    try {
        console.log("Trying Engine 3: yt-dlp Local...");
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
            addHeader: ['referer:youtube.com']
        }, { binaryPath: execPath });

        const localUrl = output.trim().split('\n')[0];
        if (localUrl.includes('http')) {
            console.log("Engine 3 success!");
            return res.json({ downloadUrl: localUrl, engine: 'yt-dlp' });
        }
    } catch (e) { console.log(`Engine 3 failed: ${e.message}`); }

    res.status(500).json({ error: 'Tüm indirme motorları şu an meşgul. Lütfen 30 saniye sonra tekrar deneyin.' });
});

// ⚡ PROXY: Harici siteden gelen müziği tüneller
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        res.setHeader('Content-Type', 'audio/mpeg');
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy hatası');
    }
});

// 📤 Final Gönderim
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Dosya yok' });

    try {
        await bot.sendAudio(userId, fs.createReadStream(file.path), {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `✅ *V8 ULTRA:* ${title}`
        });
        fs.unlinkSync(file.path);
        res.json({ success: true });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot hatası' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} Aktif!`));
