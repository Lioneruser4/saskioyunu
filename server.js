const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE";

// ÇALIŞAN PROXY'LER (2026 güncel)
const PROXIES = [
    'http://20.111.54.16:8123',
    'http://176.9.119.170:3128',
    'http://103.149.162.195:80',
    'http://45.87.61.5:3128',
    'http://158.69.57.150:8888'
];

// Arama endpoint'i
app.post('/api/search', (req, res) => {
    const { query } = req.body;
    console.log('🔍 Arama:', query);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    
    // yt-dlp ile ara
    const cmd = `yt-dlp --proxy "${proxy}" "ytsearch1:${query}" -j --no-warnings 2>/dev/null`;
    
    exec(cmd, (error, stdout) => {
        if (error) {
            console.log('Arama hatası:', error.message);
            return res.json({ success: false, error: 'Bulunamadı' });
        }
        
        try {
            const data = JSON.parse(stdout);
            res.json({
                success: true,
                video: {
                    title: data.title,
                    id: data.id,
                    url: `https://youtube.com/watch?v=${data.id}`,
                    duration: data.duration || 0,
                    thumbnail: `https://img.youtube.com/vi/${data.id}/default.jpg`
                }
            });
        } catch (e) {
            res.json({ success: false, error: 'İşlenemedi' });
        }
    });
});

// İndir ve Telegram'a gönder
app.post('/api/download', async (req, res) => {
    const { url, chatId } = req.body;
    console.log('📥 İndirme:', url, 'Chat:', chatId);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const fileName = `music_${Date.now()}.mp3`;
    const filePath = path.join('/tmp', fileName);

    // yt-dlp ile indir (ses olarak)
    const cmd = `yt-dlp --proxy "${proxy}" -f bestaudio -x --audio-format mp3 -o "${filePath}" "${url}" 2>/dev/null`;
    
    exec(cmd, async (error) => {
        if (error) {
            console.log('İndirme hatası:', error);
            return res.json({ success: false, error: 'İndirme başarısız' });
        }

        // Dosya oluşmasını bekle
        setTimeout(async () => {
            if (fs.existsSync(filePath)) {
                try {
                    // Telegram'a gönder
                    const form = new FormData();
                    form.append('chat_id', chatId);
                    form.append('audio', fs.createReadStream(filePath));
                    form.append('caption', '🎵 Müziğiniz hazır!');

                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, form, {
                        headers: form.getHeaders()
                    });

                    // Temizlik
                    fs.unlinkSync(filePath);
                    res.json({ success: true });
                    
                } catch (e) {
                    console.log('Telegram hatası:', e.message);
                    res.json({ success: false, error: 'Telegram gönderilemedi' });
                }
            } else {
                res.json({ success: false, error: 'Dosya oluşmadı' });
            }
        }, 3000);
    });
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
    res.json({ status: 'online', time: Date.now() });
});

app.get('/', (req, res) => {
    res.send('🎵 Music API 2026 çalışıyor');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});
