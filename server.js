const express = require('express');
const session = require('express-session');
const path = require('path');
const moment = require('moment');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// Puppeteer stealth mod ile
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const randomUseragent = require('random-useragent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'baxis-artirma-secret-key-' + Date.now(),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Render sunucu bilgisi
const RENDER_URL = 'https://saskioyunu-1-2d6i.onrender.com';

// Proxy listesi (public API'lerden alınacak)
let proxies = [];
let proxySources = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt'
];

// Kullanıcı ajanları listesi
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
];

// Ekran çözünürlükleri
const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 375, height: 667 },  // iPhone
    { width: 414, height: 896 }    // iPhone Plus
];

// İstatistikler
let stats = {
    totalViews: 0,
    successfulViews: 0,
    failedViews: 0,
    activeProxies: 0,
    startTime: new Date().toISOString()
};

// Proxy'leri güncelle
async function updateProxies() {
    console.log('Proxy listesi güncelleniyor...');
    let newProxies = [];
    
    for (const source of proxySources) {
        try {
            const response = await axios.get(source, { timeout: 5000 });
            const lines = response.data.split('\n');
            
            for (const line of lines) {
                const proxy = line.trim();
                if (proxy && proxy.includes(':')) {
                    // HTTP proxy olarak ekle
                    if (!proxy.startsWith('socks')) {
                        newProxies.push(`http://${proxy}`);
                    }
                }
            }
            console.log(`${source} kaynağından ${lines.length} proxy alındı`);
        } catch (error) {
            console.log(`${source} kaynağından proxy alınamadı:`, error.message);
        }
    }
    
    // Benzersiz proxy'leri al
    proxies = [...new Set(newProxies)];
    stats.activeProxies = proxies.length;
    
    console.log(`Toplam ${proxies.length} proxy yüklendi`);
    return proxies;
}

// Rastgele proxy seç
function getRandomProxy() {
    if (proxies.length === 0) return null;
    return proxies[Math.floor(Math.random() * proxies.length)];
}

// Render'da Puppeteer için özel ayarlar
async function createBrowser() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
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
            '--ignore-certificate-errors'
        ],
        ignoreHTTPSErrors: true
    });

    return browser;
}

// Gerçekçi görüntüleme simülasyonu
async function simulateHumanView(page, url) {
    try {
        // Sayfa yüklenene kadar bekle
        await page.waitForSelector('body', { timeout: 10000 });
        
        // Rastgele scroll
        await page.evaluate(() => {
            return new Promise((resolve) => {
                const scrollHeight = document.body.scrollHeight;
                const scrolls = Math.floor(Math.random() * 4) + 2;
                let scrollCount = 0;
                
                function doScroll() {
                    if (scrollCount < scrolls) {
                        window.scrollTo({
                            top: Math.random() * scrollHeight,
                            behavior: 'smooth'
                        });
                        scrollCount++;
                        setTimeout(doScroll, Math.random() * 3000 + 2000);
                    } else {
                        resolve();
                    }
                }
                
                doScroll();
            });
        });

        // Mouse hareketleri
        await page.mouse.move(
            Math.random() * 500,
            Math.random() * 500
        );
        
        await page.mouse.move(
            Math.random() * 500 + 500,
            Math.random() * 500
        );

        // Sayfada kalma süresi (10-40 saniye)
        const stayTime = Math.floor(Math.random() * 30000) + 10000;
        await page.waitForTimeout(stayTime);

    } catch (error) {
        console.log('Simülasyon hatası:', error.message);
    }
}

// Tekil görüntüleme oluştur
async function createSingleView(url, useProxy = true) {
    let browser = null;
    let result = {
        success: false,
        url: url,
        proxy: null,
        userAgent: null,
        viewport: null,
        timestamp: new Date().toISOString(),
        error: null
    };

    try {
        // Browser oluştur
        browser = await createBrowser();
        const page = await browser.newPage();

        // Rastgele kullanıcı ajanı
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(userAgent);
        result.userAgent = userAgent;

        // Rastgele viewport
        const viewport = viewports[Math.floor(Math.random() * viewports.length)];
        await page.setViewport(viewport);
        result.viewport = viewport;

        // WebGL fingerprint gizleme
        await page.evaluateOnNewDocument(() => {
            // WebGL vendor renderer
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                const vendors = ['Intel Inc.', 'NVIDIA Corporation', 'AMD', 'Apple'];
                const renderers = [
                    'Intel Iris OpenGL Engine',
                    'GeForce GTX 1060/PCIe/SSE2',
                    'Radeon Pro 555X OpenGL Engine',
                    'Apple M1'
                ];
                
                if (parameter === 37445) {
                    return vendors[Math.floor(Math.random() * vendors.length)];
                }
                if (parameter === 37446) {
                    return renderers[Math.floor(Math.random() * renderers.length)];
                }
                return getParameter(parameter);
            };

            // Navigator özellikleri
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
        });

        // Sayfaya git
        console.log(`Sayfa yükleniyor: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Sayfa başlığını kontrol et
        const title = await page.title();
        console.log(`Sayfa başlığı: ${title}`);

        // İnsan davranışı simülasyonu
        await simulateHumanView(page, url);

        // Başarılı görüntüleme
        result.success = true;
        
        // İstatistikleri güncelle
        stats.totalViews++;
        stats.successfulViews++;

        await browser.close();

    } catch (error) {
        console.error('Görüntüleme hatası:', error.message);
        
        if (browser) {
            await browser.close();
        }

        result.error = error.message;
        stats.totalViews++;
        stats.failedViews++;
    }

    return result;
}

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sunucu bilgisi
app.get('/api/info', (req, res) => {
    res.json({
        server: 'Baxış Artırma Sistemi',
        renderUrl: RENDER_URL,
        status: 'active',
        proxies: stats.activeProxies,
        stats: stats,
        uptime: Math.floor((new Date() - new Date(stats.startTime)) / 1000) + ' saniye'
    });
});

// Proxy'leri güncelle (manuel)
app.post('/api/proxies/update', async (req, res) => {
    try {
        await updateProxies();
        res.json({ 
            success: true, 
            message: 'Proxy listesi güncellendi', 
            count: proxies.length 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Görüntüleme başlat
app.post('/api/start', async (req, res) => {
    const { url, count = 1, useProxy = true } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
    }

    if (!url.includes('turbo.az')) {
        return res.status(400).json({ error: 'Sadece turbo.az URL\'leri desteklenir' });
    }

    if (count > 50) {
        return res.status(400).json({ error: 'Maksimum 50 görüntüleme' });
    }

    const jobId = uuidv4();
    
    // Hemen cevap ver
    res.json({ 
        success: true,
        message: 'Görüntüleme başlatıldı', 
        jobId: jobId,
        url: url,
        count: count,
        estimatedTime: count * 45 + ' saniye'
    });

    // Arka planda görüntülemeleri başlat
    (async () => {
        console.log(`İş başlatıldı: ${jobId} - ${count} görüntüleme`);
        
        for (let i = 0; i < count; i++) {
            try {
                const result = await createSingleView(url, useProxy);
                console.log(`Görüntüleme ${i+1}/${count}:`, result.success ? 'BAŞARILI' : 'BAŞARISIZ');
                
                // Görüntülemeler arası bekle (30-60 saniye)
                if (i < count - 1) {
                    const waitTime = Math.floor(Math.random() * 30000) + 30000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            } catch (error) {
                console.error(`Görüntüleme ${i+1} hatası:`, error.message);
            }
        }
        
        console.log(`İş tamamlandı: ${jobId}`);
    })();
});

// Tekil görüntüleme (hızlı test için)
app.post('/api/view/single', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL gerekli' });
    }

    try {
        const result = await createSingleView(url, true);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// İstatistikler
app.get('/api/stats', (req, res) => {
    res.json(stats);
});

// Proxy listesi
app.get('/api/proxies', (req, res) => {
    res.json({
        count: proxies.length,
        proxies: proxies.slice(0, 20) // İlk 20 proxy
    });
});

// Sağlık kontrolü
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: RENDER_URL
    });
});

// Başlangıç
async function start() {
    console.log('Baxış Artırma sistemi başlatılıyor...');
    console.log('Render URL:', RENDER_URL);
    
    // İlk proxy listesini yükle
    await updateProxies();
    
    // Her 30 dakikada bir proxy'leri güncelle
    setInterval(async () => {
        console.log('Proxy listesi periyodik güncelleme başlıyor...');
        await updateProxies();
    }, 30 * 60 * 1000);

    app.listen(PORT, () => {
        console.log(`✅ Sunucu çalışıyor: http://localhost:${PORT}`);
        console.log(`✅ Render üzerinden erişim: ${RENDER_URL}`);
        console.log(`✅ Yüklü proxy sayısı: ${proxies.length}`);
    });
}

start();
