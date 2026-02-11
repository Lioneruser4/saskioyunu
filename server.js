const express = require('express');
const axios = require('axios');
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

// ========== YOUTUBE ARAMA (YENİ - Regex düzəldildi) ==========
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ error: 'Sorgu gerekli' });
        }

        console.log(`🔍 Arama: ${query}`);
        
        // YouTube arama
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        // Video ID'yi regex ile bul (DÜZƏLDİLDİ)
        const videoIdMatch = response.data.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        
        if (!videoIdMatch || !videoIdMatch[1]) {
            return res.status(404).json({ error: 'Video tapılmadı' });
        }

        const videoId = videoIdMatch[1];
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        console.log(`✅ Video tapıldı: ${videoId}`);
        
        // YouTube API üzerinden bilgi al (ytdl-core olmadan)
        const videoInfoUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
        const infoRes = await axios.get(videoInfoUrl);
        
        res.json({
            success: true,
            title: infoRes.data.title || 'Bilinmeyen Başlık',
            url: videoUrl,
            channel: infoRes.data.author_name || 'YouTube',
            thumbnail: infoRes.data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            video_id: videoId,
            duration: 0
        });

    } catch (error) {
        console.error('❌ Arama hatası:', error.message);
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

        console.log(`📥 İndirme başladı: ${title} - Kullanıcı: ${chat_id}`);

        // Geçici dosya adı
        const fileName = `music_${Date.now()}.mp3`;
        const filePath = path.join('/tmp', fileName);

        // yt-dlp ile MP3 indir
        const ytDlp = spawn('yt-dlp', [
            '-f', 'bestaudio',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-playlist',
            '-o', filePath,
            url
        ]);

        ytDlp.stderr.on('data', (data) => {
            console.log(`yt-dlp: ${data}`);
        });

        ytDlp.on('close', async (code) => {
            if (code !== 0) {
                console.error('❌ yt-dlp hatası:', code);
                return res.status(500).json({ error: 'İndirme başarısız' });
            }

            try {
                // Dosya var mı kontrol et
                let actualFile = filePath;
                if (!fs.existsSync(filePath)) {
                    // .mp3 uzantılı dosyayı bul
                    const files = fs.readdirSync('/tmp');
                    const mp3File = files.find(f => f.startsWith(fileName.replace('.mp3', '')) && f.endsWith('.mp3'));
                    if (mp3File) {
                        actualFile = path.join('/tmp', mp3File);
                    } else {
                        throw new Error('MP3 dosyası oluşturulamadı');
                    }
                }

                // Dosya boyutu kontrol
                const stats = fs.statSync(actualFile);
                if (stats.size < 1000) {
                    throw new Error('Dosya çok küçük');
                }

                console.log(`✅ MP3 hazır: ${stats.size} bytes`);

                // Telegram'a gönder
                const form = new FormData();
                form.append('chat_id', chat_id);
                form.append('audio', fs.createReadStream(actualFile));
                form.append('title', title.substring(0, 100));
                form.append('performer', 'YouTube MP3');
                form.append('caption', `🎵 ${title.substring(0, 50)}`);

                const telegramRes = await axios.post(
                    `https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`,
                    form,
                    { 
                        headers: form.getHeaders(),
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    }
                );

                // Dosyayı sil
                try { fs.unlinkSync(actualFile); } catch(e) {}

                if (telegramRes.data && telegramRes.data.ok) {
                    console.log(`✅ Telegram'a gönderildi: ${chat_id}`);
                    res.json({ success: true, message: 'MP3 gönderildi!' });
                } else {
                    console.error('❌ Telegram hatası:', telegramRes.data);
                    res.status(500).json({ error: 'Telegram gönderilemedi' });
                }

            } catch (error) {
                console.error('❌ İşlem hatası:', error.message);
                // Dosyayı sil
                try { 
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    const files = fs.readdirSync('/tmp');
                    files.forEach(f => {
                        if (f.includes(fileName.replace('.mp3', ''))) {
                            fs.unlinkSync(path.join('/tmp', f));
                        }
                    });
                } catch(e) {}
                res.status(500).json({ error: error.message });
            }
        });

    } catch (error) {
        console.error('❌ İndirme hatası:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== SUNUCUYU BAŞLAT ==========
app.listen(PORT, () => {
    console.log(`🚀 Server çalışıyor: http://localhost:${PORT}`);
    console.log(`🔍 Arama: /search?q=müzik_adı`);
    console.log(`📥 İndirme: /download`);
});
