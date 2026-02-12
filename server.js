const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const ffmpeg = require('ffmpeg-static');

// 🚀 V28 - TITAN OMNI-REVOLUTION: Multi-Source Power
const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const FFMPEG_PATH = ffmpeg;
const VERSION = "V28 - TITAN OMNI-REVOLUTION";

app.get('/ping', (req, res) => res.send('ok'));

function getRandomUA() {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}

// 🔍 SEARCH: Fast discovery
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

// 🚀 OMNI-DOWNLOAD: Racing 15+ Global Nodes in Parallel
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Missing parameters' });

    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}`);
    const finalFile = path.join(UPLOADS_DIR, `music_${Date.now()}.mp3`);

    console.log(`[${VERSION}] Global Omni-Race Started: ${title}`);

    try {
        const secureStream = async () => {
            // Pool 1: High-Speed Invidious Nodes (10 nodes)
            const nodes = [
                `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`,
                `https://invidious.flokinet.is/latest_version?id=${videoId}&itag=140`,
                `https://inv.vern.cc/latest_version?id=${videoId}&itag=140`,
                `https://invidious.liteserver.nl/latest_version?id=${videoId}&itag=140`,
                `https://inv.tux.mu/latest_version?id=${videoId}&itag=140`,
                `https://invidious.perennialte.ch/latest_version?id=${videoId}&itag=140`,
                `https://invidious.nerdvpn.de/latest_version?id=${videoId}&itag=140`,
                `https://invidious.esma.pw/latest_version?id=${videoId}&itag=140`,
                `https://invidious.privacydev.net/latest_version?id=${videoId}&itag=140`,
                `https://inv.pwn.re/latest_version?id=${videoId}&itag=140`
            ];

            const probeNode = async (u) => {
                const resp = await axios.head(u, { timeout: 6000, headers: { 'User-Agent': getRandomUA() } });
                if (resp.status === 200) return u;
                throw new Error('Busy');
            };

            // Pool 2: Cobalt Global Bypass
            const cobaltTask = async () => {
                const c = await axios.post('https://api.cobalt.tools/api/json', { url, format: 'mp3', isAudioOnly: true }, { timeout: 8000 });
                if (c.data && c.data.url) return c.data.url;
                throw new Error('Cobalt Fail');
            };

            // Pool 3: Najemi Czech Scraper
            const najemiTask = async () => {
                const n = await axios.get(`https://najemi.cz/ytdl/handler.php?url=${url}`, { timeout: 7000 });
                const m = n.data.match(/href="([^"]+)"/);
                if (m && m[1] && m[1].includes('http')) return m[1];
                throw new Error('Najemi Fail');
            };

            return await Promise.any([...nodes.map(probeNode), cobaltTask(), najemiTask()]);
        };

        const streamUrl = await secureStream();
        console.log(`[${VERSION}] Locked on node: ${streamUrl}`);

        const response = await axios({
            method: 'get', url: streamUrl, responseType: 'stream', timeout: 90000,
            headers: { 'User-Agent': getRandomUA() }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!fs.existsSync(rawFile) || fs.statSync(rawFile).size < 1000) throw new Error('Data empty.');

        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 192k "${finalFile}"`;
        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
                if (error) reject(new Error('Audio processing failed.'));
                else resolve();
            });
        });

        await bot.sendAudio(userId, fs.createReadStream(finalFile), {
            title: title || 'Müzik',
            performer: author || 'TITAN OMNI',
            duration: parseInt(duration) || 0
        });

        res.json({ success: true });
        setTimeout(() => { [rawFile, finalFile].forEach(f => { if (fs.existsSync(f)) fs.unlink(f, () => { }); }); }, 20000);

    } catch (err) {
        console.error(`[${VERSION}] Fatal Error:`, err.message);
        res.status(500).json({ error: 'Tüm hatlar dolu. Lütfen bir kez daha basın.' });
        if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online 🚀`));
