const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
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
const VERSION = "V11 ULTRA - REAL MP3";

app.get('/', (req, res) => res.send(`NexMusic ${VERSION} is Active! 🚀`));

// 🔍 Arama
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

// � V11: Doğrudan Sunucuda MP3 Üret ve Gönder
app.post('/download-v11', async (req, res) => {
    const { url, userId, title, author } = req.body;
    if (!url || !userId) return res.status(400).json({ error: 'Eksik bilgi' });

    console.log(`[${VERSION}] Gerçek MP3 hazırlatılıyor: ${title}`);

    // İşlemi başlatıp hemen cevap veriyoruz (site bekleyip hata vermesin diye)
    res.json({ status: 'started' });

    const safeTitle = (title || 'music').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filePath = path.join(UPLOADS_DIR, `${safeTitle}_${Date.now()}.mp3`);

    try {
        await bot.sendMessage(userId, `🛠️ *${title}* için MP3 tüneli kuruluyor...\n(Gerçek MP3 formatına çevriliyor, lütfen bekleyin.)`, { parse_mode: 'Markdown' });

        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';

        // V11: --extract-audio ve --audio-format mp3 ile GERÇEK MP3 üretiyoruz
        await ytdlp(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: '0', // En yüksek kalite
            output: filePath,
            noCheckCertificates: true,
            addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0']
        }, { binaryPath: execPath });

        if (fs.existsSync(filePath)) {
            console.log(`[${VERSION}] Dönüştürme Bitti. Gönderiliyor...`);

            await bot.sendAudio(userId, fs.createReadStream(filePath), {
                title: title,
                performer: author,
                caption: `✅ *Müziğiniz Hazır!* \n📦 Gerçek MP3 formatında (V11 ULTRA) gönderildi.`,
                parse_mode: 'Markdown'
            });

            fs.unlinkSync(filePath);
            console.log(`[${VERSION}] Başarılı!`);
        }
    } catch (err) {
        console.error('V11 Hatası:', err.message);
        bot.sendMessage(userId, `❌ *Dönüştürme Hatası:* YouTube engeline takıldık veya dosya çok büyük.\nLütfen biraz sonra tekrar deneyin.`).catch(() => { });
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${VERSION} Aktif!`));
