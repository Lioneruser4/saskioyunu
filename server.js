const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// ========== KONFİG ==========
const BOT_TOKEN = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// ========== FFMPEG AYARI ==========
ffmpeg.setFfmpegPath(ffmpegStatic);

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== DOWNLOAD KLASÖRÜ ==========
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

// ========== API ENDPOINTS ==========

// 🔍 YOUTUBE ARAMA - İLK SONUCU DÖNDÜR
app.get('/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query) {
        return res.status(400).json({ error: 'Arama kelimesi gerekli' });
    }
    
    try {
        // YouTube linki mi kontrol et
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            const info = await ytdl.getInfo(query);
            return res.json([{
                id: info.videoDetails.videoId,
                title: info.videoDetails.title,
                url: query,
                duration: parseInt(info.videoDetails.lengthSeconds),
                thumbnail: info.videoDetails.thumbnails[0]?.url
            }]);
        }
        
        // Normal arama
        const result = await ytSearch(query);
        const videos = result.videos.slice(0, 5).map(video => ({
            id: video.videoId,
            title: video.title,
            url: video.url,
            duration: video.duration.seconds,
            thumbnail: video.thumbnail
        }));
        
        res.json(videos);
        
    } catch (error) {
        console.error('Arama hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// ⬇️ MP3 İNDİR ve TELEGRAM'A GÖNDER
app.post('/download', async (req, res) => {
    const { url, userId, userName, userUsername } = req.body;
    
    if (!url || !userId) {
        return res.status(400).json({ error: 'URL ve User ID gerekli' });
    }
    
    try {
        // YouTube video bilgilerini al
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;
        const safeTitle = title.replace(/[^\w\s]/gi, '_');
        const fileName = `${safeTitle}-${Date.now()}.mp3`;
        const filePath = path.join(DOWNLOAD_DIR, fileName);
        
        console.log(`📥 İndirme başladı: ${title}`);
        
        // MP3 indir ve dönüştür
        const audioStream = ytdl(url, { quality: 'highestaudio' });
        
        await new Promise((resolve, reject) => {
            ffmpeg(audioStream)
                .audioBitrate(128)
                .audioCodec('libmp3lame')
                .format('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(filePath);
        });
        
        console.log(`✅ MP3 hazır: ${fileName}`);
        
        // TELEGRAM'A GÖNDER
        try {
            await bot.telegram.sendAudio(
                parseInt(userId),
                { source: filePath },
                {
                    title: title,
                    performer: 'YouTube Music',
                    caption: `🎵 **${title}**\n\n` +
                            `✅ Merhaba ${userName || 'Müzik Sever'}! Müziğin hazır.\n` +
                            `📥 YouTube'dan indirildi.\n\n` +
                            `🎧 Keyifli dinlemeler!`
                }
            );
            
            console.log(`📱 Telegram'a gönderildi: ${userId}`);
            
            // Dosyayı sil
            fs.unlinkSync(filePath);
            console.log(`🗑️ Dosya silindi: ${fileName}`);
            
            res.json({
                success: true,
                title: title
            });
            
        } catch (telegramError) {
            console.error('Telegram gönderme hatası:', telegramError);
            
            // Dosyayı temizle
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            res.status(500).json({ error: 'Telegram\'a gönderilemedi: ' + telegramError.message });
        }
        
    } catch (error) {
        console.error('İndirme hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🔋 SAĞLIK KONTROLÜ
app.get('/health', (req, res) => {
    res.json({ 
        status: 'active', 
        service: 'Music Downloader API',
        time: new Date().toISOString()
    });
});

// ========== BOTU BAŞLAT ==========
bot.launch()
    .then(() => console.log('🤖 Telegram bot aktif!'))
    .catch(err => console.error('Bot hatası:', err));

// ========== SUNUCUYU BAŞLAT ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
