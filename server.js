// server.js
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { randomBytes } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Proxy list
const PROXIES = [
    'socks5://45.136.228.83:1080',
    'socks5://185.193.157.218:1080',
    'socks5://51.91.210.166:1080',
    'http://176.9.119.170:3128',
    'http://157.230.105.94:3128',
    'http://103.149.162.195:80',
    'http://20.111.54.16:8123'
];

function getRandomProxy() {
    return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

// YouTube ara
app.post('/api/search', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query gerekli' });
    }

    try {
        const proxy = getRandomProxy();
        const command = `yt-dlp --proxy "${proxy}" "ytsearch1:${query}" --get-title --get-id --get-duration --get-thumbnail`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Arama hatası:', error);
                return res.status(500).json({ error: 'Arama başarısız' });
            }

            const lines = stdout.trim().split('\n');
            if (lines.length >= 4) {
                const video = {
                    title: lines[0],
                    id: lines[1],
                    url: `https://youtube.com/watch?v=${lines[1]}`,
                    duration: lines[2],
                    thumbnail: lines[3]
                };
                res.json({ success: true, video });
            } else {
                res.status(404).json({ error: 'Sonuç bulunamadı' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Müzik indir ve Telegram'a gönder
app.post('/api/download', async (req, res) => {
    const { url, chatId } = req.body;
    
    if (!url || !chatId) {
        return res.status(400).json({ error: 'URL ve chatId gerekli' });
    }

    const fileName = `music_${randomBytes(8).toString('hex')}.mp3`;
    const filePath = path.join('/tmp', fileName);

    try {
        const proxy = getRandomProxy();
        
        // yt-dlp ile indir
        const command = `yt-dlp --proxy "${proxy}" -x --audio-format mp3 -o "${filePath}" "${url}"`;
        
        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error('İndirme hatası:', error);
                return res.status(500).json({ error: 'İndirme başarısız' });
            }

            // Dosya var mı kontrol et
            if (fs.existsSync(filePath)) {
                // Telegram'a gönder
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('audio', fs.createReadStream(filePath));

                try {
                    await axios.post(`${TELEGRAM_API}/sendAudio`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    // Dosyayı sil
                    fs.unlinkSync(filePath);
                    
                    res.json({ success: true, message: 'Müzik gönderildi' });
                } catch (telegramError) {
                    console.error('Telegram hatası:', telegramError);
                    res.status(500).json({ error: 'Telegram gönderme hatası' });
                }
            } else {
                res.status(500).json({ error: 'Dosya oluşturulamadı' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', time: Date.now() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server çalışıyor: ${PORT}`);
});
