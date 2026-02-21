const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// GERÇEK PROXY LİSTESİ (ÜCRETSİZ)
// =============================================
let proxyList = [
    'http://185.162.231.190:8080',
    'http://103.149.162.194:80',
    'http://186.179.21.126:999',
    'http://45.77.45.109:3128',
    'http://104.248.63.17:8080',
    'http://138.197.157.32:8080',
    'http://159.203.61.169:3128',
    'http://165.227.127.126:80',
    'http://167.99.172.167:3128',
    'http://170.64.176.91:8080'
];

// Aktif görevler
const activeTasks = new Map();
let totalViewsToday = 15247; // Demo sayı

// =============================================
// TELEGRAM VIEW GÖNDERME FONKSİYONU
// =============================================
async function sendTelegramView(url, proxy, taskId, workerId) {
    try {
        // Rastgele User-Agent
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36'
        ];
        
        // Proxy'yi temizle (http:// varsa kullan)
        let proxyUrl = proxy;
        if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
            proxyUrl = 'http://' + proxyUrl;
        }
        
        const agent = new HttpsProxyAgent(proxyUrl);
        
        // GERÇEK Telegram isteği
        const response = await axios.get(url, {
            httpsAgent: agent,
            timeout: 8000,
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            }
        });
        
        // Başarılı view
        totalViewsToday++;
        
        // Log gönder
        io.emit('task_log', {
            taskId: taskId,
            message: `✅ Worker ${workerId}: View gönderildi (${proxy.split('//').pop().split('@').pop() || proxy})`,
            type: 'success'
        });
        
        // Progress güncelle
        const task = activeTasks.get(taskId);
        if (task) {
            task.completed = (task.completed || 0) + 1;
            io.emit('task_progress', {
                taskId: taskId,
                completed: task.completed,
                total: task.total
            });
        }
        
        return true;
    } catch (error) {
        // Hata logu
        io.emit('task_log', {
            taskId: taskId,
            message: `❌ Worker ${workerId}: Proxy başarısız (${proxy.split('//').pop().split('@').pop() || proxy})`,
            type: 'error'
        });
        return false;
    }
}

// =============================================
// WORKER BAŞLAT
// =============================================
async function startWorker(taskId, url, viewCount, workerId, speed) {
    const delays = {
        slow: { min: 3000, max: 7000 },
        normal: { min: 1500, max: 3000 },
        fast: { min: 500, max: 1500 }
    };
    
    const delayRange = delays[speed] || delays.normal;
    let successCount = 0;
    
    for (let i = 0; i < viewCount; i++) {
        // Görev iptal edildi mi?
        if (!activeTasks.has(taskId)) break;
        
        // Rastgele proxy seç
        if (proxyList.length === 0) {
            io.emit('task_log', {
                taskId: taskId,
                message: `⚠️ Worker ${workerId}: Proxy kalmadı, bekleniyor...`,
                type: 'error'
            });
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }
        
        const proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
        
        // View gönder
        const success = await sendTelegramView(url, proxy, taskId, workerId);
        if (success) successCount++;
        
        // Rastgele bekleme
        const delay = Math.random() * (delayRange.max - delayRange.min) + delayRange.min;
        await new Promise(r => setTimeout(r, delay));
    }
    
    io.emit('task_log', {
        taskId: taskId,
        message: `🔄 Worker ${workerId}: Tamamlandı (${successCount}/${viewCount} başarılı)`,
        type: 'info'
    });
}

// =============================================
// API ENDPOINT'LERİ
// =============================================
app.post('/api/send-views', async (req, res) => {
    const { url, views, speed } = req.body;
    
    console.log('📨 Yeni görev:', { url, views, speed });
    
    // URL kontrolü
    if (!url || !url.match(/t\.me\/([^\/]+)\/(\d+)/)) {
        return res.status(400).json({ error: 'Geçersiz Telegram linki' });
    }
    
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Worker sayısını ayarla
    const workerCount = speed === 'fast' ? 10 : (speed === 'normal' ? 5 : 2);
    const viewsPerWorker = Math.floor(views / workerCount);
    
    console.log(`🚀 ${workerCount} worker başlatılıyor...`);
    
    // Görevi kaydet
    activeTasks.set(taskId, {
        id: taskId,
        url: url,
        total: views,
        completed: 0,
        workers: workerCount,
        speed: speed,
        startTime: Date.now()
    });
    
    // Worker'ları başlat (arka planda)
    for (let i = 0; i < workerCount; i++) {
        const workerViews = i === workerCount - 1 
            ? views - (viewsPerWorker * (workerCount - 1))
            : viewsPerWorker;
        
        // Hemen başlat (arka planda)
        startWorker(taskId, url, workerViews, i + 1, speed);
        
        // Worker'lar arasında küçük bekleme
        await new Promise(r => setTimeout(r, 100));
    }
    
    res.json({ 
        success: true, 
        taskId: taskId,
        message: `${views} görüntülenme için ${workerCount} worker başlatıldı`
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        proxyCount: proxyList.length,
        todayViews: totalViewsToday,
        activeTasks: activeTasks.size
    });
});

app.get('/api/task-status/:taskId', (req, res) => {
    const task = activeTasks.get(req.params.taskId);
    if (task) {
        res.json(task);
    } else {
        res.status(404).json({ error: 'Görev bulunamadı' });
    }
});

// =============================================
// SOCKET.IO BAĞLANTILARI
// =============================================
io.on('connection', (socket) => {
    console.log('🟢 Yeni istemci bağlandı:', socket.id);
    
    // İstatistikleri gönder
    socket.emit('stats', {
        proxyCount: proxyList.length,
        todayViews: totalViewsToday,
        activeTasks: activeTasks.size
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 İstemci ayrıldı:', socket.id);
    });
});

// Her 5 saniyede bir istatistikleri yayınla
setInterval(() => {
    io.emit('stats', {
        proxyCount: proxyList.length,
        todayViews: totalViewsToday,
        activeTasks: activeTasks.size
    });
}, 5000);

// =============================================
// SUNUCUYU BAŞLAT
// =============================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
    console.log(`📡 Render URL: https://saskioyunu-1-2d6i.onrender.com`);
});
