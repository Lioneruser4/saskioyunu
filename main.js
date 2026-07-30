// Three.js ve oyun motoru ayarları
let scene, camera, renderer, clock;
let player, players = [], tasks = [], deadBodies = [];
let isImpostor = false, gameStarted = false, gameOver = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let mouseSensitivity = 1.5;
let euler = { x: 0, y: 0 };
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let raycaster = new THREE.Raycaster();

// Oyun ayarları
let gameSettings = {
    playerCount: 10,
    impostorCount: 2,
    gameTime: 5,
    difficulty: 'normal'
};

// Backrooms haritası - sarı odalar ve floresan ışıklar
const BACKROOMS_COLORS = {
    wall: 0xccb800,
    floor: 0x998800,
    ceiling: 0xddcc44,
    trim: 0x665500
};

// Mobil kontroller
let touchControls = {
    joystick: { active: false, startX: 0, startY: 0, moveX: 0, moveY: 0 },
    lookActive: false,
    lookStartX: 0,
    lookStartY: 0
};

// Ses efektleri (basit)
function playSound(type) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    switch(type) {
        case 'kill':
            oscillator.frequency.value = 200;
            gainNode.gain.value = 0.3;
            oscillator.type = 'sawtooth';
            break;
        case 'report':
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.2;
            oscillator.type = 'square';
            break;
        case 'task':
            oscillator.frequency.value = 500;
            gainNode.gain.value = 0.1;
            oscillator.type = 'sine';
            break;
    }
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    setTimeout(() => oscillator.stop(), 300);
}

function init() {
    // Sahne oluşturma
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xccb800, 0, 50);
    scene.background = new THREE.Color(0x1a1a00);
    
    // Kamera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);
    
    // Işıklandırma
    const ambientLight = new THREE.AmbientLight(0x666633, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);
    
    // Backrooms floresan ışıklar
    for (let x = -20; x <= 20; x += 10) {
        for (let z = -20; z <= 20; z += 10) {
            const light = new THREE.PointLight(0xffffee, 1, 15);
            light.position.set(x, 4.5, z);
            light.castShadow = true;
            scene.add(light);
            
            // Işık modeli
            const lightGeo = new THREE.BoxGeometry(2, 0.1, 0.3);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const lightModel = new THREE.Mesh(lightGeo, lightMat);
            lightModel.position.copy(light.position);
            scene.add(lightModel);
        }
    }
    
    // Zemin
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: BACKROOMS_COLORS.floor,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Backrooms duvarları ve odaları oluştur
    createBackroomsMap();
    
    // Oyuncu modeli
    createPlayerModel();
    
    // Clock
    clock = new THREE.Clock();
    
    // Event listeners
    setupControls();
    
    animate();
}

function createBackroomsMap() {
    // Ana koridorlar ve odalar
    const rooms = [
        { x: 0, z: 0, w: 8, h: 4, d: 8 },
        { x: 10, z: 0, w: 6, h: 4, d: 6 },
        { x: -10, z: 0, w: 6, h: 4, d: 10 },
        { x: 0, z: 10, w: 10, h: 4, d: 6 },
        { x: 0, z: -10, w: 10, h: 4, d: 6 },
        { x: 12, z: 10, w: 4, h: 4, d: 4 },
        { x: -12, z: -10, w: 5, h: 4, d: 5 }
    ];
    
    rooms.forEach(room => {
        createRoom(room.x, room.z, room.w, room.h, room.d);
    });
    
    // Koridorlar
    createCorridor(0, 0, 0, 10);
    createCorridor(0, -10, 0, 0);
    createCorridor(-5, 0, -10, 0);
    createCorridor(5, 0, 10, 0);
}

function createRoom(x, z, width, height, depth) {
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: BACKROOMS_COLORS.wall,
        roughness: 0.6,
        metalness: 0.3
    });
    
    const trimMaterial = new THREE.MeshStandardMaterial({ 
        color: BACKROOMS_COLORS.trim,
        roughness: 0.4,
        metalness: 0.5
    });
    
    // Duvarlar
    const walls = [
        { pos: [x + width/2, height/2, z], size: [0.3, height, depth] },
        { pos: [x - width/2, height/2, z], size: [0.3, height, depth] },
        { pos: [x, height/2, z + depth/2], size: [width, height, 0.3] },
        { pos: [x, height/2, z - depth/2], size: [width, height, 0.3] }
    ];
    
    walls.forEach(wall => {
        const wallGeo = new THREE.BoxGeometry(...wall.size);
        const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
        wallMesh.position.set(...wall.pos);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
        
        // Süpürgelik
        const trimGeo = new THREE.BoxGeometry(wall.size[0] + 0.1, 0.2, wall.size[2] + 0.1);
        const trimMesh = new THREE.Mesh(trimGeo, trimMaterial);
        trimMesh.position.set(wall.pos[0], 0.1, wall.pos[2]);
        scene.add(trimMesh);
    });
    
    // Tavan
    const ceilingGeo = new THREE.PlaneGeometry(width, depth);
    const ceilingMat = new THREE.MeshStandardMaterial({ 
        color: BACKROOMS_COLORS.ceiling,
        roughness: 0.5,
        side: THREE.DoubleSide
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(x, height, z);
    scene.add(ceiling);
}

function createCorridor(x1, z1, x2, z2) {
    const length = Math.sqrt((x2-x1)**2 + (z2-z1)**2);
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const angle = Math.atan2(z2-z1, x2-x1);
    
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: BACKROOMS_COLORS.wall,
        roughness: 0.6
    });
    
    // Koridor duvarları
    const corridorGeo = new THREE.BoxGeometry(length, 4, 0.3);
    const wall1 = new THREE.Mesh(corridorGeo, wallMaterial);
    wall1.position.set(midX, 2, midZ - 2);
    wall1.rotation.y = angle;
    scene.add(wall1);
    
    const wall2 = new THREE.Mesh(corridorGeo, wallMaterial);
    wall2.position.set(midX, 2, midZ + 2);
    wall2.rotation.y = angle;
    scene.add(wall2);
}

function createPlayerModel() {
    // Among Us benzeri karakter modeli
    player = new THREE.Group();
    
    // Gövde (fasulye şekli)
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.2, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    player.add(body);
    
    // Sırt çantası
    const backpackGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
    const backpack = new THREE.Mesh(backpackGeo, bodyMat);
    backpack.position.set(0, 0.9, -0.3);
    player.add(backpack);
    
    // Vizör (gözlük)
    const visorGeo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.1, metalness: 0.8 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.2, 0.35);
    player.add(visor);
    
    // Bacaklar
    for (let i = -1; i <= 1; i += 2) {
        const legGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.6, 16);
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(i * 0.2, 0.3, 0);
        leg.castShadow = true;
        player.add(leg);
    }
    
    scene.add(player);
}

function createBotPlayer(color, position, isImpostor) {
    const bot = new THREE.Group();
    
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.2, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    bot.add(body);
    
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), bodyMat);
    backpack.position.set(0, 0.9, -0.3);
    bot.add(backpack);
    
    const visorGeo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.1 });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.2, 0.35);
    bot.add(visor);
    
    bot.position.copy(position);
    bot.castShadow = true;
    scene.add(bot);
    
    return {
        mesh: bot,
        color: color,
        isImpostor: isImpostor,
        alive: true,
        tasks: [],
        velocity: new THREE.Vector3(),
        targetPosition: null,
        lastKill: 0
    };
}

function setupControls() {
    // Klavye kontrolleri
    document.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': moveForward = true; break;
            case 's': moveBackward = true; break;
            case 'a': moveLeft = true; break;
            case 'd': moveRight = true; break;
            case ' ': 
                e.preventDefault();
                if (player.position.y <= 0.1) {
                    player.userData.velocityY = 0.15;
                }
                break;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': moveForward = false; break;
            case 's': moveBackward = false; break;
            case 'a': moveLeft = false; break;
            case 'd': moveRight = false; break;
        }
    });
    
    // Mouse kontrolleri
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === renderer.domElement) {
            euler.y -= e.movementX * 0.002 * mouseSensitivity;
            euler.x -= e.movementY * 0.002 * mouseSensitivity;
            euler.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.x));
        }
    });
    
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });
    
    // Mobil kontroller
    if ('ontouchstart' in window) {
        setupMobileControls();
    }
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setupMobileControls() {
    // Sanal joystick
    document.addEventListener('touchstart', (e) => {
        for (let touch of e.touches) {
            if (touch.clientX < window.innerWidth / 3) {
                touchControls.joystick.active = true;
                touchControls.joystick.startX = touch.clientX;
                touchControls.joystick.startY = touch.clientY;
            } else {
                touchControls.lookActive = true;
                touchControls.lookStartX = touch.clientX;
                touchControls.lookStartY = touch.clientY;
            }
        }
    });
    
    document.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let touch of e.touches) {
            if (touchControls.joystick.active && touch.clientX < window.innerWidth / 3) {
                touchControls.joystick.moveX = touch.clientX - touchControls.joystick.startX;
                touchControls.joystick.moveY = touch.clientY - touchControls.joystick.startY;
            }
            if (touchControls.lookActive) {
                const deltaX = touch.clientX - touchControls.lookStartX;
                const deltaY = touch.clientY - touchControls.lookStartY;
                euler.y -= deltaX * 0.003 * mouseSensitivity;
                euler.x -= deltaY * 0.003 * mouseSensitivity;
                euler.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, euler.x));
                touchControls.lookStartX = touch.clientX;
                touchControls.lookStartY = touch.clientY;
            }
        }
    });
    
    document.addEventListener('touchend', () => {
        touchControls.joystick.active = false;
        touchControls.joystick.moveX = 0;
        touchControls.joystick.moveY = 0;
        touchControls.lookActive = false;
    });
}

function updateMovement(deltaTime) {
    if (!gameStarted || gameOver) return;
    
    velocity.x = 0;
    velocity.z = 0;
    
    // Klavye hareketi
    if (moveForward) velocity.z -= 5;
    if (moveBackward) velocity.z += 5;
    if (moveLeft) velocity.x -= 5;
    if (moveRight) velocity.x += 5;
    
    // Mobil joystick
    if (touchControls.joystick.active) {
        velocity.x = touchControls.joystick.moveX * 0.05;
        velocity.z = touchControls.joystick.moveY * 0.05;
    }
    
    // Hareket yönünü kameraya göre ayarla
    direction.z = velocity.z;
    direction.x = velocity.x;
    direction.normalize();
    
    const rotateAngle = euler.y;
    const moveX = direction.x * Math.cos(rotateAngle) - direction.z * Math.sin(rotateAngle);
    const moveZ = direction.x * Math.sin(rotateAngle) + direction.z * Math.cos(rotateAngle);
    
    // Zıplama
    if (player.userData.velocityY) {
        player.position.y += player.userData.velocityY;
        player.userData.velocityY -= 0.008;
        if (player.position.y <= 0) {
            player.position.y = 0;
            player.userData.velocityY = 0;
        }
    }
    
    // Duvara sürtünme efekti - karakteri duvarlara yapıştır
    const newPos = player.position.clone();
    newPos.x += moveX * deltaTime;
    newPos.z += moveZ * deltaTime;
    
    // Basit çarpışma kontrolü
    if (checkCollision(newPos)) {
        // Sürtünme efekti - yavaşça duvar boyunca kay
        const slideX = moveX * deltaTime * 0.3;
        const slideZ = moveZ * deltaTime * 0.3;
        
        const testX = player.position.clone();
        testX.x += slideX;
        if (!checkCollision(testX)) player.position.x += slideX;
        
        const testZ = player.position.clone();
        testZ.z += slideZ;
        if (!checkCollision(testZ)) player.position.z += slideZ;
    } else {
        player.position.copy(newPos);
    }
    
    // Kamera takibi
    camera.position.copy(player.position);
    camera.position.y += 1.6;
    
    // Kamera rotasyonu
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(new THREE.Euler(euler.x, euler.y, 0, 'YXZ'));
    camera.quaternion.copy(quaternion);
}

function checkCollision(position) {
    // Backrooms duvarlarına çarpışma kontrolü
    const rooms = [
        { x: 0, z: 0, w: 8, d: 8 },
        { x: 10, z: 0, w: 6, d: 6 },
        { x: -10, z: 0, w: 6, d: 10 },
        { x: 0, z: 10, w: 10, d: 6 },
        { x: 0, z: -10, w: 10, d: 6 }
    ];
    
    for (let room of rooms) {
        const minX = room.x - room.w/2 + 0.5;
        const maxX = room.x + room.w/2 - 0.5;
        const minZ = room.z - room.d/2 + 0.5;
        const maxZ = room.z + room.d/2 - 0.5;
        
        if (position.x > minX && position.x < maxX &&
            position.z > minZ && position.z < maxZ) {
            return false; // Oda içinde, çarpışma yok
        }
    }
    
    return true; // Duvara çarptı
}

function updateBots(deltaTime) {
    players.forEach(bot => {
        if (!bot.alive) return;
        
        // Bot AI - rastgele dolaşma
        if (!bot.targetPosition || bot.mesh.position.distanceTo(bot.targetPosition) < 1) {
            bot.targetPosition = getRandomPosition();
        }
        
        // Hedefe doğru hareket
        const direction = bot.targetPosition.clone().sub(bot.mesh.position).normalize();
        bot.mesh.position.add(direction.multiplyScalar(2 * deltaTime));
        
        // Bot rotasyonu
        bot.mesh.lookAt(bot.targetPosition);
        
        // Katil botlar için öldürme mantığı
        if (bot.isImpostor && bot.alive) {
            const now = Date.now();
            if (now - bot.lastKill > 5000) { // 5 saniye bekleme
                // Yakındaki oyuncuları kontrol et
                const distanceToPlayer = bot.mesh.position.distanceTo(player.position);
                if (distanceToPlayer < 2) {
                    killPlayer(bot);
                    bot.lastKill = now;
                }
                
                // Diğer botları öldür
                players.forEach(otherBot => {
                    if (otherBot !== bot && otherBot.alive && !otherBot.isImpostor) {
                        const dist = bot.mesh.position.distanceTo(otherBot.mesh.position);
                        if (dist < 2) {
                            killBot(otherBot, bot);
                            bot.lastKill = now;
                        }
                    }
                });
            }
        }
    });
}

function killPlayer(killer) {
    if (!gameStarted || gameOver) return;
    
    // Ölüm animasyonu
    const deathPosition = player.position.clone();
    createDeadBody(deathPosition, 0xff0000);
    
    // Oyuncuyu başlangıç noktasına ışınla (veya oyunu bitir)
    player.position.set(0, 0, 0);
    
    playSound('kill');
    showNotification('Öldürüldün!');
    
    // Tüm oyuncular öldü mü kontrol et
    checkGameEnd();
}

function killBot(bot, killer) {
    bot.alive = false;
    createDeadBody(bot.mesh.position.clone(), bot.color);
    scene.remove(bot.mesh);
    playSound('kill');
    checkGameEnd();
}

function createDeadBody(position, color) {
    const bodyGroup = new THREE.Group();
    
    // Ölü karakter modeli
    const bodyGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.6, 32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, transparent: true, opacity: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.3;
    bodyGroup.add(body);
    
    // Kan efekti
    const bloodGeo = new THREE.CircleGeometry(0.5, 32);
    const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8b0000, transparent: true, opacity: 0.6 });
    const blood = new THREE.Mesh(bloodGeo, bloodMat);
    blood.rotation.x = -Math.PI / 2;
    blood.position.y = 0.01;
    bodyGroup.add(blood);
    
    bodyGroup.position.copy(position);
    bodyGroup.userData = { color: color, time: Date.now() };
    
    scene.add(bodyGroup);
    deadBodies.push(bodyGroup);
}

function reportBody() {
    if (!gameStarted || gameOver) return;
    
    document.getElementById('report-prompt').style.display = 'none';
    startVoting();
}

function startVoting() {
    const votingScreen = document.getElementById('voting-screen');
    const votePlayers = document.getElementById('vote-players');
    votingScreen.style.display = 'block';
    
    let html = '';
    players.forEach((bot, index) => {
        if (bot.alive || deadBodies.some(body => body.userData.color === bot.color)) {
            html += `<div class="vote-player" onclick="castVote(${index})">
                🎭 Oyuncu ${index + 1} - ${bot.isImpostor ? '???' : 'Mürettebat'}
            </div>`;
        }
    });
    
    votePlayers.innerHTML = html;
    
    // 30 saniye oylama süresi
    let timeLeft = 30;
    const timerElement = document.getElementById('vote-timer');
    const timer = setInterval(() => {
        timeLeft--;
        timerElement.textContent = `⏱️ Kalan süre: ${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            endVoting();
        }
    }, 1000);
    
    window.currentTimer = timer;
}

function castVote(playerIndex) {
    // Rastgele oylama simülasyonu
    const votedOut = Math.random() < 0.5;
    clearInterval(window.currentTimer);
    
    if (votedOut) {
        const bot = players[playerIndex];
        if (bot) {
            bot.alive = false;
            scene.remove(bot.mesh);
            showNotification(`Oyuncu ${playerIndex + 1} atıldı! ${bot.isImpostor ? 'Katildi!' : 'Masumdu!'}`);
        }
    }
    
    endVoting();
}

function endVoting() {
    document.getElementById('voting-screen').style.display = 'none';
    checkGameEnd();
}

function checkGameEnd() {
    const aliveImpostors = players.filter(p => p.isImpostor && p.alive).length;
    const aliveCrewmates = players.filter(p => !p.isImpostor && p.alive).length;
    const totalAlive = aliveImpostors + aliveCrewmates;
    
    if (aliveImpostors === 0) {
        gameOver = true;
        showNotification('🎉 MÜRETTEBAT KAZANDI! Tüm katiller yakalandı!');
    } else if (aliveImpostors >= aliveCrewmates) {
        gameOver = true;
        showNotification('💀 KATİLLER KAZANDI! Mürettebat yok edildi!');
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: #ffd700;
        padding: 30px 50px;
        border: 2px solid #ffd700;
        border-radius: 20px;
        font-size: 1.5em;
        z-index: 1000;
        text-align: center;
        animation: fadeIn 0.5s;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function getRandomPosition() {
    const rooms = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: -10, z: 0 },
        { x: 0, z: 10 },
        { x: 0, z: -10 }
    ];
    
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    return new THREE.Vector3(
        room.x + (Math.random() - 0.5) * 6,
        0,
        room.z + (Math.random() - 0.5) * 6
    );
}

function updateMinimap() {
    const canvas = document.getElementById('minimap');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 150, 150);
    
    // Arkaplan
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 150, 150);
    
    // Odaları çiz
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.fillRect(30, 30, 40, 40);
    ctx.fillRect(80, 30, 30, 30);
    ctx.fillRect(10, 30, 30, 50);
    
    // Oyuncuyu göster
    const playerX = 75 + player.position.x * 3;
    const playerY = 75 + player.position.z * 3;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(playerX, playerY, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Botları göster
    players.forEach(bot => {
        if (bot.alive) {
            const botX = 75 + bot.mesh.position.x * 3;
            const botY = 75 + bot.mesh.position.z * 3;
            ctx.fillStyle = bot.isImpostor ? '#ff0000' : '#ffffff';
            ctx.beginPath();
            ctx.arc(botX, botY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function checkNearbyBody() {
    const reportPrompt = document.getElementById('report-prompt');
    let nearBody = false;
    
    deadBodies.forEach(body => {
        const distance = player.position.distanceTo(body.position);
        if (distance < 2) {
            nearBody = true;
        }
    });
    
    reportPrompt.style.display = nearBody ? 'block' : 'none';
}

function updateTasks() {
    if (isImpostor) {
        document.getElementById('task-list').style.display = 'none';
        document.getElementById('kill-button').style.display = 'block';
        return;
    }
    
    const tasksContainer = document.getElementById('tasks-container');
    let html = '';
    
    tasks.forEach((task, index) => {
        const completed = task.completed ? 'task-completed' : '';
        html += `<div class="task-item ${completed}">
            ${task.completed ? '✅' : '⬜'} ${task.name}
        </div>`;
    });
    
    tasksContainer.innerHTML = html;
}

function createTasks() {
    tasks = [
        { name: 'Kabloları Bağla', completed: false, location: new THREE.Vector3(5, 0, 5) },
        { name: 'Motoru Çalıştır', completed: false, location: new THREE.Vector3(-5, 0, -5) },
        { name: 'Haritayı İncele', completed: false, location: new THREE.Vector3(8, 0, 8) },
        { name: 'Numune Topla', completed: false, location: new THREE.Vector3(-8, 0, 8) },
        { name: 'Sistemi Sıfırla', completed: false, location: new THREE.Vector3(0, 0, 12) }
    ];
}

function checkTaskCompletion() {
    if (isImpostor) return;
    
    tasks.forEach(task => {
        if (!task.completed) {
            const distance = player.position.distanceTo(task.location);
            if (distance < 2) {
                task.completed = true;
                playSound('task');
                showNotification(`✅ Görev tamamlandı: ${task.name}`);
            }
        }
    });
    
    // Tüm görevler tamamlandı mı?
    if (tasks.every(t => t.completed)) {
        gameOver = true;
        showNotification('🎉 TÜM GÖREVLER TAMAMLANDI! Mürettebat kazandı!');
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    if (gameStarted && !gameOver) {
        updateMovement(deltaTime);
        updateBots(deltaTime);
        checkNearbyBody();
        checkTaskCompletion();
        updateTasks();
        updateMinimap();
        
        // Ölü bedenleri temizle (30 saniye sonra)
        deadBodies = deadBodies.filter(body => {
            if (Date.now() - body.userData.time > 30000) {
                scene.remove(body);
                return false;
            }
            return true;
        });
    }
    
    renderer.render(scene, camera);
}

function startGame() {
    // Ayarları al
    gameSettings.playerCount = parseInt(document.getElementById('playerCount').value);
    gameSettings.impostorCount = parseInt(document.getElementById('impostorCount').value);
    gameSettings.gameTime = parseInt(document.getElementById('gameTime').value);
    gameSettings.difficulty = document.getElementById('difficulty').value;
    mouseSensitivity = parseFloat(document.getElementById('mouseSensitivity').value);
    
    // Lobi'yi gizle
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('ui-overlay').style.display = 'block';
    
    // Oyunu başlat
    gameStarted = true;
    
    // Oyuncu rengini rastgele seç
    const playerColor = Math.random() * 0xffffff;
    player.children.forEach(child => {
        if (child.material && child.material.color) {
            child.material.color.setHex(playerColor);
        }
    });
    
    // Katil mi belirle
    isImpostor = Math.random() < (gameSettings.impostorCount / gameSettings.playerCount);
    
    if (isImpostor) {
        document.getElementById('kill-button').style.display = 'block';
        document.getElementById('task-list').style.display = 'none';
        showNotification('🔪 Sen bir KATİLSİN! Herkesi öldür!');
    } else {
        createTasks();
        showNotification('👨‍🚀 Sen MÜRETTEBATSIN! Görevleri tamamla!');
    }
    
    // Botları oluştur
    const botColors = [0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff, 0xff0088, 0x88ff00];
    for (let i = 0; i < gameSettings.playerCount - 1; i++) {
        const color = botColors[i % botColors.length];
        const position = getRandomPosition();
        const isBotImpostor = i < gameSettings.impostorCount - (isImpostor ? 1 : 0);
        const bot = createBotPlayer(color, position, isBotImpostor);
        players.push(bot);
    }
    
    // Zorluk ayarına göre bot hızı
    const speedMultiplier = gameSettings.difficulty === 'hard' ? 1.5 : gameSettings.difficulty === 'easy' ? 0.7 : 1;
    
    // Oyun süresi
    setTimeout(() => {
        if (!gameOver) {
            gameOver = true;
            const aliveImpostors = players.filter(p => p.isImpostor && p.alive).length;
            if (aliveImpostors > 0) {
                showNotification('⏰ Süre doldu! Katiller kazandı!');
            } else {
                showNotification('⏰ Süre doldu! Mürettebat kazandı!');
            }
        }
    }, gameSettings.gameTime * 60000);
    
    renderer.domElement.requestPointerLock();
}

// Slider değerlerini güncelle
document.getElementById('playerCount').addEventListener('input', (e) => {
    document.getElementById('playerCountDisplay').textContent = e.target.value;
});
document.getElementById('impostorCount').addEventListener('input', (e) => {
    document.getElementById('impostorCountDisplay').textContent = e.target.value;
});
document.getElementById('gameTime').addEventListener('input', (e) => {
    document.getElementById('gameTimeDisplay').textContent = e.target.value;
});
document.getElementById('mouseSensitivity').addEventListener('input', (e) => {
    document.getElementById('sensitivityDisplay').textContent = e.target.value;
});

// Oyunu başlat
init();
