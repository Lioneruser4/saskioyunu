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

const VERSION = "V26 - MULTI-SOURCE PRO";
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

// 🎵 MÜZİK İNDİRME VE GÖNDERME - 2026 GÜNCEL ÜCRETSİZ SİTELER
app.get('/download-direct', async (req, res) => {
    const { url, userId, title, author, duration } = req.query;
    
    if (!url || !userId) {
        return res.status(400).json({ error: 'Eksik parametreler' });
    }

    const timestamp = Date.now();
    const tempFile = path.join(UPLOADS_DIR, `temp_${timestamp}.tmp`);
    const finalFile = path.join(UPLOADS_DIR, `music_${timestamp}.mp3`);

    console.log(`[DOWNLOAD] İstek: ${title} - User: ${userId}`);

    try {
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('Geçersiz YouTube URL');
        }

        let downloadSuccess = false;
        let streamUrl = null;

        // ═══════════════════════════════════════════════════════════
        // METOD 1: Y2MATE.NU (2026'da çalışıyor, hesapsız)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Y2Mate.nu deneniyor...');
                
                const analyzeUrl = `https://www.y2mate.nu/api/analyze?url=${encodeURIComponent(url)}&format=mp3`;
                const analyzeResp = await axios.get(analyzeUrl, {
                    headers: { 'User-Agent': getRandomUA() },
                    timeout: 20000
                });

                if (analyzeResp.data && analyzeResp.data.download_url) {
                    streamUrl = analyzeResp.data.download_url;
                    await downloadFromStream(streamUrl, tempFile);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                        await convertToMp3(tempFile, finalFile);
                        downloadSuccess = true;
                        console.log('[DOWNLOAD] Y2Mate.nu başarılı!');
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] Y2Mate.nu başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 2: LOADER.TO (API free, 2026 aktif)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Loader.to deneniyor...');
                
                const loaderResp = await axios.get(`https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(url)}`, {
                    headers: { 
                        'User-Agent': getRandomUA(),
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 20000
                });

                if (loaderResp.data && loaderResp.data.download_url) {
                    streamUrl = loaderResp.data.download_url;
                    await downloadFromStream(streamUrl, tempFile);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                        await convertToMp3(tempFile, finalFile);
                        downloadSuccess = true;
                        console.log('[DOWNLOAD] Loader.to başarılı!');
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] Loader.to başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 3: YTMP3.NU (Direkt mp3 converter, ücretsiz)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] YTmp3.nu deneniyor...');
                
                const ytmp3Resp = await axios.post('https://ytmp3.nu/api/convert', {
                    url: url,
                    quality: '192'
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': getRandomUA()
                    },
                    timeout: 25000
                });

                if (ytmp3Resp.data && ytmp3Resp.data.url) {
                    streamUrl = ytmp3Resp.data.url;
                    await downloadFromStream(streamUrl, tempFile);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                        await convertToMp3(tempFile, finalFile);
                        downloadSuccess = true;
                        console.log('[DOWNLOAD] YTmp3.nu başarılı!');
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] YTmp3.nu başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 4: COBALT.TOOLS (2026 update, ücretsiz API)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Cobalt.tools deneniyor...');
                
                const cobaltResp = await axios.post('https://api.cobalt.tools/api/json', {
                    url: url,
                    isAudioOnly: true,
                    audioFormat: 'mp3',
                    filenamePattern: 'basic'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': getRandomUA()
                    },
                    timeout: 25000
                });

                if (cobaltResp.data && cobaltResp.data.url) {
                    streamUrl = cobaltResp.data.url;
                    await downloadFromStream(streamUrl, tempFile);
                    
                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                        await convertToMp3(tempFile, finalFile);
                        downloadSuccess = true;
                        console.log('[DOWNLOAD] Cobalt.tools başarılı!');
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] Cobalt.tools başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 5: SAVEFROM.NET (API endpoint, 2026 aktif)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] SaveFrom.net deneniyor...');
                
                const savefromResp = await axios.get(`https://api.savefrom.net/info?url=${encodeURIComponent(url)}`, {
                    headers: { 'User-Agent': getRandomUA() },
                    timeout: 20000
                });

                if (savefromResp.data && savefromResp.data[0] && savefromResp.data[0].url) {
                    // En iyi audio kalitesini bul
                    const audioUrls = savefromResp.data[0].url.filter(u => u.type && u.type.includes('audio'));
                    if (audioUrls.length > 0) {
                        streamUrl = audioUrls[0].url;
                        await downloadFromStream(streamUrl, tempFile);
                        
                        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                            await convertToMp3(tempFile, finalFile);
                            downloadSuccess = true;
                            console.log('[DOWNLOAD] SaveFrom.net başarılı!');
                        }
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] SaveFrom.net başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 6: INVIDIOUS INSTANCES (Direkt stream, her zaman çalışır)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Invidious deneniyor...');
                
                const invidiousInstances = [
                    'https://invidious.projectsegfau.lt',
                    'https://invidious.fdn.fr',
                    'https://inv.nadeko.net',
                    'https://invidious.nerdvpn.de'
                ];

                for (const instance of invidiousInstances) {
                    try {
                        streamUrl = `${instance}/latest_version?id=${videoId}&itag=140`;
                        await downloadFromStream(streamUrl, tempFile);
                        
                        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                            await convertToMp3(tempFile, finalFile);
                            downloadSuccess = true;
                            console.log(`[DOWNLOAD] Invidious (${instance}) başarılı!`);
                            break;
                        }
                    } catch (e) {
                        console.log(`[DOWNLOAD] ${instance} başarısız, sonrakine geçiliyor...`);
                        continue;
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] Tüm Invidious instanceları başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // METOD 7: PIPED API (2026 açık kaynak, ücretsiz)
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess) {
            try {
                console.log('[DOWNLOAD] Piped API deneniyor...');
                
                const pipedResp = await axios.get(`https://pipedapi.kavin.rocks/streams/${videoId}`, {
                    headers: { 'User-Agent': getRandomUA() },
                    timeout: 20000
                });

                if (pipedResp.data && pipedResp.data.audioStreams) {
                    const bestAudio = pipedResp.data.audioStreams
                        .filter(s => s.mimeType && s.mimeType.includes('audio'))
                        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

                    if (bestAudio && bestAudio.url) {
                        streamUrl = bestAudio.url;
                        await downloadFromStream(streamUrl, tempFile);
                        
                        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 50000) {
                            await convertToMp3(tempFile, finalFile);
                            downloadSuccess = true;
                            console.log('[DOWNLOAD] Piped API başarılı!');
                        }
                    }
                }
            } catch (e) {
                console.log('[DOWNLOAD] Piped API başarısız:', e.message);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // Son kontrol
        // ═══════════════════════════════════════════════════════════
        if (!downloadSuccess || !fs.existsSync(finalFile)) {
            throw new Error('Müzik indirilemedi. Lütfen daha sonra tekrar deneyin.');
        }

        const stats = fs.statSync(finalFile);
        if (stats.size < 50000) {
            throw new Error('Dosya çok küçük veya bozuk');
        }

        console.log(`[DOWNLOAD] Başarılı! Dosya boyutu: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

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

        console.log('[TELEGRAM] Başarılı!');
        res.json({ success: true, message: 'Müzik gönderildi' });

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
