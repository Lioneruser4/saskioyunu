const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');
const ffmpeg = require('ffmpeg-static');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const VERSION = "V12 ULTRA - UNSTOPPABLE";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is active! 🚀`));

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

// 📥 V12: DUAL-ENGINE SMART DOWNLOAD (Local + External Fallback)
app.post('/download-v12', async (req, res) => {
    const { url, userId, title, author } = req.body;
    if (!url || !userId) return res.status(400).json({ error: 'Eksik bilgi' });

    console.log(`[${VERSION}] İndirme hazırlatılıyor: ${title}`);
    res.json({ status: 'started' }); // Tell site we started

    const safeTitle = (title || 'music').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filePath = path.join(UPLOADS_DIR, `${safeTitle}_${Date.now()}.mp3`);

    try {
        await bot.sendMessage(userId, `🚀 *${title}* için V12 motoru çalıştırıldı...\nEn uygun hat seçiliyor.`, { parse_mode: 'Markdown' });

        let success = false;

        // --- ENGINE 1: LOCAL HYBRID (With Fixed FFMPEG) ---
        try {
            console.log("Deneniyor: Motor 1 (Local Conversion)");
            const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

            await ytdlp(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
                output: filePath,
                ffmpegLocation: ffmpeg, // POINT TO FFMPEG-STATIC
                noCheckCertificates: true,
                addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
            }, { binaryPath: execPath });

            if (fs.existsSync(filePath)) success = true;
        } catch (err) {
            console.log("Motor 1 Başarısız:", err.message);
        }

        // --- ENGINE 2: EXTERNAL CLOUD ENGINE (Cobalt Fallback) ---
        if (!success) {
            try {
                console.log("Deneniyor: Motor 2 (Cloud Bypass)");
                await bot.sendMessage(userId, `🟡 Yerel motor meşgul, Bulut motoruna (V12-Cloud) geçiliyor...`);

                const cloudRes = await axios.post('https://api.cobalt.tools/api/json', {
                    url: url,
                    downloadMode: 'audio',
                    audioFormat: 'mp3'
                });

                if (cloudRes.data && cloudRes.data.url) {
                    const downloadRes = await axios({
                        url: cloudRes.data.url,
                        method: 'GET',
                        responseType: 'stream'
                    });
                    const writer = fs.createWriteStream(filePath);
                    downloadRes.data.pipe(writer);

                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });

                    if (fs.existsSync(filePath)) success = true;
                }
            } catch (err) {
                console.log("Motor 2 Başarısız:", err.message);
            }
        }

        if (success) {
            console.log(`[${VERSION}] Dosya hazır, gönderiliyor...`);
            await bot.sendAudio(userId, fs.createReadStream(filePath), {
                title: title,
                performer: author,
                caption: `✅ *Müziğiniz Hazır!* \n📦 V12 ULTRA motoru ile başarıyla kurtarıldı.`,
                parse_mode: 'Markdown'
            });
            fs.unlinkSync(filePath);
        } else {
            throw new Error("Tüm motorlar YouTube engeline takıldı.");
        }

    } catch (err) {
        console.error('V12 Hatası:', err.message);
        bot.sendMessage(userId, `❌ *Kritik Hata:* YouTube bu müziği tamamen engelledi.\nSebep: ${err.message.substring(0, 100)}...\n\nLütfen 1-2 dakika sonra tekrar deneyin veya başka bir şarkı aratın.`).catch(() => { });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} System Online! 🚀`));
