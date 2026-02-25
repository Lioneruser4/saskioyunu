// game.js
// Backrooms Multiplayer Oyunu - İstemci Tarafı Ana Oyun Mantığı

// ==================== GLOBAL DEĞİŞKENLER ====================
let socket = null;
let scene, camera, renderer;
let playerId = null;
let players = {};
let rooms = {};
let currentRoom = null;
let keys = {};
let chasers = {};
let gameActive = false;
let hasKey = false;
let isGameStarted = false;

// Fizik değişkenleri
let velocity = new THREE.Vector3();
let gravity = 0.02;
let playerHeight = 2;
let moveSpeed = 0.15;
let isGrounded = true;
let jumpPower = 0.3;

// Animasyon değişkenleri
let mixer = null;
let clock = new THREE.Clock();
let animations = {};
let playerModel = null;

// Hareket durumu
const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false
};

// Işınlanma koruması için son pozisyon
let lastValidPosition = new THREE.Vector3(0, 2, 0);
let positionHistory = [];

// Kolay ID oluşturucu
function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// ==================== TELEGRAM INTEGRATION ====================
const telegram = window.Telegram?.WebApp;
let telegramId = null;
let playerName = "Oyuncu";

if (telegram) {
    telegram.ready();
    telegram.expand();
    telegramId = telegram.initDataUnsafe?.user?.id?.toString() || 'guest_' + generateId();
    playerName = telegram.initDataUnsafe?.user?.first_name || 'Telegram Kullanıcısı';
    
    // Telegram tema renklerini al
    document.documentElement.style.setProperty('--tg-theme-bg-color', telegram.themeParams.bg_color || '#1a1a2e');
    document.documentElement.style.setProperty('--tg-theme-text-color', telegram.themeParams.text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-button-color', telegram.themeParams.button_color || '#ffd700');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', telegram.themeParams.button_text_color || '#000000');
} else {
    telegramId = 'guest_' + generateId();
    playerName = 'Misafir_' + Math.floor(Math.random() * 1000);
}

console.log('Telegram ID:', telegramId, 'İsim:', playerName);

// ==================== OYUN BAŞLATMA ====================
function initGame() {
    console.log('Oyun başlatılıyor...');
    
    // Three.js kurulumu
    initThree();
    
    // Event listener'ları kur
    setupEventListeners();
    
    // Sunucuya bağlan
    connectToServer();
    
    // Loading ekranını gizle
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
    }, 1500);
}

// ==================== THREE.JS KURULUMU ====================
function initThree() {
    console.log('Three.js başlatılıyor...');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111122);
    scene.fog = new THREE.Fog(0x111122, 20, 50);
    
    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, playerHeight, 5);
    
    // Renderer
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Işıklandırma
    setupLights();
    
    // Test odası oluştur (sunucu bağlanana kadar)
    createTestEnvironment();
    
    // Animasyon döngüsünü başlat
    animate();
}

function setupLights() {
    // Ambient ışık
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    
    // Ana ışık (gölgeli)
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(5, 20, 10);
    dirLight.castShadow = true;
    dirLight.receiveShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    const d = 30;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);
    
    // İkinci ışık (arka plan)
    const backLight = new THREE.PointLight(0x4466ff, 0.5);
    backLight.position.set(-5, 5, -10);
    scene.add(backLight);
    
    // Flaş efekti için ışık
    const flickerLight = new THREE.PointLight(0xffaa00, 0.3);
    flickerLight.position.set(0, 3, 0);
    scene.add(flickerLight);
}

// ==================== TEST ORTAMI ====================
function createTestEnvironment() {
    console.log('Test ortamı oluşturuluyor...');
    
    // Zemin
    const floorGeometry = new THREE.CircleGeometry(30, 32);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2a2a3a,
        roughness: 0.7,
        metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Zemin deseni (backrooms hissi için)
    const gridHelper = new THREE.GridHelper(60, 20, 0xffd700, 0x3366ff);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
    
    // Duvarlar
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a4a6a,
        roughness: 0.6,
        emissive: new THREE.Color(0x111122)
    });
    
    const wallHeight = 5;
    const wallThickness = 0.5;
    const roomSize = 25;
    
    // Arka duvar
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(roomSize, wallHeight, wallThickness), wallMaterial);
    backWall.position.set(0, wallHeight/2, -roomSize/2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    scene.add(backWall);
    
    // Ön duvar (kapı boşluğu ile)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(10, wallHeight, wallThickness), wallMaterial);
    frontWallLeft.position.set(-7.5, wallHeight/2, roomSize/2);
    frontWallLeft.castShadow = true;
    frontWallLeft.receiveShadow = true;
    scene.add(frontWallLeft);
    
    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(10, wallHeight, wallThickness), wallMaterial);
    frontWallRight.position.set(7.5, wallHeight/2, roomSize/2);
    frontWallRight.castShadow = true;
    frontWallRight.receiveShadow = true;
    scene.add(frontWallRight);
    
    // Sol duvar
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomSize), wallMaterial);
    leftWall.position.set(-roomSize/2, wallHeight/2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    scene.add(leftWall);
    
    // Sağ duvar
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, roomSize), wallMaterial);
    rightWall.position.set(roomSize/2, wallHeight/2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    scene.add(rightWall);
    
    // Tavan (backrooms hissi için floresan lambalar)
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x333344 });
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(roomSize, 0.3, roomSize), ceilingMaterial);
    ceiling.position.set(0, wallHeight, 0);
    ceiling.castShadow = true;
    ceiling.receiveShadow = true;
    scene.add(ceiling);
    
    // Floresan lambalar
    for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
            const lamp = new THREE.Mesh(
                new THREE.BoxGeometry(1, 0.1, 1),
                new THREE.MeshStandardMaterial({ color: 0xffdd99, emissive: 0x442200 })
            );
            lamp.position.set(i * 5, wallHeight - 0.2, j * 5);
            lamp.castShadow = true;
            scene.add(lamp);
        }
    }
    
    // Sütunlar
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5a7a });
    for (let i = -2; i <= 2; i+=2) {
        for (let j = -2; j <= 2; j+=2) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, wallHeight-0.5, 0.8), pillarMaterial);
            pillar.position.set(i * 4, wallHeight/2, j * 4);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            scene.add(pillar);
        }
    }
    
    // Anahtar (geçici)
    createKey(new THREE.Vector3(5, 1, 5), 'test_key');
}

function createKey(position, id) {
    const keyGroup = new THREE.Group();
    
    // Anahtar başı (daire)
    const headGeo = new THREE.TorusGeometry(0.2, 0.05, 16, 32);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x442200 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI / 2;
    head.rotation.z = Math.PI / 4;
    keyGroup.add(head);
    
    // Anahtar gövdesi
    const bodyGeo = new THREE.BoxGeometry(0.1, 0.5, 0.05);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0.2, -0.2, 0);
    keyGroup.add(body);
    
    // Anahtar dişleri
    for (let i = 0; i < 3; i++) {
        const toothGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const toothMat = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
        const tooth = new THREE.Mesh(toothGeo, toothMat);
        tooth.position.set(0.3, -0.4 - (i * 0.1), 0);
        keyGroup.add(tooth);
    }
    
    // Işık efekti
    const light = new THREE.PointLight(0xffaa00, 0.5, 3);
    light.position.set(0, 0, 0);
    keyGroup.add(light);
    
    keyGroup.position.copy(position);
    keyGroup.userData = { id: id, type: 'key' };
    
    scene.add(keyGroup);
    keys[id] = keyGroup;
    
    // Döndürme animasyonu için
    keyGroup.userData.rotateSpeed = 0.02;
}

// ==================== SUNUCU BAĞLANTISI ====================
function connectToServer() {
    const serverUrl = 'https://saskioyunu-1-2d6i.onrender.com';
    
    console.log('Sunucuya bağlanılıyor:', serverUrl);
    
    socket = io(serverUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
        console.log('✅ Sunucuya bağlandı!', socket.id);
        playerId = socket.id;
        
        // Sunucuya oyuncu bilgilerini gönder
        socket.emit('player-join', {
            id: playerId,
            telegramId: telegramId,
            name: playerName
        });
        
        // Bağlantı durumunu göster
        showNotification('Sunucuya bağlandı', 'success');
    });
    
    socket.on('disconnect', (reason) => {
        console.log('❌ Sunucu bağlantısı koptu:', reason);
        showNotification('Sunucu bağlantısı koptu, yeniden bağlanılıyor...', 'error');
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Sunucuya yeniden bağlandı! Deneme:', attemptNumber);
        showNotification('Sunucuya yeniden bağlandı', 'success');
        
        if (currentRoom) {
            socket.emit('rejoin-room', { 
                roomId: currentRoom, 
                playerId: playerId,
                lastPosition: camera.position
            });
        }
    });
    
    socket.on('reconnect_attempt', (attempt) => {
        console.log('Yeniden bağlanma denemesi:', attempt);
    });
    
    socket.on('error', (error) => {
        console.error('Sunucu hatası:', error);
        showNotification('Sunucu hatası: ' + error, 'error');
    });
    
    // Oyun durumu güncellemeleri
    socket.on('game-state', (state) => {
        console.log('Oyun durumu alındı');
        players = state.players || {};
        rooms = state.rooms || {};
        updatePlayerCount();
    });
    
    // Oda oluşturuldu
    socket.on('room-created', (roomData) => {
        console.log('Oda oluşturuldu:', roomData);
        currentRoom = roomData.id;
        document.getElementById('chaser-selector').classList.add('active');
    });
    
    // Odaya katılma
    socket.on('room-joined', (roomData) => {
        console.log('Odaya katılındı:', roomData);
        currentRoom = roomData.id;
        gameActive = true;
        isGameStarted = true;
        
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('hud').style.display = 'flex';
        
        // Mobil kontroller
        if (window.innerWidth <= 768) {
            document.getElementById('mobile-controls').classList.add('active');
        }
        
        // Odayı yükle
        loadRoom(roomData);
        
        showNotification('Odaya katıldınız!', 'success');
    });
    
    // Oyuncu hareketi
    socket.on('player-moved', (data) => {
        if (players[data.id]) {
            players[data.id].position = data.position;
            players[data.id].rotation = data.rotation;
        }
    });
    
    // Anahtar toplandı
    socket.on('key-collected', (data) => {
        console.log('Anahtar toplandı:', data);
        
        if (data.playerId === playerId) {
            hasKey = true;
            document.getElementById('key-status').innerHTML = '🔑 <span style="color: #00ff00;">Anahtar alındı!</span>';
            document.getElementById('key-status').classList.add('has-key');
        }
        
        if (keys[data.keyId]) {
            scene.remove(keys[data.keyId]);
            delete keys[data.keyId];
        }
    });
    
    // Kovalayıcı seçildi
    socket.on('chaser-selected', (data) => {
        console.log('Kovalayıcı seçildi:', data);
        chasers[data.roomId] = data.chaserId;
        
        if (data.chaserId === playerId) {
            showNotification('Siz kovalayıcısınız!', 'warning');
        }
    });
    
    // Oyun başladı
    socket.on('game-start', (data) => {
        console.log('Oyun başladı!', data);
        isGameStarted = true;
        
        // Anahtarı yerleştir
        if (data.keyPosition) {
            createKey(
                new THREE.Vector3(data.keyPosition.x, data.keyPosition.y, data.keyPosition.z),
                'game_key'
            );
        }
        
        showNotification('Oyun başladı! Anahtarı bul ve kaç!', 'info');
    });
    
    // Oyuncu yakalandı
    socket.on('player-caught', (data) => {
        console.log('Oyuncu yakalandı:', data);
        
        if (data.playerId === playerId) {
            showNotification('YAKALANDIN! Oyun bitti.', 'error');
            setTimeout(() => resetGame(), 2000);
        }
    });
    
    // Oyun kazanıldı
    socket.on('game-won', (data) => {
        console.log('Oyun kazanıldı:', data);
        
        if (data.playerId === playerId) {
            showNotification('🎉 TEBRİKLER! KAÇIŞ BAŞARILI! 🎉', 'success');
            
            // Partikül efekti
            createWinEffect();
            
            setTimeout(() => resetGame(), 3000);
        }
    });
    
    // Yeni oyuncu katıldı
    socket.on('player-joined', (player) => {
        console.log('Oyuncu katıldı:', player);
        players[player.id] = player;
        updatePlayerCount();
        showNotification(`${player.name} odaya katıldı`, 'info');
    });
    
    // Oyuncu ayrıldı
    socket.on('player-disconnected', (playerId) => {
        console.log('Oyuncu ayrıldı:', playerId);
        delete players[playerId];
        updatePlayerCount();
    });
    
    // Oda listesi güncellendi
    socket.on('room-list-update', (roomsList) => {
        console.log('Odalar güncellendi');
        rooms = roomsList;
    });
}

// ==================== ODA İŞLEMLERİ ====================
function joinGame() {
    console.log('Oyun aranıyor...');
    socket.emit('find-game');
    showNotification('Oyun aranıyor...', 'info');
}

function showRooms() {
    console.log('Odalar listeleniyor');
    socket.emit('get-rooms', (roomsList) => {
        let roomText = 'Aktif Odalar:\n';
        Object.values(roomsList).forEach(room => {
            roomText += `\n🪐 Oda ${room.id}: ${room.players?.length || 0}/4 oyuncu`;
        });
        alert(roomText);
    });
}

function createRoom() {
    console.log('Oda oluşturma menüsü açıldı');
    document.getElementById('chaser-selector').classList.add('active');
}

function selectChaser(type) {
    console.log('Kovalayıcı tipi seçildi:', type);
    document.getElementById('chaser-selector').classList.remove('active');
    
    socket.emit('create-room', {
        chaserType: type,
        playerId: playerId,
        playerName: playerName
    });
}

function loadRoom(roomData) {
    console.log('Oda yükleniyor:', roomData);
    
    // Mevcut odadaki objeleri temizle
    clearRoom();
    
    // Yeni odayı oluştur
    if (roomData.walls) {
        // Gerçek oda duvarlarını yükle
    }
}

function clearRoom() {
    // Anahtarları temizle
    Object.values(keys).forEach(key => scene.remove(key));
    keys = {};
}

// ==================== HUD GÜNCELLEME ====================
function updatePlayerCount() {
    const count = Object.keys(players).length;
    document.getElementById('player-count').innerHTML = `👥 <span style="color: #ffd700;">${count}</span> oyuncu`;
}

// ==================== BİLDİRİM SİSTEMİ ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'rgba(0,255,0,0.2)' : type === 'error' ? 'rgba(255,0,0,0.2)' : 'rgba(255,215,0,0.2)'};
        color: white;
        padding: 15px 30px;
        border-radius: 50px;
        border: 2px solid ${type === 'success' ? '#00ff00' : type === 'error' ? '#ff0000' : '#ffd700'};
        backdrop-filter: blur(10px);
        z-index: 1000;
        font-size: 1.1rem;
        text-align: center;
        animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== KONTROLLER ====================
function setupEventListeners() {
    // Klavye kontrolleri
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Fare kilidi
    document.getElementById('game-canvas').addEventListener('click', () => {
        if (gameActive && document.pointerLockElement !== document.body) {
            document.body.requestPointerLock();
        }
    });
    
    // Fare hareketi (bakış)
    document.addEventListener('mousemove', handleMouseMove);
    
    // Mobil kontroller
    setupMobileControls();
    
    // Pencere yeniden boyutlandırma
    window.addEventListener('resize', handleResize);
    
    // Pointer lock değişimi
    document.addEventListener('pointerlockchange', handlePointerLockChange);
}

function handleKeyDown(e) {
    if (!gameActive) return;
    
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveState.forward = true;
            e.preventDefault();
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveState.backward = true;
            e.preventDefault();
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveState.left = true;
            e.preventDefault();
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveState.right = true;
            e.preventDefault();
            break;
        case 'Space':
            moveState.jump = true;
            e.preventDefault();
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            moveState.sprint = true;
            moveSpeed = 0.25;
            e.preventDefault();
            break;
        case 'KeyE':
            // Etkileşim (anahtar toplama)
            checkKeyPickup();
            e.preventDefault();
            break;
    }
}

function handleKeyUp(e) {
    switch(e.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveState.forward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveState.backward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveState.left = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveState.right = false;
            break;
        case 'Space':
            moveState.jump = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            moveState.sprint = false;
            moveSpeed = 0.15;
            break;
    }
}

function handleMouseMove(e) {
    if (!gameActive || document.pointerLockElement !== document.body) return;
    
    const sensitivity = 0.002;
    const deltaX = e.movementX * sensitivity;
    const deltaY = e.movementY * sensitivity;
    
    // Yatay hareket (sol-sağ)
    camera.rotation.y -= deltaX;
    
    // Dikey hareket (yukarı-aşağı) - sınırlı
    camera.rotation.x -= deltaY;
    camera.rotation.x = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, camera.rotation.x));
}

function handlePointerLockChange() {
    if (document.pointerLockElement === document.body) {
        console.log('Fare kilitlendi');
    } else {
        console.log('Fare çözüldü');
    }
}

function setupMobileControls() {
    // Joystick (basit)
    let touchStartX = 0;
    let touchStartY = 0;
    let joystickActive = false;
    
    const joystick = document.getElementById('movement-joystick');
    const jumpBtn = document.getElementById('jump-btn');
    const interactBtn = document.getElementById('interact-btn');
    
    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        joystickActive = true;
    });
    
    joystick.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joystickActive || !gameActive) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        // Hareket yönünü belirle
        moveState.forward = deltaY < -20;
        moveState.backward = deltaY > 20;
        moveState.left = deltaX < -20;
        moveState.right = deltaX > 20;
    });
    
    joystick.addEventListener('touchend', () => {
        joystickActive = false;
        moveState.forward = false;
        moveState.backward = false;
        moveState.left = false;
        moveState.right = false;
    });
    
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        moveState.jump = true;
    });
    
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        moveState.jump = false;
    });
    
    interactBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        checkKeyPickup();
    });
    
    // Mobil bakış için (ekrana dokunup sürükle)
    let lastTouchX = 0;
    let lastTouchY = 0;
    
    document.getElementById('game-canvas').addEventListener('touchstart', (e) => {
        if (!gameActive) return;
        const touch = e.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    });
    
    document.getElementById('game-canvas').addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!gameActive) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchX;
        const deltaY = touch.clientY - lastTouchY;
        
        // Kamerayı döndür (mobil için hassasiyet düşük)
        camera.rotation.y -= deltaX * 0.005;
        camera.rotation.x -= deltaY * 0.005;
        camera.rotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, camera.rotation.x));
        
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    });
}

function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== OYUN MEKANİKLERİ ====================
function checkKeyPickup() {
    if (!gameActive || hasKey) return;
    
    // Kameranın baktığı yönde ışın gönder
    const raycaster = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    
    raycaster.set(camera.position, direction);
    
    // Anahtarları kontrol et
    for (let keyId in keys) {
        const key = keys[keyId];
        const intersects = raycaster.intersectObject(key, true);
        
        if (intersects.length > 0 && intersects[0].distance < 3) {
            console.log('Anahtar toplanıyor:', keyId);
            socket.emit('collect-key', { 
                keyId: keyId, 
                playerId: playerId, 
                roomId: currentRoom 
            });
            break;
        }
    }
}

function updateMovement() {
    if (!gameActive) return;
    
    // Hareket hızı
    let currentSpeed = moveSpeed;
    
    // Hareket vektörü
    const moveX = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
    const moveZ = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0);
    
    if (moveX !== 0 || moveZ !== 0) {
        // Kameranın yönüne göre hareket et
        const angle = camera.rotation.y;
        
        // İleri/geri hareket
        if (moveZ !== 0) {
            velocity.z -= Math.sin(angle) * moveZ * currentSpeed;
            velocity.x -= Math.cos(angle) * moveZ * currentSpeed;
        }
        
        // Sağa/sola hareket (strafe)
        if (moveX !== 0) {
            velocity.z += Math.cos(angle) * moveX * currentSpeed;
            velocity.x -= Math.sin(angle) * moveX * currentSpeed;
        }
    }
    
    // Zıplama
    if (moveState.jump && isGrounded) {
        velocity.y = jumpPower;
        isGrounded = false;
    }
    
    // Yerçekimi
    if (!isGrounded) {
        velocity.y -= gravity;
    }
    
    // Yeni pozisyon
    const newPos = camera.position.clone().add(velocity);
    
    // Basit çarpışma kontrolü (duvarlar)
    if (Math.abs(newPos.x) < 24 && Math.abs(newPos.z) < 24) {
        camera.position.copy(newPos);
    } else {
        // Duvara çarpınca hızı sıfırla
        velocity.x = 0;
        velocity.z = 0;
    }
    
    // Y pozisyonu kontrolü (zemin/tavan)
    if (camera.position.y < playerHeight) {
        camera.position.y = playerHeight;
        velocity.y = 0;
        isGrounded = true;
    } else if (camera.position.y > 8) {
        camera.position.y = 8;
        velocity.y = 0;
    }
    
    // Sürtünme
    velocity.x *= 0.9;
    velocity.z *= 0.9;
    
    // Pozisyon geçmişine ekle (ışınlanma koruması)
    positionHistory.push(camera.position.clone());
    if (positionHistory.length > 10) {
        positionHistory.shift();
    }
    
    // Sunucuya gönder (saniyede 20 kez)
    if (socket && socket.connected && Math.random() < 0.05) {
        socket.emit('player-move', {
            position: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            },
            rotation: {
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z
            }
        });
    }
}

// ==================== ANİMASYON DÖNGÜSÜ ====================
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Oyun aktifse hareket et
    if (gameActive) {
        updateMovement();
    }
    
    // Anahtarları döndür
    Object.values(keys).forEach(key => {
        key.rotation.y += 0.02;
        key.position.y += Math.sin(Date.now() * 0.005) * 0.005;
    });
    
    // Diğer oyuncuları güncelle (ileride eklenecek)
    
    // Render
    renderer.render(scene, camera);
}

// ==================== OYUN BİTİRME ====================
function resetGame() {
    console.log('Oyun sıfırlanıyor...');
    
    gameActive = false;
    isGameStarted = false;
    hasKey = false;
    
    // Kamera pozisyonunu sıfırla
    camera.position.set(0, playerHeight, 5);
    camera.rotation.set(0, 0, 0);
    
    // UI'ı sıfırla
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('mobile-controls').classList.remove('active');
    document.getElementById('key-status').innerHTML = '🔑 Anahtar yok';
    document.getElementById('key-status').classList.remove('has-key');
    
    // Anahtarları temizle
    Object.values(keys).forEach(key => scene.remove(key));
    keys = {};
    
    // Test anahtarını geri ekle
    createKey(new THREE.Vector3(5, 1, 5), 'test_key');
}

function createWinEffect() {
    // Partikül efekti
    const particleCount = 100;
    const particles = [];
    
    for (let i = 0; i < particleCount; i++) {
        const geometry = new THREE.SphereGeometry(0.1, 4, 4);
        const material = new THREE.MeshStandardMaterial({ 
            color: Math.random() * 0xffffff,
            emissive: 0x442200
        });
        const particle = new THREE.Mesh(geometry, material);
        
        particle.position.copy(camera.position);
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            )
        };
        
        scene.add(particle);
        particles.push(particle);
    }
    
    // Partikülleri yok et
    setTimeout(() => {
        particles.forEach(p => scene.remove(p));
    }, 2000);
}

// ==================== BAŞLANGIÇ ====================
window.onload = initGame;

// CSS animasyonları ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from { transform: translate(-50%, -100px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    
    @keyframes slideUp {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, -100px); opacity: 0; }
    }
`;
document.head.appendChild(style);
