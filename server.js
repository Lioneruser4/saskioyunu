// server.js
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

// SADECE 2 PROXY - ÇALIŞANLAR
const PROXIES = [
    'http://20.111.54.16:8123',
    'http://176.9.119.170:3128'
];

// Arama yap
app.post('/search', (req, res) => {
    const { query } = req.body;
    console.log('Aranıyor:', query);

    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)];
    
    // Basit yt-dlp komutu
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

    // yt-dlp ile indir
    const cmd = `yt-dlp --proxy "${proxy}" -x --audio-format mp3 -o "${dosyaYolu}" "${url}"`;
    
    exec(cmd, async (err) => {
        if (err) {
            console.log('İndirme hatası:', err);
            return res.json({ hata: 'İndirme başarısız' });
        }

        // Dosya var mı?
        if (fs.existsSync(dosyaYolu)) {
            try {
                // Telegram'a gönder
                const form = new FormData();
                form.append('chat_id', chat_id);
                form.append('audio', fs.createReadStream(dosyaYolu));

                await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, form, {
                    headers: form.getHeaders()
                });

                // Temizlik
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

app.listen(5000, () => console.log('Server:5000'));
