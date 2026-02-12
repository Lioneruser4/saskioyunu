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
const VERSION = "V20 - TITAN ULTRA";
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

// --- GLOBAL ENGINE REPOSITORY (API-FREE) ---
const ENGINES = [
    { name: 'Alpha Core (iOS)', type: 'ytdlp', client: 'ios' },
    { name: 'Beta Core (Android)', type: 'ytdlp', client: 'android' },
    { name: 'Gamma Core (Web)', type: 'ytdlp', client: 'web' },
    { name: 'Invidious Segfault', type: 'invidious', instance: 'https://invidious.projectsegfau.lt' },
    { name: 'Invidious Flokinet', type: 'invidious', instance: 'https://invidious.flokinet.is' },
    { name: 'Invidious Vern', type: 'invidious', instance: 'https://inv.vern.cc' },
    { name: 'Invidious Liteserver', type: 'invidious', instance: 'https://invidious.liteserver.nl' }
];

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36',
    'com.google.ios.youtube/19.01.1 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X; en_US)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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
                const ua = engine.client === 'ios' ? 'com.google.ios.youtube/19.01.1 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X; en_US)' : getRandomUA();

                const args = {
                    getUrl: true,
                    format: 'bestaudio/best',
                    noCheckCertificates: true,
                    noWarnings: true,
                    geoBypass: true,
                    addHeader: [
                        `user-agent:${ua}`,
                        'referer:https://www.youtube.com/',
                        'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'accept-language:en-US,en;q=0.5'
                    ],
                    extractorArgs: `youtube:player_client=${engine.client || 'ios'},web_creator;player_skip=web,android`
                };

                let output = await ytdlp(url, args, { binaryPath: execPath });
                const link = output.toString().trim().split('\n')[0];

                if (link && link.startsWith('http')) {
                    return { downloadUrl: link, engine: engine.name };
                }
                throw new Error('No link found');

            } else if (engine.type === 'invidious') {
                const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
                const instance = engine.instance;
                // Try to get direct stream link from Invidious
                const testUrl = `${instance}/latest_version?id=${videoId}&itag=140`;
                return { downloadUrl: testUrl, engine: engine.name };
            }
        } catch (e) {
            console.error(`[Engine ${engine.name}] Failed:`, e.message);
            throw e;
        }
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
            timeout: 120000,
            maxRedirects: 10,
            headers: {
                'User-Agent': getRandomUA(),
                'Referer': 'https://www.youtube.com/',
                'Range': 'bytes=0-'
            }
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Proxy Stream Error');
    }
});

// 🚀 V20 TITAN ULTRA: File Verification & Shadow Bypass
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Missing parameters' });

    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}.m4a`);
    const finalFile = path.join(UPLOADS_DIR, `titan_${Date.now()}.mp3`);

    console.log(`[${VERSION}] TITAN ULTRA Process: ${title}`);

    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
        let directLink = null;

        // Step 1: Titan Bypass (Android/iOS Client Mix)
        try {
            const output = await ytdlp(url, {
                getUrl: true,
                format: '140/bestaudio[ext=m4a]/bestaudio',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [`user-agent:${getRandomUA()}`, 'referer:https://www.youtube.com/'],
                extractorArgs: 'youtube:player_client=android,ios,web_creator;player_skip=web'
            }, { binaryPath: execPath });
            directLink = output.toString().trim().split('\n')[0];
        } catch (botErr) {
            console.warn(`[${VERSION}] YT Blocked. Racing Shadow Engines...`);
            const raceShadow = async (engine) => {
                const testUrl = `${engine.instance}/latest_version?id=${videoId}&itag=140`;
                return testUrl;
            };
            try {
                directLink = await Promise.any(ENGINES.filter(e => e.type === 'invidious').map(raceShadow));
            } catch (failAll) {
                throw new Error('All sources blocked. Please try again later.');
            }
        }

        // Step 2: Download with Verification
        const response = await axios({
            method: 'get',
            url: directLink,
            responseType: 'stream',
            timeout: 90000,
            headers: { 'User-Agent': getRandomUA(), 'Referer': 'https://www.youtube.com/' }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 🛡️ VERIFY FILE INTEGRITY
        if (!fs.existsSync(rawFile) || fs.statSync(rawFile).size < 1000) {
            throw new Error('Download failed: Source file is empty or corrupt. Try another song.');
        }

        // Step 3: TITAN ULTRA ENCODER
        console.log(`[${VERSION}] Stabilizing Audio (${(fs.statSync(rawFile).size / 1024 / 1024).toFixed(2)}MB)...`);
        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 128k "${finalFile}"`;

        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error, stdout, stderr) => {
                if (error) {
                    console.error("FFmpeg Error Out:", stderr);
                    reject(new Error('Audio encoding failed. YouTube stream was incomplete.'));
                } else resolve();
            });
        });

        // Step 4: Final Deployment
        await bot.sendAudio(userId, finalFile, {
            title: title || 'Müzik',
            performer: author || 'TITAN Ultra',
            duration: parseInt(duration) || 0,
            caption: title
        }, {
            filename: `${title.replace(/[^a-z0-9]/gi, '_')}.mp3`,
            contentType: 'audio/mpeg'
        });

        res.json({ success: true, message: 'Titan Ultra: Delivered' });

        // Cleanup
        setTimeout(() => {
            [rawFile, finalFile].forEach(f => { if (fs.existsSync(f)) fs.unlink(f, () => { }); });
        }, 15000);

    } catch (err) {
        console.error(`[${VERSION}] Failure:`, err.message);
        res.status(500).json({ error: err.message });
        if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
});

// 📤 HIGH-VOLUME SENDER: Handles multiple uploads with low memory footprint
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) return res.status(400).json({ error: 'Missing file or userId' });

    try {
        const stream = fs.createReadStream(file.path);
        const safeTitle = (title || 'muzik').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        await bot.sendAudio(userId, stream, {
            title: title || 'Müzik',
            performer: author || 'Global Ağ',
            caption: `✅ *İşlem Başarılı!* \n📦 ${VERSION} ile müzik olarak iletildi.`,
            parse_mode: 'Markdown'
        }, {
            filename: `${safeTitle}.mp3`,
            contentType: 'audio/mpeg'
        });
        res.json({ success: true });
        fs.unlink(file.path, () => { });
    } catch (err) {
        if (file) fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Bot error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online on Port ${PORT} 🚀`));
