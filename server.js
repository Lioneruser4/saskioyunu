const express = require('express');
const axios = require('axios');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FormData = require('form-data');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.static('public'));

// ========== TELEGRAM BOT ==========
const BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE";

// ========== ANA SAYFA ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== YOUTUBE ARAMA ==========
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Sorgu gerekli' });
        }

        // YouTube arama (ytdl-core ile)
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl);
        
        // Video ID'yi regex ile bul
        const videoIdMatch = response.data.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        
        if (!videoIdMatch) {
            return res.status(404).json({ error: 'Video bulunamadı' });
        }

        const videoId = videoIdMatch[1];
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Video bilgilerini al
        const info = await ytdl.getInfo(videoUrl);
        
        res.json({
            success: true,
            title: info.videoDetails.title,
            url: videoUrl,
            channel: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            video_id: videoId,
            duration: info.videoDetails.lengthSeconds
        });

    } catch (error) {
        console.error('Arama hatası:', error);
        res.status(500).json({ error: 'Arama başarısız: ' + error.message });
    }
});

// ========== MP3 İNDİR VE TELEGRAM'A GÖNDER ==========
app.post('/download', async (req, res) => {
    try {
        const { url, chat_id, title } = req.body;
        
        if (!url || !chat_id) {
            return res.status(400).json({ error: 'URL ve chat_id gerekli' });
        }

        console.log(`İndirme başladı: ${title} - Kullanıcı: ${chat_id}`);

        // Geçici dosya adı
        const fileName = `music_${Date.now()}.mp3`;
        const filePath = path.join('/tmp', fileName);

        // yt-dlp ile MP3 indir (ffmpeg gerekmez)
        const ytDlp = spawn('yt-dlp', [
            '-f', 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-o', filePath,
            url
        ]);

        ytDlp.stderr.on('data', (data) => {
            console.log(`yt-dlp: ${data}`);
        });

        ytDlp.on('close', async (code) => {
            if (code !== 0) {
                return res.status(500).json({ error: 'İndirme başarısız' });
            }

            try {
                // Dosya var mı kontrol et
                if (!fs.existsSync(filePath)) {
                    return res.status(500).json({ error: 'Dosya oluşturulamadı' });
                }

                // Telegram'a gönder
                const form = new FormData();
                form.append('chat_id', chat_id);
                form.append('audio', fs.createReadStream(filePath));
                form.append('title', title.substring(0, 100));
                form.append('performer', 'YouTube MP3');

                const telegramRes = await axios.post(
                    `https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`,
                    form,
                    { headers: form.getHeaders() }
                );

                // Dosyayı sil
                fs.unlinkSync(filePath);

                if (telegramRes.data.ok) {
                    res.json({ success: true, message: 'MP3 gönderildi!' });
                } else {
                    res.status(500).json({ error: 'Telegram gönderilemedi' });
                }

            } catch (error) {
                console.error('Telegram hatası:', error);
                // Dosyayı sil
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                res.status(500).json({ error: 'Telegram hatası: ' + error.message });
            }
        });

    } catch (error) {
        console.error('İndirme hatası:', error);
        res.status(500).json({ error: 'İndirme hatası: ' + error.message });
    }
});

// ========== SUNUCUYU BAŞLAT ==========
app.listen(PORT, () => {
    console.log(`🚀 Site çalışıyor: http://localhost:${PORT}`);
    console.log(`🔍 Arama: /search?q=müzik_adı`);
    console.log(`📥 İndirme: /download`);
});
