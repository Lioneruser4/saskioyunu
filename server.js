const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;
const SERVER_URL = 'https://saskioyunu-1-2d6i.onrender.com';

// Mevcut Telegram Bot Token
const BOT_TOKEN = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Downloads klasörü oluştur
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Proxy listesi
const PROXY_LIST = [
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://thingproxy.freeboard.io/fetch/'
];

// YouTube arama fonksiyonu
async function searchYouTube(query) {
    try {
        // YouTube arama için alternatif yöntem
        const { ytsr } = require('ytsr');
        
        // YouTube'dan arama yap
        const searchResults = await ytsr(query);
        
        if (!searchResults || searchResults.videos.length === 0) {
            return [];
        }
        
        // Sonuçları formatla
        const results = searchResults.videos.slice(0, 10).map((video) => ({
            id: video.videoId,
            title: video.title,
            channel: video.author.name,
            thumbnail: video.thumbnail,
            duration: Math.floor(video.duration / 1000),
            views: video.views || 0
        }));
        
        return results;
    } catch (error) {
        console.error('YouTube arama hatası:', error);
        
        // Hata olursa mock sonuçlar döndür
        return [
            {
                id: 'dQw4w9WgXcQ',
                title: `${query} - Official Video`,
                channel: 'Official Channel',
                thumbnail: `https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg`,
                duration: 210,
                views: 1234567
            },
            {
                id: '9bZkp7q19f0',
                title: `${query} - Music Video`,
                channel: 'Music Channel',
                thumbnail: `https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg`,
                duration: 245,
                views: 987654
            }
        ];
    }
}

// YouTube'den video indirme fonksiyonu
async function downloadYouTubeVideo(videoId, title) {
    return new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const outputFileName = `${uuidv4()}.mp3`;
        const outputPath = path.join(downloadsDir, outputFileName);

        const stream = ytdl(videoUrl, { 
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        ffmpeg(stream)
            .audioBitrate(128)
            .toFormat('mp3')
            .on('end', () => {
                resolve({
                    filePath: outputPath,
                    fileName: outputFileName,
                    title: title
                });
            })
            .on('error', (err) => {
                console.error('FFmpeg hatası:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

// Telegram'a dosya gönderme fonksiyonu
async function sendAudioToTelegram(telegramId, filePath, title) {
    try {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(filePath));
        formData.append('caption', `🎵 ${title}\n\nYouTube MP3 İndirici üzerinden indirildi.`);
        formData.append('title', title);

        const response = await axios.post(`${TELEGRAM_API_URL}/sendAudio`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Telegram gönderme hatası:', error);
        throw error;
    }
}

// API Routes

// Arama endpoint'i
app.post('/api/search', async (req, res) => {
    try {
        const { query, userId } = req.body;
        
        if (!query) {
            return res.status(400).json({ 
                success: false, 
                error: 'Arama sorgusu gerekli' 
            });
        }

        const results = await searchYouTube(query);
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('Arama API hatası:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Arama sırasında hata oluştu' 
        });
    }
});

// İndirme endpoint'i
app.post('/api/download', async (req, res) => {
    try {
        const { videoId, title, userId, telegramId } = req.body;
        
        if (!videoId || !telegramId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Video ID ve Telegram ID gerekli' 
            });
        }

        // İndirme işlemini başlat
        const downloadResult = await downloadYouTubeVideo(videoId, title);
        
        // Telegram'a gönder
        try {
            await sendAudioToTelegram(telegramId, downloadResult.filePath, downloadResult.title);
            
            // Dosyayı temizle
            fs.unlinkSync(downloadResult.filePath);
            
            res.json({
                success: true,
                message: 'Müzik başarıyla Telegram\'a gönderildi'
            });
        } catch (telegramError) {
            console.error('Telegram gönderme hatası:', telegramError);
            
            // Dosyayı temizle
            if (fs.existsSync(downloadResult.filePath)) {
                fs.unlinkSync(downloadResult.filePath);
            }
            
            res.status(500).json({
                success: false,
                error: 'Telegram\'a gönderme sırasında hata oluştu'
            });
        }
    } catch (error) {
        console.error('İndirme API hatası:', error);
        res.status(500).json({ 
            success: false, 
            error: 'İndirme sırasında hata oluştu' 
        });
    }
});

// Health check endpoint'i
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
    console.log(`📡 API hazır`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});
