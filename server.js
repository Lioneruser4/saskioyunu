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

// PROXY LIST
const PROXIES = [
    'http://20.111.54.16:8123',
    'http://176.9.119.170:3128',
    'http://103.149.162.195:80'
];

// Arama
app.post('/search', (req, res) => {
    const { query } = req.body;
    console.log('Aranıyor:', query);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    
    // yt-dlp komutu
    const cmd = `yt-dlp --proxy "${proxy}" "ytsearch1:${query}" -j --no-warnings 2>/dev/null`;
    
    exec(cmd, (err, stdout) => {
        if (err) {
            return res.json({ error: 'Bulunamadı' });
        }
        
        try {
            const data = JSON.parse(stdout);
            res.json({
                baslik: data.title,
                id: data.id,
                url: `https://youtube.com/watch?v=${data.id}`,
                sure: data.duration || 0
            });
        } catch (e) {
            res.json({ error: 'Hata' });
        }
    });
});

// İndir
app.post('/indir', async (req, res) => {
    const { url, chat_id } = req.body;
    console.log('İndiriliyor:', url);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const fileName = `muzik_${Date.now()}.mp3`;
    const filePath = path.join('/tmp', fileName);

    const cmd = `yt-dlp --proxy "${proxy}" -x --audio-format mp3 -o "${filePath}" "${url}" 2>/dev/null`;
    
    exec(cmd, async (err) => {
        if (err) {
            return res.json({ hata: 'İndirme başarısız' });
        }

        setTimeout(async () => {
            if (fs.existsSync(filePath)) {
                try {
                    const form = new FormData();
                    form.append('chat_id', chat_id);
                    form.append('audio', fs.createReadStream(filePath));

                    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, form, {
                        headers: form.getHeaders()
                    });

                    fs.unlinkSync(filePath);
                    res.json({ basarili: true });
                    
                } catch (e) {
                    res.json({ hata: 'Telegram hatası' });
                }
            } else {
                res.json({ hata: 'Dosya yok' });
            }
        }, 3000);
    });
});

app.get('/', (req, res) => {
    res.send('API çalışıyor');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} çalışıyor`);
});
