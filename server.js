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
const VERSION = "V9 ULTRA - GLOBAL SEARCH";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is Active 🚀`));

// 🔍 Search API (YouTube + Global Search)
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu yok' });
    try {
        console.log(`[${VERSION}] Arama yapılıyor: ${query}`);
        const r = await yts(query);
        const video = r.videos[0];
        if (video) {
            res.json({
                title: video.title,
                thumbnail: video.thumbnail,
                url: video.url,
                author: video.author.name,
                videoId: video.videoId
            });
        } else res.status(404).json({ error: 'Bulunamadı' });
    } catch (err) { res.status(500).json({ error: 'Arama hatası' }); }
});

// 🛠️ V9 GLOBAL ENGINES (YouTube, SoundCloud, CloudConvert)
app.get('/get-external-link', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    console.log(`[${VERSION}] V9 Motorları devrede: ${url}`);

    // MOTOR 1: AA-API (En güçlü 2026 YouTube-to-MP3 motoru)
    try {
        console.log("Deneniyor: Motor 1 (Cloud-Link)");
        const apiRes = await axios.get(`https://api.vevioz.com/api/button/mp3/${url.split('v=')[1]?.split('&')[0] || url.split('/').pop()}`, {
            timeout: 8000
        });
        // Bu tarz siteler genellikle iframe döner ama biz direkt linki yakalamaya çalışacağız.
        // Eğer bu olmazsa diğerlerine geç.
    } catch (e) { }

    // MOTOR 2: COBALT V2 (Ultra Bypass)
    try {
        console.log("Deneniyor: Motor 2 (Cobalt)");
        const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            downloadMode: 'audio',
            audioFormat: 'mp3',
            vCodec: 'h264'
        }, { timeout: 10000 });

        if (cobaltRes.data && cobaltRes.data.url) {
            return res.json({ downloadUrl: cobaltRes.data.url, engine: 'Global-1' });
        }
    } catch (e) { }

    // MOTOR 3: INVIDIOUS REDIRECT
    try {
        console.log("Deneniyor: Motor 3 (Tunnel)");
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
        const streamUrl = `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`;
        return res.json({ downloadUrl: streamUrl, engine: 'Global-2' });
    } catch (e) { }

    // MOTOR 4: YT-DLP LOCAL (Bypass Modu)
    try {
        console.log("Deneniyor: Motor 4 (Local-Bypass)");
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
            noCheckCertificates: true
        }, { binaryPath: execPath });

        const localUrl = output.trim().split('\n')[0];
        if (localUrl) return res.json({ downloadUrl: localUrl, engine: 'Local' });
    } catch (e) { }

    res.status(500).json({ error: 'Tüm müzik kaynakları şu an yoğun. Lütfen 10 saniye sonra tekrar deneyin.' });
});

// ⚡ PROXY TUNNEL
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        res.setHeader('Content-Type', 'audio/mpeg');
        response.data.pipe(res);
    } catch (err) { res.status(500).send('Proxy hatası'); }
});

// 📤 Telegram Upload
app.post('/upload-final', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Dosya yok' });

    try {
        console.log(`[${VERSION}] Bota gönderiliyor: ${title}`);
        await bot.sendAudio(userId, fs.createReadStream(file.path), {
            title: title || 'Müzik',
            performer: author || 'Global Search',
            caption: `✅ *V9 ULTRA:* ${title}\n📦 Global müzik ağından indirildi.`
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
