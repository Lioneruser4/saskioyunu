const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
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
// GERÇEK PROXY LİSTESİ (ÜCRETSİZ - SÜREKLİ GÜNCEL)
// =============================================
const PROXY_SOURCES = [
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list.txt',
    'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt'
];

// Aktif görevler
const activeTasks = new Map();
let proxyList = [];
let totalViewsToday = 0;

// =============================================
// PROXY'LERİ ÇEK (HER 30 DAKİKADA BİR GÜNCELLE)
// =============================================
async function fetchProxies() {
    console.log('📡 Proxy listesi güncelleniyor...');
    const newProxies = new Set();
    
    for (const source of PROXY_SOURCES) {
        try {
            const response = await axios.get(source, { timeout: 10000 });
            const lines = response.data.split('\n');
            
            lines.forEach(line => {
                line = line.trim();
                // IP:PORT formatını kontrol et
                if (line.match(/^\d+\.\d+\.\d+\.\d+:\d+$/)) {
                    newProxies.add(`http://${line}`);
                }
            });
            console.log(`✅ ${source.split('/').pop()} kaynağından proxy alındı`);
        } catch (error) {
            console.log(`❌ Proxy kaynağı başarısız: ${source}`);
        }
    }
    
    proxyList = [...newProxies];
    console.log(`🟢 Toplam ${proxyList.length} aktif proxy yüklendi`);
    
    // İstatistikleri yayınla
    io.emit('stats', {
        proxyCount: proxyList.length,
        todayViews: totalViewsToday,
        activeTasks: activeTasks.size
    });
}

// İlk yükleme
fetchProxies();

// Her 30 dakikada bir güncelle
setInterval(fetchProxies, 30 * 60 * 1000);

// İstatistikleri her 5 saniyede yayınla
setInterval(() => {
    io.emit('stats', {
        proxyCount: proxyList.length,
        todayViews: totalViewsToday,
        activeTasks: activeTasks.size
    });
}, 5000);

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
        
        const agent = new HttpsProxyAgent(proxy);
        
        // GERÇEK Telegram isteği
        const response = await axios.get(url, {
            httpsAgent: agent,
            timeout: 10000,
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Tüm durumları kabul et
            }
        });
        
        // Başarılı view
        totalViewsToday++;
        
        // Log gönder
        io.to(taskId).emit('task_log', {
            taskId: taskId,
            message: `✅ Worker ${workerId}: View gönderildi (${proxy.split('@').pop() || proxy})`,
            type: 'success'
        });
        
        // Progress güncelle
        const task = activeTasks.get(taskId);
        if (task) {
            task.completed++;
            io.to(taskId).emit('task_progress', {
                taskId: taskId,
                completed: task.completed,
                total: task.total
            });
        }
        
        return true;
    } catch (error) {
        // Hata logu
        io.to(taskId).emit('task_log', {
            taskId: taskId,
            message: `❌ Worker ${workerId}: Proxy başarısız (${proxy.split('@').pop() || proxy})`,
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
    
    const delayRange = delays[speed];
    let successCount = 0;
    
    for (let i = 0; i < viewCount; i++) {
        // Görev iptal edildi mi?
        if (!activeTasks.has(taskId)) break;
        
        // Rastgele proxy seç
        if (proxyList.length === 0) {
            io.to(taskId).emit('task_log', {
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
    
    io.to(taskId).emit('task_log', {
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
    
    // URL kontrolü
    if (!url || !url.match(/t\.me\/([^\/]+)\/(\d+)/)) {
        return res.status(400).json({ error: 'Geçersiz Telegram linki' });
    }
    
    // Proxy kontrolü
    if (proxyList.length === 0) {
        return res.status(503).json({ error: 'Proxy listesi boş, lütfen bekleyin' });
    }
    
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Worker sayısını ayarla
    const workerCount = speed === 'fast' ? 15 : (speed === 'normal' ? 8 : 4);
    const viewsPerWorker = Math.floor(views / workerCount);
    
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
    
    // Worker'ları başlat
    for (let i = 0; i < workerCount; i++) {
        const workerViews = i === workerCount - 1 
            ? views - (viewsPerWorker * (workerCount - 1))
            : viewsPerWorker;
        
        // Hemen başlat (arka planda)
        startWorker(taskId, url, workerViews, i + 1, speed);
        
        // Worker'lar arasında küçük bekleme
        await new Promise(r => setTimeout(r, 100));
    }
    
    // 1 saat sonra görevi temizle
    setTimeout(() => {
        activeTasks.delete(taskId);
    }, 60 * 60 * 1000);
    
    res.json({ 
        success: true, 
        taskId: taskId,
        message: `${views} görüntülenme için ${workerCount} worker başlatıldı`
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
    
    socket.on('join_task', (taskId) => {
        socket.join(taskId);
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 İstemci ayrıldı:', socket.id);
    });
});

// =============================================
// SUNUCUYU BAŞLAT
// =============================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor`);
    console.log(`📡 https://saskioyunu-1-2d6i.onrender.com üzerinden erişilebilir`);
});
