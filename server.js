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
const VERSION = "V24 - TITAN MULTI-LINK";
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
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! Multi-Link Bypass Active. ⚡`));

// 🔍 SEARCH: Global Discovery
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });
    try {
        const r = await yts(query);
        const v = r.videos[0];
        if (v) {
            res.json({
                title: v.title, thumbnail: v.thumbnail, url: v.url,
                author: v.author.name, seconds: v.seconds, duration: v.timestamp
            });
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// 🚀 V24 TITAN DOWNLOAD: Multi-Stage Global Scraper
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Missing parameters' });

    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}`);
    const finalFile = path.join(UPLOADS_DIR, `titan_${Date.now()}.mp3`);

    console.log(`[${VERSION}] Multi-Link Request: ${title}`);

    try {
        let streamUrl = null;

        // --- STAGE 1: NAJEMI GLOBAL SCRAPER (NEW) ---
        try {
            console.log(`[${VERSION}] Trying Najemi Scraper...`);
            const najemiPage = await axios.get(`https://najemi.cz/ytdl/handler.php?url=${url}`, {
                headers: { 'User-Agent': getRandomUA() }
            });
            // Extract href link using regex
            const match = najemiPage.data.match(/href="([^"]+)"/);
            if (match && match[1] && match[1].includes('http')) {
                streamUrl = match[1];
                console.log(`[${VERSION}] Najemi Success.`);
            }
        } catch (e) {
            console.warn(`[${VERSION}] Najemi failed.`);
        }

        // --- STAGE 2: COBALT SHADOW TUNNEL ---
        if (!streamUrl) {
            try {
                console.log(`[${VERSION}] Trying Cobalt Tunnel...`);
                const cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
                    url: url, format: 'mp3', isAudioOnly: true
                }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
                if (cobaltResp.data && cobaltResp.data.url) {
                    streamUrl = cobaltResp.data.url;
                    console.log(`[${VERSION}] Cobalt Success.`);
                }
            } catch (e) { }
        }

        // --- STAGE 3: ONLYMP3 / INVIDIOUS RELAY Fallback ---
        if (!streamUrl) {
            console.log(`[${VERSION}] Trying Invidious Relay...`);
            const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
            streamUrl = `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`;
        }

        // --- STAGE 4: DIRECT STREAM ---
        console.log(`[${VERSION}] Syncing stream from global node...`);
        const response = await axios({
            method: 'get', url: streamUrl, responseType: 'stream',
            timeout: 60000, headers: { 'User-Agent': getRandomUA() }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // --- STAGE 5: FFmpeg STABILIZER ---
        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 192k "${finalFile}"`;
        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
                if (error) reject(new Error('İşlem başarısız.'));
                else resolve();
            });
        });

        // --- STAGE 6: BOT DELIVERY ---
        await bot.sendAudio(userId, finalFile, {
            title: title || 'Müzik',
            performer: author || 'TITAN Multi',
            duration: parseInt(duration) || 0,
            caption: title
        }, { filename: `${title.replace(/[^a-z0-9]/gi, '_')}.mp3`, contentType: 'audio/mpeg' });

        res.json({ success: true, message: 'Delivered' });
        setTimeout(() => { if (fs.existsSync(rawFile)) fs.unlink(rawFile, () => { }); if (fs.existsSync(finalFile)) fs.unlink(finalFile, () => { }); }, 15000);

    } catch (err) {
        console.error(`[${VERSION}] Error:`, err.message);
        res.status(500).json({ error: 'Şu an tüm hatlar dolu, lütfen tekrar deneyin.' });
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
            caption: `✅ *İşlem Başarılı!* \n📦 ${VERSION} ile iletildi.`,
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
app.listen(PORT, () => console.log(`${VERSION} Online 🚀`));
