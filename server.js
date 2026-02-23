const express = require('express');
const session = require('express-session');
const path = require('path');
const moment = require('moment');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Puppeteer stealth mod ile
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const randomUseragent = require('random-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'baxis-artirma-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Proxy listesi
let proxies = [];
let currentProxyIndex = 0;

// Kullanıcı ajanları listesi
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Ekran çözünürlükleri
const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 }
];

// Proxy listesini yükle
async function loadProxies() {
    try {
        const data = await fs.readFile('proxy-list.txt', 'utf8');
        proxies = data.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        console.log(`${proxies.length} proxy yüklendi`);
    } catch (error) {
        console.log('Proxy listesi bulunamadı, proxysiz çalışılacak');
        proxies = [];
    }
}

// Rastgele proxy seç
function getRandomProxy() {
    if (proxies.length === 0) return null;
    return proxies[Math.floor(Math.random() * proxies.length)];
}

// Proxy ile browser oluştur
async function createBrowserWithProxy(proxyString = null) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ];

    if (proxyString) {
        args.push(`--proxy-server=${proxyString}`);
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: args,
        ignoreHTTPSErrors: true
    });

    return browser;
}

// Gerçekçi görüntüleme simülasyonu
async function simulateHumanView(page, url) {
    // Rastgele scroll
    await page.evaluate(() => {
        const scrollHeight = document.body.scrollHeight;
        const scrolls = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < scrolls; i++) {
            setTimeout(() => {
                window.scrollTo({
                    top: Math.random() * scrollHeight,
                    behavior: 'smooth'
                });
            }, i * 2000);
        }
    });

    // Rastgele bekleme (insan gibi)
    await page.waitForTimeout(Math.random() * 5000 + 3000);

    // Mouse hareketleri simülasyonu
    await page.mouse.move(
        Math.random() * 500,
        Math.random() * 500
    );
}

// Ana görüntüleme fonksiyonu
async function createView(url, count, useProxy = true, delayBetweenViews = 30) {
    const results = [];
    
    for (let i = 0; i < count; i++) {
        let browser = null;
        let proxyUsed = null;
        
        try {
            // Proxy seç
            if (useProxy && proxies.length > 0) {
                proxyUsed = getRandomProxy();
                console.log(`Görüntüleme ${i+1}/${count} - Proxy: ${proxyUsed || 'yok'}`);
            }

            // Browser oluştur
            browser = await createBrowserWithProxy(proxyUsed);
            const page = await browser.newPage();

            // Rastgele kullanıcı ajanı
            const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            await page.setUserAgent(userAgent);

            // Rastgele viewport
            const viewport = viewports[Math.floor(Math.random() * viewports.length)];
            await page.setViewport(viewport);

            // WebGL fingerprint gizleme
            await page.evaluateOnNewDocument(() => {
                // WebGL vendor renderer'ı gizle
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    if (parameter === 37446) {
                        return 'Intel Iris OpenGL Engine';
                    }
                    return getParameter(parameter);
                };
            });

            // Sayfaya git
            console.log(`Sayfa yükleniyor: ${url}`);
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // İnsan davranışı simülasyonu
            await simulateHumanView(page, url);

            // Sayfada kalma süresi
            const stayTime = Math.floor(Math.random() * 20000) + 10000; // 10-30 saniye
            console.log(`Sayfada kalınıyor: ${stayTime/1000} saniye`);
            await page.waitForTimeout(stayTime);

            // Başarılı görüntüleme
            results.push({
                success: true,
                url: url,
                proxy: proxyUsed,
                userAgent: userAgent,
                viewport: viewport,
                timestamp: new Date().toISOString()
            });

            await browser.close();

            // Görüntülemeler arası bekle
            if (i < count - 1) {
                const waitTime = delayBetweenViews * 1000;
                console.log(`${delayBetweenViews} saniye bekleniyor...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

        } catch (error) {
            console.error(`Görüntüleme hatası (${i+1}):`, error.message);
            
            if (browser) {
                await browser.close();
            }

            results.push({
                success: false,
                url: url,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            // Hata durumunda bekle
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    return results;
}

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Görüntüleme başlat
app.post('/api/start', async (req, res) => {
    const { url, count, useProxy, delayBetweenViews } = req.body;

    if (!url || !url.includes('turbo.az')) {
        return res.status(400).json({ error: 'Geçerli bir turbo.az URL\'si girin' });
    }

    if (count > 100) {
        return res.status(400).json({ error: 'Maksimum 100 görüntüleme' });
    }

    // Session'da işlem ID'si oluştur
    const jobId = uuidv4();
    req.session.jobId = jobId;

    // İşlemi arka planda başlat
    res.json({ 
        message: 'Görüntüleme başlatıldı', 
        jobId: jobId,
        estimatedTime: count * (delayBetweenViews + 0.5) + ' saniye'
    });

    // Görüntülemeleri başlat (arka planda)
    createView(url, count, useProxy, delayBetweenViews)
        .then(results => {
            console.log('İşlem tamamlandı:', results);
            // Sonuçları kaydet
        })
        .catch(error => {
            console.error('Toplu hata:', error);
        });
});

// İşlem durumu sorgula
app.get('/api/status', (req, res) => {
    // Basit durum kontrolü
    res.json({ status: 'active', message: 'Sistem çalışıyor' });
});

// Proxy listesini güncelle
app.post('/api/proxies', async (req, res) => {
    const { proxies: newProxies } = req.body;
    
    try {
        await fs.writeFile('proxy-list.txt', newProxies.join('\n'));
        await loadProxies();
        res.json({ message: 'Proxy listesi güncellendi', count: proxies.length });
    } catch (error) {
        res.status(500).json({ error: 'Proxy listesi güncellenemedi' });
    }
});

// Başlangıç
async function start() {
    await loadProxies();
    
    app.listen(PORT, () => {
        console.log(`Baxış Artırma sistemi çalışıyor: http://localhost:${PORT}`);
        console.log(`Yüklü proxy sayısı: ${proxies.length}`);
    });
}

start();
