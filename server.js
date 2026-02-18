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

// ÇALIŞAN PROXY'LER
const PROXIES = [
    'http://20.111.54.16:8123',
    'http://176.9.119.170:3128',
    'http://103.149.162.195:80'
];

// Arama yap
app.post('/search', (req, res) => {
    const { query } = req.body;
    console.log('Aranıyor:', query);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    
    const cmd = `yt-dlp --proxy "${proxy}" "ytsearch1:${query}" -j --no-warnings`;
    
    exec(cmd, (err, stdout) => {
        if (err) {
            console.log('Hata:', err.message);
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
            res.json({ error: 'Bulunamadı' });
        }
    });
});

// İndir ve Telegram'a gönder
app.post('/indir', async (req, res) => {
    const { url, chat_id } = req.body;
    console.log('İndiriliyor:', url, 'Chat:', chat_id);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    const dosyaAdi = `muzik_${Date.now()}.mp3`;
    const dosyaYolu = path.join('/tmp', dosyaAdi);

    const cmd = `yt-dlp --proxy "${proxy}" -x --audio-format mp3 -o "${dosyaYolu}" "${url}"`;
    
    exec(cmd, async (err) => {
        if (err) {
            console.log('İndirme hatası:', err);
            return res.json({ hata: 'İndirme başarısız' });
        }

        if (fs.existsSync(dosyaYolu)) {
            try {
                const form = new FormData();
                form.append('chat_id', chat_id);
                form.append('audio', fs.createReadStream(dosyaYolu));

                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, form, {
                    headers: form.getHeaders()
                });

                fs.unlinkSync(dosyaYolu);
                res.json({ basarili: true });
                
            } catch (e) {
                console.log('Telegram hatası:', e.message);
                res.json({ hata: 'Telegram gönderilemedi' });
            }
        } else {
            res.json({ hata: 'Dosya oluşmadı' });
        }
    });
});

app.get('/', (req, res) => {
    res.send('Müzik API çalışıyor 2026');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server ${PORT} çalışıyor`));
