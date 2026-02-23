const express = require('express');
const session = require('express-session');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cluster = require('cluster');
const os = require('os');
const Queue = require('bull');
const Redis = require('ioredis');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');

// Plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
puppeteer.use(AnonymizeUAPlugin());

const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis bağlantısı (Render'da Redis eklemeniz gerek)
const redis = new Redis(REDIS_URL);
const viewQueue = new Queue('view queue', REDIS_URL);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'baxis-artirma-super-secret-key-' + Date.now(),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Render sunucu bilgisi
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://saskioyunu-1-2d6i.onrender.com';

// İstatistikler (Redis'te tut)
let stats = {
    totalViews: 0,
    successfulViews: 0,
    failedViews: 0,
    activeJobs: 0,
    completedJobs: 0,
    proxyCount: 0,
    startTime: new Date().toISOString(),
    dailyViews: 0,
    hourlyRate: 0
};

// Proxy havuzu (otomatik güncellenen)
let proxyPool = {
    http: [],
    socks4: [],
    socks5: [],
    lastUpdate: null
};

// Kullanıcı ajanları havuzu (1000+ farklı user agent)
const userAgents = [
    // Windows Chrome
    ...Array(200).fill().map((_, i) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36`),
    // Windows Firefox
    ...Array(100).fill().map((_, i) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${121 - Math.floor(i/10)}.0) Gecko/20100101 Firefox/${121 - Math.floor(i/10)}.0`),
    // Mac Chrome
    ...Array(100).fill().map((_, i) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_${i}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36`),
    // Mac Safari
    ...Array(50).fill().map((_, i) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_${i}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${15 + Math.floor(i/10)}.${i} Safari/605.1.15`),
    // Linux
    ...Array(50).fill().map((_, i) => `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36`),
    // Mobile - iOS
    ...Array(100).fill().map((_, i) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${15 + Math.floor(i/30)}_${i} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${15 + Math.floor(i/30)}.0 Mobile/15E148 Safari/604.1`),
    // Mobile - Android
    ...Array(100).fill().map((_, i) => `Mozilla/5.0 (Linux; Android ${11 + Math.floor(i/40)}; SM-G${900 + i}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Mobile Safari/537.36`),
    // Edge
    ...Array(50).fill().map((_, i) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36 Edg/${120 - Math.floor(i/20)}.0.${i}.0`),
    // Opera
    ...Array(50).fill().map((_, i) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36 OPR/${100 - Math.floor(i/15)}.0.${i}`),
    // Bot ları taklit eden ama bot olmayan
    ...Array(100).fill().map((_, i) => `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 - Math.floor(i/20)}.0.${i}.0 Safari/537.36`)
];

// Ekran çözünürlükleri
const viewports = [
    { width: 1920, height: 1080 }, // Full HD
    { width: 1366, height: 768 },  // Laptop
    { width: 1536, height: 864 },  // Laptop
    { width: 1440, height: 900 },  // Mac
    { width: 1280, height: 720 },  // HD
    { width: 2560, height: 1440 }, // 2K
    { width: 3840, height: 2160 }, // 4K
    { width: 375, height: 667 },   // iPhone SE
    { width: 390, height: 844 },   // iPhone 12
    { width: 414, height: 896 },   // iPhone 11
    { width: 360, height: 780 },   // Samsung
    { width: 393, height: 852 },   // iPhone 15
    { width: 430, height: 932 },   // iPhone 15 Pro Max
    { width: 768, height: 1024 },  // iPad
    { width: 1024, height: 1366 }, // iPad Pro
    { width: 820, height: 1180 },  // iPad Air
    { width: 912, height: 1368 },  // iPad Pro
    { width: 280, height: 653 },   // Galaxy Fold
    { width: 717, height: 512 }    // Tablet
];

// Zaman dilimleri
const timezones = [
    'Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 
    'America/New_York', 'America/Los_Angeles', 'Asia/Dubai',
    'Asia/Baku', 'Asia/Tbilisi', 'Asia/Yerevan',
    'Europe/Moscow', 'Europe/Paris', 'Europe/Rome',
    'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'
];

// Diller
const languages = [
    ['tr-TR', 'tr', 'en-US', 'en'],
    ['en-US', 'en', 'tr-TR', 'tr'],
    ['az-AZ', 'az', 'ru-RU', 'ru', 'en-US'],
    ['ru-RU', 'ru', 'en-US', 'en'],
    ['de-DE', 'de', 'en-US', 'en'],
    ['fr-FR', 'fr', 'en-US', 'en'],
    ['it-IT', 'it', 'en-US', 'en'],
    ['es-ES', 'es', 'en-US', 'en']
];

// Proxy kaynakları
const proxySources = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://www.proxy-list.download/api/v1/get?type=http',
    'https://www.proxy-list.download/api/v1/get?type=https',
    'https://www.proxy-list.download/api/v1/get?type=socks4',
    'https://www.proxy-list.download/api/v1/get?type=socks5',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt'
];

// Proxy'leri güncelle
async function updateProxyPool() {
    console.log('🌐 Proxy havuzu güncelleniyor...');
    
    let http = [];
    let socks4 = [];
    let socks5 = [];
    
    for (const source of proxySources) {
        try {
            const response = await axios.get(source, { 
                timeout: 10000,
                headers: { 'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)] }
            });
            
            const proxies = response.data.split('\n')
                .map(line => line.trim())
                .filter(line => line && line.includes(':'));
            
            if (source.includes('socks4')) {
                socks4.push(...proxies.map(p => `socks4://${p}`));
            } else if (source.includes('socks5')) {
                socks5.push(...proxies.map(p => `socks5://${p}`));
            } else {
                http.push(...proxies.map(p => `http://${p}`));
            }
            
            console.log(`📦 ${source.split('/')[2] || 'kaynak'}: ${proxies.length} proxy`);
        } catch (error) {
            console.log(`⚠️ ${source.split('/')[2] || 'kaynak'} alınamadı:`, error.message);
        }
    }
    
    // Benzersiz proxy'leri al
    proxyPool = {
        http: [...new Set(http)],
        socks4: [...new Set(socks4)],
        socks5: [...new Set(socks5)],
        lastUpdate: new Date().toISOString()
    };
    
    stats.proxyCount = proxyPool.http.length + proxyPool.socks4.length + proxyPool.socks5.length;
    
    console.log(`✅ Proxy havuzu güncellendi:`);
    console.log(`   HTTP: ${proxyPool.http.length}`);
    console.log(`   SOCKS4: ${proxyPool.socks4.length}`);
    console.log(`   SOCKS5: ${proxyPool.socks5.length}`);
    console.log(`   TOPLAM: ${stats.proxyCount}`);
    
    return proxyPool;
}

// Rastgele proxy seç
function getRandomProxy() {
    const allProxies = [
        ...proxyPool.http,
        ...proxyPool.socks4,
        ...proxyPool.socks5
    ];
    
    if (allProxies.length === 0) return null;
    return allProxies[Math.floor(Math.random() * allProxies.length)];
}

// Browser oluştur (gelişmiş konfigürasyon)
async function createAdvancedBrowser(proxy = null) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--ignore-certificate-errors',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update'
    ];

    if (proxy) {
        args.push(`--proxy-server=${proxy}`);
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: args,
            ignoreHTTPSErrors: true,
            defaultViewport: null
        });

        return browser;
    } catch (error) {
        console.error('Browser oluşturma hatası:', error);
        throw error;
    }
}

// Gerçekçi insan davranışı simülasyonu
async function simulateAdvancedHumanBehavior(page) {
    try {
        // Rastgele bekleme (sayfa yüklenirken)
        await page.waitForTimeout(Math.random() * 3000 + 2000);

        // Mouse hareketleri
        const moves = Math.floor(Math.random() * 10) + 5;
        for (let i = 0; i < moves; i++) {
            await page.mouse.move(
                Math.random() * 1000,
                Math.random() * 1000
            );
            await page.waitForTimeout(Math.random() * 500 + 100);
        }

        // Scroll yap
        await page.evaluate(async () => {
            const scrollHeight = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            );
            
            if (scrollHeight > 1000) {
                // Yavaş scroll
                for (let i = 0; i < 5; i++) {
                    window.scrollTo({
                        top: (scrollHeight / 5) * i,
                        behavior: 'smooth'
                    });
                    await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
                }
                
                // Yukarı scroll
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });

        // Sayfada kalma süresi (30 saniye - 3 dakika)
        const stayTime = Math.floor(Math.random() * 150000) + 30000;
        await page.waitForTimeout(stayTime);

        // Sayfadan ayrılmadan önce son hareketler
        await page.mouse.click(
            Math.random() * 500,
            Math.random() * 500
        );

    } catch (error) {
        console.log('Davranış simülasyonu hatası:', error.message);
    }
}

// Toplu görüntüleme oluştur
async function createBulkViews(url, count, options = {}) {
    const {
        useProxy = true,
        minDelay = 30000,
        maxDelay = 120000,
        concurrency = 3,
        randomizeBehavior = true
    } = options;

    const results = [];
    const batchSize = Math.min(concurrency, 5); // Render limitleri için
    
    console.log(`🚀 Toplu görüntüleme başlıyor: ${count} görüntüleme`);
    console.log(`   Eşzamanlılık: ${batchSize}`);
    
    // İşleri batch'lere böl
    for (let i = 0; i < count; i += batchSize) {
        const batchCount = Math.min(batchSize, count - i);
        const batchPromises = [];
        
        console.log(`📦 Batch ${Math.floor(i/batchSize) + 1}: ${batchCount} görüntüleme`);
        
        for (let j = 0; j < batchCount; j++) {
            const viewNumber = i + j + 1;
            
            batchPromises.push((async () => {
                let browser = null;
                let proxy = useProxy ? getRandomProxy() : null;
                
                try {
                    // Browser oluştur
                    browser = await createAdvancedBrowser(proxy);
                    const page = await browser.newPage();
                    
                    // Rastgele user agent
                    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                    await page.setUserAgent(userAgent);
                    
                    // Rastgele viewport
                    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
                    await page.setViewport(viewport);
                    
                    // Dil ve zaman dilimi
                    await page.setExtraHTTPHeaders({
                        'Accept-Language': languages[Math.floor(Math.random() * languages.length)].join(',')
                    });
                    
                    // Bot algılamayı engelle
                    await page.evaluateOnNewDocument(() => {
                        // WebGL
                        const getParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function(parameter) {
                            const vendors = ['Intel Inc.', 'NVIDIA Corporation', 'AMD', 'Apple', 'Qualcomm'];
                            const renderers = [
                                'Intel Iris OpenGL Engine',
                                'GeForce RTX 3060/PCIe/SSE2',
                                'Radeon RX 6800 XT OpenGL Engine',
                                'Apple M2 Max',
                                'Adreno 730'
                            ];
                            
                            if (parameter === 37445) {
                                return vendors[Math.floor(Math.random() * vendors.length)];
                            }
                            if (parameter === 37446) {
                                return renderers[Math.floor(Math.random() * renderers.length)];
                            }
                            return getParameter(parameter);
                        };
                        
                        // Navigator
                        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                        Object.defineProperty(navigator, 'plugins', { 
                            get: () => {
                                const plugins = [];
                                for (let i = 0; i < Math.floor(Math.random() * 5) + 3; i++) {
                                    plugins.push({
                                        name: `Plugin ${i}`,
                                        filename: `plugin${i}.dll`,
                                        description: `Description ${i}`
                                    });
                                }
                                return plugins;
                            }
                        });
                        
                        // Platform
                        const platforms = ['Win32', 'MacIntel', 'Linux x86_64', 'iPhone', 'iPad'];
                        Object.defineProperty(navigator, 'platform', { 
                            get: () => platforms[Math.floor(Math.random() * platforms.length)]
                        });
                    });
                    
                    // Sayfaya git
                    await page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    
                    // İnsan davranışı
                    if (randomizeBehavior) {
                        await simulateAdvancedHumanBehavior(page);
                    } else {
                        await page.waitForTimeout(10000);
                    }
                    
                    // Başarılı
                    results.push({
                        success: true,
                        viewNumber,
                        url,
                        proxy,
                        userAgent,
                        viewport,
                        timestamp: new Date().toISOString()
                    });
                    
                    stats.successfulViews++;
                    
                    await browser.close();
                    
                } catch (error) {
                    console.log(`❌ Görüntüleme ${viewNumber} başarısız:`, error.message);
                    
                    if (browser) {
                        await browser.close().catch(() => {});
                    }
                    
                    results.push({
                        success: false,
                        viewNumber,
                        url,
                        proxy,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                    
                    stats.failedViews++;
                }
                
                stats.totalViews++;
                
                // İstatistikleri güncelle
                stats.hourlyRate = Math.floor(stats.totalViews / ((new Date() - new Date(stats.startTime)) / 3600000));
                
                return results[results.length - 1];
            })());
        }
        
        // Batch'i bekle
        await Promise.all(batchPromises);
        
        // Batch'ler arası bekle (Rate limiting)
        if (i + batchSize < count) {
            const batchDelay = Math.floor(Math.random() * 60000) + 60000; // 1-2 dakika
            console.log(`⏳ Batch arası bekleniyor: ${Math.floor(batchDelay/1000)} saniye`);
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }
    
    return results;
}

// Queue işçisi
viewQueue.process(async (job) => {
    const { url, count, options, jobId } = job.data;
    
    console.log(`🔄 Kuyruk işi başladı: ${jobId} - ${count} görüntüleme`);
    
    stats.activeJobs++;
    
    try {
        const results = await createBulkViews(url, count, options);
        
        stats.activeJobs--;
        stats.completedJobs++;
        
        // Sonuçları Redis'e kaydet
        await redis.setex(`job:${jobId}`, 86400, JSON.stringify({
            jobId,
            url,
            count,
            results,
            completedAt: new Date().toISOString()
        }));
        
        return results;
    } catch (error) {
        stats.activeJobs--;
        throw error;
    }
});

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sunucu bilgisi
app.get('/api/info', (req, res) => {
    res.json({
        server: '🚗 Baxış Artırma Sistemi v2.0',
        renderUrl: RENDER_URL,
        status: 'active',
        stats,
        proxyPool: {
            http: proxyPool.http.length,
            socks4: proxyPool.socks4.length,
            socks5: proxyPool.socks5.length,
            total: stats.proxyCount,
            lastUpdate: proxyPool.lastUpdate
        },
        userAgents: userAgents.length,
        viewports: viewports.length,
        uptime: Math.floor((new Date() - new Date(stats.startTime)) / 1000) + ' saniye',
        nodeVersion: process.version,
        platform: process.platform,
        cpus: os.cpus().length
    });
});

// Proxy'leri güncelle
app.post('/api/proxies/update', async (req, res) => {
    try {
        await updateProxyPool();
        res.json({ 
            success: true, 
            message: 'Proxy havuzu güncellendi',
            counts: {
                http: proxyPool.http.length,
                socks4: proxyPool.socks4.length,
                socks5: proxyPool.socks5.length,
                total: stats.proxyCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toplu görüntüleme başlat (KUYRUK SİSTEMİ)
app.post('/api/start-bulk', async (req, res) => {
    const { 
        url, 
        count, 
        useProxy = true,
        concurrency = 3,
        priority = 'normal'
    } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
    }

    if (!url.includes('turbo.az')) {
        return res.status(400).json({ error: 'Sadece turbo.az URL\'leri desteklenir' });
    }

    // Render free tier için limit (ama yine de binlerce yapabiliriz - zaman alır)
    if (count > 5000) {
        return res.status(400).json({ error: 'Maksimum 5000 görüntüleme (daha fazlası için birden çok iş başlatın)' });
    }

    const jobId = uuidv4();
    
    // Job'ı kuyruğa ekle
    const job = await viewQueue.add({
        url,
        count,
        jobId,
        options: {
            useProxy,
            concurrency,
            minDelay: 30000,
            maxDelay: 120000
        }
    }, {
        priority: priority === 'high' ? 1 : priority === 'normal' ? 2 : 3,
        attempts: 3,
        backoff: 60000
    });

    // Tahmini süre hesapla
    const estimatedSeconds = count * 45; // Her görüntüleme ~45 saniye
    const estimatedHours = Math.floor(estimatedSeconds / 3600);
    const estimatedMinutes = Math.floor((estimatedSeconds % 3600) / 60);
    
    res.json({ 
        success: true,
        message: 'Toplu görüntüleme kuyruğa eklendi',
        jobId: jobId,
        queueId: job.id,
        url: url,
        count: count,
        estimatedTime: estimatedHours > 0 
            ? `${estimatedHours} saat ${estimatedMinutes} dakika`
            : `${estimatedMinutes} dakika`,
        useProxy,
        concurrency,
        proxyCount: stats.proxyCount
    });

    stats.dailyViews += count;
});

// İş durumu sorgula
app.get('/api/job/:jobId', async (req, res) => {
    const { jobId } = req.params;
    
    try {
        const jobData = await redis.get(`job:${jobId}`);
        
        if (jobData) {
            res.json(JSON.parse(jobData));
        } else {
            // Kuyrukta mı kontrol et
            const jobs = await viewQueue.getJobs(['waiting', 'active', 'delayed']);
            const job = jobs.find(j => j.data.jobId === jobId);
            
            if (job) {
                res.json({
                    jobId,
                    status: 'processing',
                    progress: job.progress(),
                    data: job.data
                });
            } else {
                res.status(404).json({ error: 'İş bulunamadı' });
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Hızlı görüntüleme (test için)
app.post('/api/quick-view', async (req, res) => {
    const { url, count = 10 } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
    }

    try {
        const results = await createBulkViews(url, Math.min(count, 50), {
            useProxy: true,
            concurrency: 2,
            minDelay: 15000,
            maxDelay: 30000
        });
        
        res.json({
            success: true,
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results.slice(0, 10) // İlk 10 sonuç
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// İstatistikler
app.get('/api/stats', (req, res) => {
    res.json({
        ...stats,
        proxyPool: {
            http: proxyPool.http.length,
            socks4: proxyPool.socks4.length,
            socks5: proxyPool.socks5.length,
            total: stats.proxyCount
        },
        queueStats: {
            waiting: viewQueue.getWaitingCount(),
            active: viewQueue.getActiveCount(),
            completed: viewQueue.getCompletedCount(),
            failed: viewQueue.getFailedCount()
        }
    });
});

// Proxy listesi
app.get('/api/proxies', (req, res) => {
    res.json({
        count: stats.proxyCount,
        http: proxyPool.http.slice(0, 20),
        socks4: proxyPool.socks4.slice(0, 10),
        socks5: proxyPool.socks5.slice(0, 10),
        lastUpdate: proxyPool.lastUpdate
    });
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: RENDER_URL,
        stats: {
            total: stats.totalViews,
            success: stats.successfulViews,
            failed: stats.failedViews,
            activeJobs: stats.activeJobs,
            completedJobs: stats.completedJobs,
            proxies: stats.proxyCount,
            hourlyRate: stats.hourlyRate
        },
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

// Başlangıç
async function start() {
    console.log('🚀 Baxış Artırma Sistemi v2.0 başlatılıyor...');
    console.log('📡 Render URL:', RENDER_URL);
    console.log('🖥️ Node versiyon:', process.version);
    console.log('💻 Platform:', process.platform);
    console.log('⚙️ CPU çekirdek:', os.cpus().length);

    // İlk proxy havuzunu yükle
    await updateProxyPool();
    
    // Her 15 dakikada bir proxy'leri güncelle
    setInterval(async () => {
        console.log('🔄 Periyodik proxy güncelleme başlıyor...');
        await updateProxyPool();
    }, 15 * 60 * 1000);

    // Her saat başı istatistikleri raporla
    setInterval(() => {
        const hourlyRate = Math.floor(stats.totalViews / ((new Date() - new Date(stats.startTime)) / 3600000));
        console.log(`📊 İstatistikler:`);
        console.log(`   Toplam görüntüleme: ${stats.totalViews}`);
        console.log(`   Başarılı: ${stats.successfulViews}`);
        console.log(`   Başarısız: ${stats.failedViews}`);
        console.log(`   Aktif iş: ${stats.activeJobs}`);
        console.log(`   Proxy sayısı: ${stats.proxyCount}`);
        console.log(`   Saatlik hız: ${hourlyRate}/saat`);
    }, 3600000);

    app.listen(PORT, () => {
        console.log(`✅ Sunucu çalışıyor: http://localhost:${PORT}`);
        console.log(`✅ Render üzerinden erişim: ${RENDER_URL}`);
        console.log(`✅ Health check: ${RENDER_URL}/health`);
        console.log(`✅ Toplu görüntüleme: ${RENDER_URL}/api/start-bulk`);
    });
}

start();
