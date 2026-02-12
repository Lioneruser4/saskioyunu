const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');

// 🚀 V27 - TITAN X-TREME: Zero-Base Redesign
const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const FFMPEG_PATH = fs.existsSync(path.join(__dirname, 'ffmpeg')) ? path.join(__dirname, 'ffmpeg') : 'ffmpeg';
const VERSION = "V27 - TITAN X-TREME";

app.get('/ping', (req, res) => res.send('ok'));

// 🔍 SIMPLE SEARCH: Get first result
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });
    try {
        console.log(`[${VERSION}] Searching: ${query}`);
        const r = await yts(query);
        const v = r.videos[0];
        if (v) {
            res.json({ title: v.title, thumbnail: v.thumbnail, url: v.url, author: v.author.name, seconds: v.seconds, duration: v.timestamp });
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// 🚀 CORE DOWNLOAD: Direct Bypass via Multi-Shadow Nodes
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    if (!url || !userId) return res.status(400).json({ error: 'Parameters missing' });

    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop().split('?')[0];
    const rawFile = path.join(UPLOADS_DIR, `raw_${Date.now()}`);
    const finalFile = path.join(UPLOADS_DIR, `music_${Date.now()}.mp3`);

    console.log(`[${VERSION}] X-Treme Download Initiated: ${title}`);

    try {
        // Step 1: Secure Link Race (The core of V27)
        const getStreamUrl = async () => {
            // Priority 1: Cobalt Shadow (No API Key)
            try {
                const c = await axios.post('https://api.cobalt.tools/api/json', { url, format: 'mp3', isAudioOnly: true }, { timeout: 8000 });
                if (c.data && c.data.url) return c.data.url;
            } catch (e) {
                console.warn('Cobalt node fail.');
            }

            // Priority 2: Invidious Global Relay (Highly Stable 2024 nodes)
            const relayNodes = [
                `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`,
                `https://invidious.flokinet.is/latest_version?id=${videoId}&itag=140`,
                `https://inv.vern.cc/latest_version?id=${videoId}&itag=140`,
                `https://invidious.liteserver.nl/latest_version?id=${videoId}&itag=140`
            ];

            for (const node of relayNodes) {
                try {
                    const check = await axios.head(node, { timeout: 5000 });
                    if (check.status === 200) return node;
                } catch (e) { }
            }
            throw new Error('All shadow tunnels are blocked.');
        };

        const streamUrl = await getStreamUrl();
        console.log(`[${VERSION}] Source Secured: ${streamUrl}`);

        // Step 2: High-Speed Piping
        const response = await axios({
            method: 'get', url: streamUrl, responseType: 'stream', timeout: 90000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const writer = fs.createWriteStream(rawFile);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!fs.existsSync(rawFile) || fs.statSync(rawFile).size < 1000) throw new Error('Data empty or blocked.');

        // Step 3: FFmpeg MP3 Recode
        const ffmpegCmd = `"${FFMPEG_PATH}" -y -i "${rawFile}" -vn -ar 44100 -ac 2 -b:a 192k "${finalFile}"`;
        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, (error) => {
                if (error) reject(new Error('Audio processing failed.'));
                else resolve();
            });
        });

        // Step 4: Bot Dispatch
        await bot.sendAudio(userId, fs.createReadStream(finalFile), {
            title: title || 'Müzik',
            performer: author || 'TITAN X-TREME',
            duration: parseInt(duration) || 0
        });

        res.json({ success: true });

        // Cleanup
        setTimeout(() => { [rawFile, finalFile].forEach(f => { if (fs.existsSync(f)) fs.unlink(f, () => { }); }); }, 20000);

    } catch (err) {
        console.error(`[${VERSION}] Fatal Error:`, err.message);
        res.status(500).json({ error: 'Şu an sistem meşgul. Lütfen 5 saniye sonra tekrar deneyin.' });
        if (fs.existsSync(rawFile)) fs.unlinkSync(rawFile);
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online 🚀`));
