const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdl = require('@distube/ytdl-core');
const ytsr = require('ytsr');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// DİKKAT: Tokeninizi buraya yazın (Eskisini iptal edip yenisini alın!)
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token, { polling: true });

// Frontend dosyasını sun
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Arama API'si
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Arama metni girilmedi' });

    try {
        let videoData = null;

        // Eğer direkt link ise
        if (ytdl.validateURL(query)) {
            const info = await ytdl.getBasicInfo(query);
            videoData = {
                title: info.videoDetails.title,
                thumbnail: info.videoDetails.thumbnails[0].url,
                url: info.videoDetails.video_url
            };
        } else {
            // İsim ile arama yapılıyorsa
            const filters1 = await ytsr.getFilters(query);
            const filter1 = filters1.get('Type').get('Video');
            const searchResults = await ytsr(filter1.url, { limit: 1 });

            if (searchResults.items.length > 0) {
                const video = searchResults.items[0];
                videoData = {
                    title: video.title,
                    thumbnail: video.bestThumbnail.url,
                    url: video.url
                };
            }
        }

        if (videoData) {
            res.json(videoData);
        } else {
            res.status(404).json({ error: 'Bulunamadı' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// İndirme ve Gönderme API'si
app.post('/download', async (req, res) => {
    const { url, userId } = req.body;
    if (!url || !userId) return res.status(400).send('Eksik bilgi');

    // Frontend'e hemen cevap ver, işlemi arkada yap
    res.send({ status: 'started' });

    try {
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;
        // Dosya ismini temizle
        const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const filePath = path.join(__dirname, `${safeTitle}.mp3`);

        await bot.sendMessage(userId, `⏳ "${title}" indiriliyor, lütfen bekleyin...`);

        const stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
        const fileStream = fs.createWriteStream(filePath);

        stream.pipe(fileStream);

        fileStream.on('finish', async () => {
            await bot.sendAudio(userId, filePath, { title: title, performer: info.videoDetails.author.name });
            fs.unlinkSync(filePath); // Dosyayı sil
        });

    } catch (error) {
        bot.sendMessage(userId, '❌ Hata oluştu: ' + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
