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
const VERSION = "V22 - NEBULA GLOBAL";
let SELF_URL = `https://saskioyunu-1.onrender.com`;

// 🛡️ RENDER ANTI-SLEEP ENGINE (V16)
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
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! Global Cloud Engine Active. ⚡`));

// 🔍 SEARCH: Global SoundCloud Search (Fast & Unblocked)
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });

    try {
        console.log(`[${VERSION}] Searching Global Cloud: ${query}`);
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        const output = await ytdlp(`scsearch1:${query}`, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            extractorArgs: 'soundcloud:api_key=default'
        }, { binaryPath: execPath });

        const info = JSON.parse(output);
        if (info.entries && info.entries.length > 0) {
            const entry = info.entries[0];
            res.json({
                title: entry.title,
                thumbnail: entry.thumbnail || 'https://i1.sndcdn.com/avatars-000437232516-9rv6nd-t500x500.jpg',
                url: entry.url || entry.webpage_url,
                author: entry.uploader || entry.user?.username || 'Global Artist',
                seconds: entry.duration || 0,
                duration: entry.duration_string || '0:00'
            });
        } else {
            // Fallback to YouTube Search
            const r = await yts(query);
            const v = r.videos[0];
            if (v) res.json({ title: v.title, thumbnail: v.thumbnail, url: v.url, author: v.author.name, seconds: v.seconds, duration: v.timestamp });
            else res.status(404).json({ error: 'Bulunamadı' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Arama hatası' });
    }
});

// 🚀 V22 NEBULA DOWNLOAD: Bypassing YouTube via Global Stream
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Missing parameters' });

    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}`);
    const finalFile = path.join(UPLOADS_DIR, `nebula_${Date.now()}.mp3`);

    console.log(`[${VERSION}] Global Request: ${title}`);

    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // Step 1: Extract direct stream URL
        let directUrl = null;
        try {
            // If it's a youtube link, try to bypass. If it's a sc link, use it directly.
            const out = await ytdlp(url, {
                getUrl: true,
                format: 'bestaudio/best',
                noCheckCertificates: true,
                addHeader: [`User-Agent:${getRandomUA()}`]
            }, { binaryPath: execPath });
            directUrl = out.toString().trim().split('\n')[0];
        } catch (e) {
            console.warn(`[${VERSION}] Extraction failed. Trying alternative cloud...`);
            // Try scsearch as fallback even if url was provided
            const altOut = await ytdlp(`scsearch1:${title} ${author}`, { getUrl: true, format: 'bestaudio/best' }, { binaryPath: execPath });
            directUrl = altOut.toString().trim().split('\n')[0];
        }

        if (!directUrl || !directUrl.startsWith('http')) throw new Error('Stream Link Not Found');

        // Step 2: High-Speed Direct Stream (requested logic)
        console.log(`[${VERSION}] Streaming to Server...`);
        const response = await axios({
            method: 'get', url: directUrl,
            responseType: 'stream',
            timeout: 60000,
            headers: { "User-Agent": getRandomUA(), "Accept": "audio/*" }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!fs.existsSync(rawFile) || fs.statSync(rawFile).size < 1000) throw new Error('Source Corrupt');

        // Step 3: FFmpeg MAGIC
        console.log(`[${VERSION}] Stabilizing for Music Player...`);
        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 192k "${finalFile}"`;
        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
                if (error) reject(new Error('Audio encoding failed.'));
                else resolve();
            });
        });

        // Step 4: Secure Delivery
        await bot.sendAudio(userId, finalFile, {
            title: title || 'Müzik',
            performer: author || 'Global Artist',
            duration: parseInt(duration) || 0,
            caption: title
        }, { filename: `${title.replace(/[^a-z0-9]/gi, '_')}.mp3`, contentType: 'audio/mpeg' });

        res.json({ success: true, message: 'Global Cloud: Delivered' });
        setTimeout(() => { [rawFile, finalFile].forEach(f => { if (fs.existsSync(f)) fs.unlink(f, () => { }); }); }, 15000);

    } catch (err) {
        console.error(`[${VERSION}] Fatal Error:`, err.message);
        res.status(500).json({ error: 'Global hat meşgul. Lütfen tekrar deneyin.' });
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
            title: title || 'Müzik',
            performer: author || 'Global Ağ',
            caption: `✅ *İşlem Başarılı!* \n📦 Global Bulut üzerinden iletildi.`,
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
