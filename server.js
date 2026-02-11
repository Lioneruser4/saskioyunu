const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// Uploads klasörü kontrolü
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(cors());

const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');

app.get('/', (req, res) => res.send('NexMusic Server is Live! ✅'));

// Arama API
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

// Stream URL Alma
app.get('/get-stream-url', async (req, res) => {
    const { url } = req.query;
    try {
        const execPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
        const output = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio',
            noCheckCertificates: true,
        }, { binaryPath: execPath });
        res.json({ streamUrl: output.trim().split('\n')[0] });
    } catch (err) {
        console.error('yt-dlp Error:', err);
        res.status(500).json({ error: 'Link alınamadı.' });
    }
});

// Telegram'a Yükleme (Kritik Bölüm)
app.post('/upload-to-telegram', upload.single('music'), async (req, res) => {
    const { userId, title, author } = req.body;
    const file = req.file;

    if (!file || !userId) {
        return res.status(400).json({ error: 'Dosya sunucuya ulaşmadı.' });
    }

    console.log(`--- Yükleme Başladı ---`);
    console.log(`Kullanıcı: ${userId}`);
    console.log(`Dosya: ${title}`);

    try {
        // Dosyayı Telegram'a bir stream olarak gönderiyoruz (Daha güvenli)
        const fileStream = fs.createReadStream(file.path);

        await bot.sendAudio(userId, fileStream, {
            title: title || 'Müzik',
            performer: author || 'YouTube',
            caption: `🎵 *${title}* hazır!\n\n@NexMusicBot`,
            parse_mode: 'Markdown'
        }, {
            filename: `${title || 'music'}.mp3`,
            contentType: 'audio/mpeg'
        });

        console.log(`✅ Telegram'a gönderildi: ${userId}`);

        // Temizlik
        fs.unlinkSync(file.path);
        res.json({ success: true });

    } catch (err) {
        console.error('🔴 TELEGRAM HATASI:', err.message);
        if (file) fs.unlinkSync(file.path);

        // Hatayı bota değil, siteye bildiriyoruz ki kullanıcı bilsin
        res.status(500).json({
            error: 'Bot gönderimi başarısız!',
            details: err.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu aktif: ${PORT}`));
