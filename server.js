const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const yts = require('yt-search');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();

// Klasör ayarları
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(express.json());
app.use(cors());

// Bot yapılandırması
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token, { polling: false });

const VERSION = "V25 - NEXUS PRO";
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://saskioyunu-1.onrender.com';

// Anti-sleep sistemi
app.get('/ping', (req, res) => res.send('alive'));
setInterval(async () => {
    try {
        await axios.get(`${SELF_URL}/ping`, { timeout: 8000 });
        console.log(`[${VERSION}] Heartbeat OK`);
    } catch (e) {
        console.log(`[${VERSION}] Heartbeat skip`);
    }
}, 25000);

// User agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Ana sayfa
app.get('/', (req, res) => {
    res.send(`🎵 NexMusic ${VERSION} - Sistem Aktif!`);
});

// 🔍 ARAMA
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Sorgu eksik' });
    
    try {
        console.log(`[SEARCH] Aranan: ${query}`);
        const result = await yts(query);
        const video = result.videos[0];
        
        if (video) {
            res.json({
                title: video.title,
                thumbnail: video.thumbnail,
                url: video.url,
                author: video.author.name,
                seconds: video.seconds,
                duration: video.timestamp
            });
        } else {
            res.status(404).json({ error: 'Sonuç bulunamadı' });
        }
    } catch (err) {
        console.error('[SEARCH ERROR]', err.message);
        res.status(500).json({ error: 'Arama hatası' });
    }
});

// 🎵 MÜZİK İNDİRME VE GÖNDERME - YENİ SİSTEM
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    
    if (!url || !userId) {
        return res.status(400).json({ error: 'Eksik parametreler' });
    }

    const timestamp = Date.now();
    const tempFile = path.join(UPLOADS_DIR, `temp_${timestamp}.mp4`);
    const finalFile = path.join(UPLOADS_DIR, `music_${timestamp}.mp3`);

    console.log(`[DOWNLOAD] İstek: ${title} - User: ${userId}`);

    try {
        // Video ID çıkar
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('Geçersiz YouTube URL');
        }

        let downloadSuccess = false;
        let streamUrl = null;

        // METOD 1: yt-dlp ile direkt indirme (en güvenilir)
        try {
            console.log('[DOWNLOAD] yt-dlp deneniyor...');
            const ytdlpCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio" --no-playlist --extract-audio --audio-format mp3 --audio-quality 0 -o "${finalFile.replace('.mp3', '.%(ext)s')}" "${url}"`;
            
            await execAsync(ytdlpCmd, { timeout: 120000 });
            
            // Dosya kontrolü (yt-dlp bazen farklı uzantı verir)
            const possibleFiles = [
                finalFile,
                finalFile.replace('.mp3', '.m4a'),
                finalFile.replace('.mp3', '.webm')
            ];
            
            for (const file of possibleFiles) {
                if (fs.existsSync(file)) {
                    if (file !== finalFile) {
                        // FFmpeg ile mp3'e çevir
                        await convertToMp3(file, finalFile);
                        fs.unlinkSync(file);
                    }
                    downloadSuccess = true;
                    console.log('[DOWNLOAD] yt-dlp başarılı!');
                    break;
                }
            }
        } catch (e) {
            console.log('[DOWNLOAD] yt-dlp başarısız:', e.message);
        }

        // METOD 2: Cobalt API
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Cobalt API deneniyor...');
                const cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
                    url: url,
                    isAudioOnly: true,
                    audioFormat: 'mp3'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                if (cobaltResp.data && cobaltResp.data.url) {
                    streamUrl = cobaltResp.data.url;
                    await downloadFromStream(streamUrl, tempFile);
                    await convertToMp3(tempFile, finalFile);
                    downloadSuccess = true;
                    console.log('[DOWNLOAD] Cobalt başarılı!');
                }
            } catch (e) {
                console.log('[DOWNLOAD] Cobalt başarısız:', e.message);
            }
        }

        // METOD 3: Invidious Fallback
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Invidious deneniyor...');
                streamUrl = `https://invidious.projectsegfau.lt/latest_version?id=${videoId}&itag=140`;
                await downloadFromStream(streamUrl, tempFile);
                await convertToMp3(tempFile, finalFile);
                downloadSuccess = true;
                console.log('[DOWNLOAD] Invidious başarılı!');
            } catch (e) {
                console.log('[DOWNLOAD] Invidious başarısız:', e.message);
            }
        }

        if (!downloadSuccess || !fs.existsSync(finalFile)) {
            throw new Error('Müzik indirilemedi. Tüm yöntemler başarısız oldu.');
        }

        // Dosya boyutu kontrolü
        const stats = fs.statSync(finalFile);
        if (stats.size < 10000) { // 10KB'den küçükse hatalı
            throw new Error('İndirilen dosya çok küçük veya bozuk');
        }

        console.log(`[DOWNLOAD] Dosya hazır: ${stats.size} bytes`);

        // Telegram'a gönder
        console.log('[TELEGRAM] Gönderiliyor...');
        await bot.sendAudio(userId, finalFile, {
            title: title || 'Müzik',
            performer: author || 'NexMusic',
            duration: parseInt(duration) || 0,
            caption: `🎵 ${title}\n🎤 ${author}\n\n✅ ${VERSION} ile indirildi`
        }, {
            filename: sanitizeFilename(title) + '.mp3',
            contentType: 'audio/mpeg'
        });

        console.log('[TELEGRAM] Gönderim başarılı!');
        res.json({ success: true, message: 'Müzik başarıyla gönderildi' });

        // Temizlik
        setTimeout(() => {
            [tempFile, finalFile].forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlink(file, () => {});
                }
            });
        }, 10000);

    } catch (err) {
        console.error('[DOWNLOAD ERROR]', err.message);
        res.status(500).json({ 
            error: err.message || 'İndirme hatası. Lütfen tekrar deneyin.' 
        });

        // Hata durumunda temizlik
        [tempFile, finalFile].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
});

// Yardımcı fonksiyonlar
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function downloadFromStream(url, outputPath) {
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 60000,
        headers: { 'User-Agent': getRandomUA() }
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        setTimeout(() => reject(new Error('Stream timeout')), 60000);
    });
}

async function convertToMp3(inputPath, outputPath) {
    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`;
    try {
        await execAsync(ffmpegCmd, { timeout: 60000 });
    } catch (err) {
        throw new Error('Audio dönüştürme hatası');
    }
}

function sanitizeFilename(name) {
    return (name || 'music')
        .replace(/[^a-z0-9\s]/gi, '_')
        .replace(/\s+/g, '_')
        .substring(0, 50);
}

// Sunucu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎵 ${VERSION} - ONLINE`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`🤖 Bot: Active`);
    console.log(`${'='.repeat(50)}\n`);
});
