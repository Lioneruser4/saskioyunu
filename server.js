const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');

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

// GERÇEK YouTube arama fonksiyonu
async function searchYouTube(query) {
    try {
        console.log(`Aranıyor: ${query}`);
        
        // YouTube'un mobil API'sini kullan
        const searchUrl = `https://m.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
            }
        });
        
        const html = response.data;
        
        // Video ID'lerini çıkar
        const videoIdRegex = /"videoId":"([^"]+)"/g;
        const videoIds = [];
        let match;
        
        while ((match = videoIdRegex.exec(html)) !== null) {
            videoIds.push(match[1]);
        }
        
        // Başlıkları çıkar
        const titleRegex = /"title":{"runs":\[{"text":"([^"]+)"}/g;
        const titles = [];
        
        while ((match = titleRegex.exec(html)) !== null) {
            titles.push(match[1]);
        }
        
        // Kanal isimlerini çıkar
        const channelRegex = /"ownerText":{"runs":\[{"text":"([^"]+)"}/g;
        const channels = [];
        
        while ((match = channelRegex.exec(html)) !== null) {
            channels.push(match[1]);
        }
        
        // Süreleri çıkar
        const durationRegex = /"lengthText":{"accessibility":{"accessibilityData":{"label":"([^"]+)"}}/g;
        const durations = [];
        
        while ((match = durationRegex.exec(html)) !== null) {
            durations.push(match[1]);
        }
        
        // Görüntülenmeleri çıkar
        const viewsRegex = /"shortViewCountText":{"simpleText":"([^"]+)"/g;
        const views = [];
        
        while ((match = viewsRegex.exec(html)) !== null) {
            views.push(match[1]);
        }
        
        // Sonuçları birleştir
        const results = [];
        const maxResults = Math.min(videoIds.length, 10);
        
        for (let i = 0; i < maxResults; i++) {
            if (videoIds[i]) {
                const durationStr = durations[i] || '0:00';
                const durationParts = durationStr.split(':').map(Number);
                const durationSeconds = durationParts.length === 2 ? 
                    durationParts[0] * 60 + durationParts[1] : 
                    durationParts[0] || 0;
                
                results.push({
                    id: videoIds[i],
                    title: titles[i] || `${query} - Video`,
                    channel: channels[i] || 'Unknown Channel',
                    thumbnail: `https://img.youtube.com/vi/${videoIds[i]}/mqdefault.jpg`,
                    duration: durationSeconds,
                    views: views[i] || '0'
                });
            }
        }
        
        console.log(`${results.length} sonuç bulundu`);
        return results;
        
    } catch (error) {
        console.error('YouTube arama hatası:', error);
        return [];
    }
}

// GERÇEK YouTube indirme fonksiyonu
async function downloadYouTubeVideo(videoId, title) {
    return new Promise((resolve, reject) => {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const outputFileName = `${uuidv4()}.mp3`;
        const outputPath = path.join(downloadsDir, outputFileName);

        console.log(`🎵 İndiriliyor: ${title} (${videoId})`);

        const stream = ytdl(videoUrl, { 
            quality: 'highestaudio',
            filter: 'audioonly'
        });

        ffmpeg(stream)
            .audioBitrate(128)
            .toFormat('mp3')
            .on('start', (commandLine) => {
                console.log('⬇️ FFmpeg başlatıldı');
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`📊 İndirme: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log(`✅ İndirme tamamlandı: ${outputPath}`);
                resolve({
                    filePath: outputPath,
                    fileName: outputFileName,
                    title: title
                });
            })
            .on('error', (err) => {
                console.error('❌ İndirme hatası:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

// GERÇEK Telegram gönderme fonksiyonu
async function sendAudioToTelegram(telegramId, filePath, title) {
    try {
        console.log(`📤 Telegram'a gönderiliyor: ${title}`);
        
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(filePath));
        formData.append('caption', `🎵 ${title}\n\n🤖 YouTube MP3 İndirici ile indirildi\n🌐 ${SERVER_URL}`);
        formData.append('title', title);
        formData.append('parse_mode', 'HTML');

        const response = await axios.post(`${TELEGRAM_API_URL}/sendAudio`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data'
            },
            timeout: 30000
        });

        console.log('✅ Telegram gönderildi:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Telegram gönderme hatası:', error);
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

        console.log(`🔍 Arama isteği: ${query} (User: ${userId})`);
        const results = await searchYouTube(query);
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('❌ Arama API hatası:', error);
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

        console.log(`⬇️ İndirme isteği: ${title} (User: ${userId}, Telegram: ${telegramId})`);

        // İndirme işlemini başlat
        const downloadResult = await downloadYouTubeVideo(videoId, title);
        
        // Telegram'a gönder
        await sendAudioToTelegram(telegramId, downloadResult.filePath, downloadResult.title);
        
        // Dosyayı temizle
        fs.unlinkSync(downloadResult.filePath);
        console.log('🗑️ Dosya temizlendi');
        
        res.json({
            success: true,
            message: 'Müzik başarıyla Telegram\'a gönderildi'
        });
        
    } catch (error) {
        console.error('❌ İndirme API hatası:', error);
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
        uptime: process.uptime(),
        server: SERVER_URL
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`🚀 Sunucu başlatıldı: http://localhost:${PORT}`);
    console.log(`🌐 Sunucu URL: ${SERVER_URL}`);
    console.log(`🤖 Telegram Bot: Aktif`);
    console.log(`📁 Downloads: ${downloadsDir}`);
    console.log('✅ Sistem hazır!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Kapatılıyor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received. Kapatılıyor...');
    process.exit(0);
});
