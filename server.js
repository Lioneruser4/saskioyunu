const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
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
const VERSION = "V7 ULTRA - MULTI ENGINE";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is Active 🚀`));

// 🔍 Arama API
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

// 🛠️ V7 MULTI-ENGINE: y2mate ve diğer servisleri kullanan API
// Bu uç, YouTube linkini alır ve harici servislerden MP3 linkini bulur.
app.get('/get-external-link', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    console.log(`[${VERSION}] Harici servisler sorgulanıyor: ${url}`);

    try {
        // Motor 1: y2mate.nu API simülasyonu (veya benzeri bir public API)
        // Not: Gerçek y2mate sitesi genellikle captcha veya karmaşık JS gerektirir.
        // Burada en stabil çalışan 'yt-converter' API'sini veya benzeri bir proxy'yi deneyeceğiz.

        // Örnek: cobalt.tools gibi açık kaynaklı güçlü bir motor deneyelim (2026'nın en iyisi)
        const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            downloadMode: 'audio',
            audioFormat: 'mp3',
            vCodec: 'h264'
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        if (cobaltRes.data && cobaltRes.data.url) {
            console.log(`[${VERSION}] Cobalt Motoru Başarılı!`);
            return res.json({ downloadUrl: cobaltRes.data.url });
        }

        throw new Error("Tüm motorlar başarısız oldu.");

    } catch (err) {
        console.error('Harici Motor Hatası:', err.message);
        res.status(500).json({ error: 'Harici indirme servisleri şu an meşgul.', details: err.message });
    }
});

// ⚡ PROXY: Harici siteden gelen müziği tüneller (CORS Bypass)
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL');
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
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
            caption: `✅ *V7 ULTRA:* ${title}`
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
