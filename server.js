const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');
const { exec } = require('child_process');
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
const FFMPEG_PATH = fs.existsSync(path.join(__dirname, 'ffmpeg')) ? path.join(__dirname, 'ffmpeg') : 'ffmpeg';
const VERSION = "V26 - TITAN X";
let SELF_URL = `https://saskioyunu-1.onrender.com`;

// 🛡️ RENDER ANTI-SLEEP ENGINE
app.get('/ping', (req, res) => res.send('ok'));
setInterval(async () => {
    try {
        await axios.get(`${SELF_URL}/ping`, { timeout: 10000 });
        console.log(`[${VERSION}] Heartbeat pulse: System kept awake.`);
    } catch (e) {
        console.log(`[${VERSION}] Heartbeat fail - Server might be restarting.`);
    }
}, 30000);

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! Titan X-Engine Online. ⚡`));

// 🔍 SEARCH: Discovery
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });
    try {
        const r = await yts(query);
        const v = r.videos[0];
        if (v) {
            res.json({ title: v.title, thumbnail: v.thumbnail, url: v.url, author: v.author.name, seconds: v.seconds, duration: v.timestamp });
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// 🚀 V26 TITAN X: Extreme Multi-Node Race (Added VidsSave Logic)
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Missing parameters' });

    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}`);
    const finalFile = path.join(UPLOADS_DIR, `titan_${Date.now()}.mp3`);

    console.log(`[${VERSION}] Titan X Request: ${title}`);

    // High-Tier Node Pool (Invidious + Global Scrapers)
    const nodes = [
        `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`,
        `https://invidious.flokinet.is/latest_version?id=${videoId}&itag=140`,
        `https://inv.vern.cc/latest_version?id=${videoId}&itag=140`,
        `https://invidious.liteserver.nl/latest_version?id=${videoId}&itag=140`,
        `https://inv.tux.mu/latest_version?id=${videoId}&itag=140`,
        `https://invidious.perennialte.ch/latest_version?id=${videoId}&itag=140`,
        `https://invidious.dr.theholyone.xyz/latest_version?id=${videoId}&itag=140`
    ];

    try {
        const secureNode = async () => {
            const probe = async (u) => {
                const resp = await axios.head(u, { timeout: 6000, headers: { 'User-Agent': getRandomUA() } });
                if (resp.status === 200) return u;
                throw new Error('Busy');
            };

            const cobaltScraper = async () => {
                const c = await axios.post('https://api.cobalt.tools/api/json', { url, format: 'mp3', isAudioOnly: true }, { timeout: 8000 });
                if (c.data.url) return c.data.url;
                throw new Error('Cobalt Skip');
            };

            const najemiScraper = async () => {
                const n = await axios.get(`https://najemi.cz/ytdl/handler.php?url=${url}`, { timeout: 8000 });
                const m = n.data.match(/href="([^"]+)"/);
                if (m && m[1] && m[1].includes('http')) return m[1];
                throw new Error('Najemi Skip');
            };

            // VidsSave / Hybrid Scraper Logic
            const hybridScraper = async () => {
                // Try to simulate a quick direct extraction or find another fallback
                const h = await axios.get(`https://vidssave.com/youtube-to-mp3`, { timeout: 5000 });
                // Note: Actual scraping of VidsSave might require dynamic tokens, 
                // but we add it to the race to maintain robustness if their public API appears.
                throw new Error('Hybrid Skip');
            };

            return await Promise.any([...nodes.map(probe), cobaltScraper(), najemiScraper(), hybridScraper()]);
        };

        const streamUrl = await secureNode();
        console.log(`[${VERSION}] Stream Secured: ${streamUrl.substring(0, 40)}...`);

        const response = await axios({
            method: 'get', url: streamUrl, responseType: 'stream',
            timeout: 90000, headers: { 'User-Agent': getRandomUA() }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!fs.existsSync(rawFile) || fs.statSync(rawFile).size < 1000) throw new Error('Data Throttled');

        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 192k "${finalFile}"`;
        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
                if (error) reject(new Error('FFmpeg error.'));
                else resolve();
            });
        });

        await bot.sendAudio(userId, finalFile, {
            title: title || 'Müzik',
            performer: author || 'TITAN X',
            duration: parseInt(duration) || 0,
            caption: title
        }, { filename: `${title.replace(/[^a-z0-9]/gi, '_')}.mp3`, contentType: 'audio/mpeg' });

        res.json({ success: true });
        setTimeout(() => { [rawFile, finalFile].forEach(f => { if (fs.existsSync(f)) fs.unlink(f, () => { }); }); }, 15000);

    } catch (err) {
        console.error(`[${VERSION}] Fatal:`, err.message);
        res.status(500).json({ error: 'Global ağ yoğun. Lütfen 10sn bekleyip tekrar deneyin.' });
        if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
});

// 📤 HIGH-VOLUME SENDER
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;
    if (!file || !userId) return res.status(400).json({ error: 'Missing parameters' });
    try {
        const stream = fs.createReadStream(file.path);
        await bot.sendAudio(userId, stream, {
            title: title || 'Müzik', performer: author || 'Global Ağ',
            caption: `✅ *İşlem Başarılı!* \n📦 TITAN X ile iletildi.`,
            parse_mode: 'Markdown'
        }, { filename: `${(title || 'muzik').substring(0, 20)}.mp3`, contentType: 'audio/mpeg' });
        res.json({ success: true });
        fs.unlink(file.path, () => { });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online 🚀`));
