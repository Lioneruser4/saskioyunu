const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const yts = require('yt-search');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Token setup
const token = '5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE';
const bot = new TelegramBot(token);

// Middleware to log requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Root route
app.get('/', (req, res) => {
    res.send('Music Downloader API is running! 🚀');
});

// Search API (2026 Optimized)
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    try {
        console.log(`Searching for: ${query}`);
        const r = await yts(query);
        const video = r.videos[0]; // Get the first result

        if (video) {
            res.json({
                title: video.title,
                thumbnail: video.thumbnail,
                url: video.url,
                duration: video.timestamp,
                author: video.author.name
            });
        } else {
            res.status(404).json({ error: 'No videos found' });
        }
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Download & Send API
app.post('/download', async (req, res) => {
    const { url, userId } = req.body;
    if (!url || !userId) return res.status(400).json({ error: 'Missing information' });

    // Respond immediately to UI
    res.json({ status: 'processing' });

    try {
        // Notify user via Bot
        await bot.sendMessage(userId, '🎬 *Hazırlanıyor...* Müzik indiriliyor ve size gönderiliyor.', { parse_mode: 'Markdown' });

        const videoInfo = await yts(url);
        const title = videoInfo.title || 'Music';
        const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const fileName = `${safeTitle}_${Date.now()}.mp3`;
        const filePath = path.join(__dirname, fileName);

        console.log(`Downloading: ${url} to ${filePath}`);

        // Download using yt-dlp (Bypasses OAuth2 errors better than ytdl-core)
        await ytdlp(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: filePath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ]
        });

        if (fs.existsSync(filePath)) {
            console.log(`Sending to user ${userId}...`);
            await bot.sendAudio(userId, filePath, {
                title: title,
                performer: videoInfo.author ? videoInfo.author.name : 'Unknown'
            });

            // Clean up
            fs.unlinkSync(filePath);
            console.log('File cleaned up.');
        } else {
            throw new Error('File was not created by yt-dlp');
        }

    } catch (error) {
        console.error('Download error:', error);
        bot.sendMessage(userId, '❌ *Hata:* Müzik indirilirken bir sorun oluştu. YouTube botumuzu engellemiş olabilir veya link hatalı.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`--- Music Downloader Server ---`);
    console.log(`Port: ${PORT}`);
    console.log(`Bot Status: Running`);
});
