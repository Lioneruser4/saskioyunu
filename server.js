const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE";
const TEMP_DIR = '/tmp';

// 2026 GÜNCEL PROXY LİSTESİ - ÇALIŞANLAR
const PROXIES = [
    'http://20.111.54.16:8123',
    'http://176.9.119.170:3128',
    'http://103.149.162.195:80',
    'http://45.87.61.5:3128',
    'http://158.69.57.150:8888',
    'http://192.155.95.155:8888',
    'http://199.58.181.231:8888'
];

// Hata loglama
const log = {
    info: (msg) => console.log(`[INFO ${new Date().toISOString()}] ${msg}`),
    error: (msg) => console.error(`[ERROR ${new Date().toISOString()}] ${msg}`),
    success: (msg) => console.log(`[SUCCESS ${new Date().toISOString()}] ${msg}`)
};

// Proxy seç
const getProxy = () => PROXIES[Math.floor(Math.random() * PROXIES.length)];

// YouTube ID çıkar
const extractVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// YouTube ara
app.post('/api/search', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ success: false, error: 'Query gerekli' });
    }

    log.info(`Arama: "${query}"`);

    try {
        const proxy = getProxy();
        
        // yt-dlp ile ara (çerez gerekmez)
        const { stdout, stderr } = await execAsync(
            `yt-dlp --proxy "${proxy}" "ytsearch1:${query}" -j --no-warnings --no-check-certificate --extractor-args "youtube:player_client=android"`,
            { timeout: 15000 }
        );

        if (!stdout) {
            throw new Error('Sonuç yok');
        }

        const data = JSON.parse(stdout);
        
        log.success(`Bulundu: ${data.title}`);
        
        res.json({
            success: true,
            video: {
                id: data.id,
                title: data.title,
                url: `https://youtube.com/watch?v=${data.id}`,
                duration: data.duration || 0,
                thumbnail: `https://img.youtube.com/vi/${data.id}/maxresdefault.jpg`,
                channel: data.channel || 'Bilinmiyor'
            }
        });

    } catch (error) {
        log.error(`Arama hatası: ${error.message}`);
        res.json({ success: false, error: 'Arama başarısız' });
    }
});

// Müzik indir ve Telegram'a gönder
app.post('/api/download', async (req, res) => {
    const { url, chatId } = req.body;
    
    if (!url || !chatId) {
        return res.status(400).json({ success: false, error: 'URL ve chatId gerekli' });
    }

    log.info(`İndirme başladı: ${url} | Chat: ${chatId}`);

    const proxy = getProxy();
    const fileName = `music_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
    const filePath = path.join(TEMP_DIR, fileName);

    try {
        // Video bilgilerini al
        const { stdout: infoJson } = await execAsync(
            `yt-dlp --proxy "${proxy}" "${url}" -j --no-warnings --no-check-certificate`,
            { timeout: 10000 }
        );
        
        const info = JSON.parse(infoJson);
        const title = info.title || 'Bilinmeyen Müzik';
        
        // Müziği indir (en iyi kalite)
        await execAsync(
            `yt-dlp --proxy "${proxy}" -f bestaudio --extract-audio --audio-format mp3 --audio-quality 0 ` +
            `-o "${filePath}" "${url}" --no-warnings --no-check-certificate --extractor-args "youtube:player_client=android"`,
            { timeout: 60000 }
        );

        // Dosya var mı kontrol et
        if (!fs.existsSync(filePath)) {
            throw new Error('Dosya oluşturulamadı');
        }

        const stats = fs.statSync(filePath);
        log.success(`Dosya indirildi: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Telegram'a gönder
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('audio', fs.createReadStream(filePath));
        form.append('caption', `🎵 *${title}*\n\n✅ Müziğiniz hazır!\n💿 Kalite: MP3 320kbps`);
        form.append('parse_mode', 'Markdown');
        form.append('title', title.substring(0, 255));
        form.append('performer', info.channel || 'YouTube');

        const telegramRes = await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Content-Length': stats.size
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 60000
            }
        );

        if (telegramRes.data.ok) {
            log.success(`Telegram'a gönderildi: ${chatId}`);
            
            // Temizlik
            fs.unlinkSync(filePath);
            
            res.json({
                success: true,
                message: 'Müzik gönderildi',
                title: title,
                size: stats.size
            });
        } else {
            throw new Error('Telegram gönderme başarısız');
        }

    } catch (error) {
        log.error(`İndirme hatası: ${error.message}`);
        
        // Hatalı dosyayı temizle
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({
            success: false,
            error: 'İndirme başarısız: ' + error.message
        });
    }
});

// YouTube linkinden bilgi al
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL gerekli' });
    }

    try {
        const proxy = getProxy();
        const { stdout } = await execAsync(
            `yt-dlp --proxy "${proxy}" "${url}" -j --no-warnings --no-check-certificate`,
            { timeout: 10000 }
        );

        const info = JSON.parse(stdout);
        
        res.json({
            success: true,
            video: {
                id: info.id,
                title: info.title,
                duration: info.duration,
                thumbnail: `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`,
                channel: info.channel,
                views: info.view_count
            }
        });

    } catch (error) {
        res.json({ success: false, error: 'Bilgi alınamadı' });
    }
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        time: Date.now(),
        version: '2026.2',
        proxies: PROXIES.length
    });
});

app.get('/', (req, res) => {
    res.send(`
        <h1>🎵 Music API 2026</h1>
        <p>Status: <span style="color: green">ONLINE</span></p>
        <p>Server: Render</p>
        <p>Endpoints:</p>
        <ul>
            <li>POST /api/search - Müzik ara</li>
            <li>POST /api/info - Video bilgisi al</li>
            <li>POST /api/download - İndir ve Telegram'a gönder</li>
            <li>GET /health - Sağlık kontrolü</li>
        </ul>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    log.success(`Server ${PORT} çalışıyor`);
    log.info(`Proxy sayısı: ${PROXIES.length}`);
});
