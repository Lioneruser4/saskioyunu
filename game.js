// Game Variables
let scene, camera, renderer;
let socket;
let player = {
    id: null,
    name: null,
    team: null,
    health: 100,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isJumping: false,
    isShooting: false,
    ammo: 30,
    isDead: false
};

let players = new Map();
let bullets = [];
let keys = {};
let mouse = { x: 0, y: 0, isLocked: false };
let currentRoom = null;
let gameStarted = false;

// Mobile Touch Controls
let touchControls = {
    leftJoystick: { active: false, x: 0, y: 0 },
    rightJoystick: { active: false, x: 0, y: 0 },
    fireButton: { active: false },
    jumpButton: { active: false },
    reloadButton: { active: false }
};

let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Telegram Integration
let telegramUser = null;

// Initialize Telegram WebApp
function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        telegramUser = tg.initDataUnsafe?.user;
        
        if (telegramUser) {
            player.id = telegramUser.id;
            player.name = telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : '');
            
            document.getElementById('userName').textContent = `Kullanıcı: ${player.name}`;
            document.getElementById('userId').textContent = `ID: ${player.id}`;
            document.getElementById('userInfo').style.display = 'block';
        }
        
        // Enable fullscreen and orientation lock
        tg.expand();
        tg.requestFullscreen();
        
        // Lock to landscape orientation on mobile
        if (isMobile) {
            tg.lockOrientation();
        }
        
        // Set theme colors
        tg.setHeaderColor('#667eea');
        tg.setBackgroundColor('#667eea');
        
        // Enable haptic feedback
        tg.enableClosingConfirmation();
        
        // Handle visibility changes
        tg.onEvent('viewportChanged', () => {
            if (camera && renderer) {
                handleResize();
            }
        });
        
        tg.onEvent('themeChanged', () => {
            // Handle theme changes if needed
        });
        
    } else {
        // Demo mode for testing
        player.id = Math.random().toString(36).substr(2, 9);
        player.name = 'Demo Kullanıcı';
        
        document.getElementById('userName').textContent = `Kullanıcı: ${player.name}`;
        document.getElementById('userId').textContent = `ID: ${player.id}`;
        document.getElementById('userInfo').style.display = 'block';
        
        // Request fullscreen for desktop testing
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    }
}

// Initialize Three.js
function initThreeJS() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x404040, 10, 100);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('gameCanvas'),
        antialias: true,
        powerPreference: isMobile ? 'low-power' : 'high-performance',
        failIfMajorPerformanceCaveat: false
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Optimize for mobile
    if (isMobile) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = false; // Disable shadows on mobile for performance
    } else {
        renderer.setPixelRatio(window.devicePixelRatio);
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = !isMobile;
    if (!isMobile) {
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -30;
        directionalLight.shadow.camera.right = 30;
        directionalLight.shadow.camera.top = 30;
        directionalLight.shadow.camera.bottom = -30;
    }
    scene.add(directionalLight);

    createBackroomsEnvironment();
}

// Create Backrooms-style Environment
function createBackroomsEnvironment() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffff00,
        transparent: true,
        opacity: 0.8
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls - Backrooms style
    const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xcccccc,
        transparent: true,
        opacity: 0.9
    });

    // Create maze-like walls
    const wallPositions = [
        { x: -20, z: -20, w: 40, h: 2 },
        { x: 20, z: -20, w: 2, h: 40 },
        { x: -20, z: 20, w: 2, h: 40 },
        { x: 0, z: 0, w: 20, h: 2 },
        { x: -10, z: 10, w: 2, h: 20 },
        { x: 10, z: -10, w: 2, h: 20 },
        { x: 0, z: -30, w: 30, h: 2 },
        { x: 30, z: 0, w: 2, h: 30 }
    ];

    wallPositions.forEach(wall => {
        const wallGeometry = new THREE.BoxGeometry(wall.w, 8, wall.h);
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(wall.x, 4, wall.z);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
    });

    // Add some random obstacles
    for (let i = 0; i < 10; i++) {
        const obstacleGeometry = new THREE.BoxGeometry(
            Math.random() * 3 + 1,
            Math.random() * 4 + 2,
            Math.random() * 3 + 1
        );
        const obstacleMaterial = new THREE.MeshLambertMaterial({ 
            color: new THREE.Color(0.8, 0.8, 0.8)
        });
        const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
        obstacle.position.set(
            (Math.random() - 0.5) * 40,
            obstacle.geometry.parameters.height / 2,
            (Math.random() - 0.5) * 40
        );
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        scene.add(obstacle);
    }
}

// Create Soldier Character
function createSoldier(team, position) {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(1, 2, 0.5);
    const bodyMaterial = new THREE.MeshLambertMaterial({ 
        color: team === 'blue' ? 0x2196F3 : 0xf44336 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.3);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.3;
    head.castShadow = true;
    group.add(head);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.3, 1.5, 0.3);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.7, 1, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.7, 1, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.4, 1.5, 0.4);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.2, -0.25, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.2, -0.25, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    group.position.set(position.x, position.y, position.z);
    
    return group;
}

// Socket.io Connection - Render Server
function initSocket() {
    socket = io('https://saskioyunu-1-2d6i.onrender.com', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity,
        maxReconnectionAttempts: Infinity,
        timeout: 20000,
        forceNew: true,
        autoConnect: true
    });

    socket.on('connect', () => {
        console.log('✅ Sunucuya başarıyla bağlandı');
        document.getElementById('loading').style.display = 'none';
        
        // Show connection success message
        if (gameStarted) {
            showNotification('🟢 Sunucuya yeniden bağlandı!');
        }
        
        // Rejoin room if we were in one
        if (currentRoom && player.id) {
            console.log('🔄 Odaya yeniden katılınyor:', currentRoom);
            socket.emit('rejoinRoom', { roomId: currentRoom, player: player });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('❌ Sunucu bağlantısı koptu:', reason);
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">Bağlantı Kesildi</div>
                <div class="loading-subtext">Yeniden bağlanılıyor...</div>
            </div>
        `;
        
        // Pause game when disconnected
        if (gameStarted) {
            showNotification('🔴 Bağlantı koptu! Oyun duraklatıldı...');
        }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Yeniden bağlanma denemesi: ${attemptNumber}`);
        document.getElementById('loading').innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">Yeniden Bağlanılıyor</div>
                <div class="loading-subtext">Deneme: ${attemptNumber}</div>
            </div>
        `;
    });

    socket.on('reconnect_failed', () => {
        console.log('❌ Yeniden bağlanma başarısız');
        document.getElementById('loading').innerHTML = `
            <div class="loading-content">
                <div style="font-size: 48px; margin-bottom: 20px;">❌</div>
                <div class="loading-text">Bağlantı Hatası</div>
                <div class="loading-subtext">Sunucuya ulaşılamıyor</div>
                <button onclick="location.reload()" style="
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                ">Sayfayı Yenile</button>
            </div>
        `;
    });

    socket.on('connect_error', (error) => {
        console.log('❌ Bağlantı hatası:', error.message);
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading').innerHTML = `
            <div class="loading-content">
                <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                <div class="loading-text">Bağlantı Hatası</div>
                <div class="loading-subtext">${error.message}</div>
            </div>
        `;
    });

    socket.on('playerJoined', (data) => {
        const newPlayer = createSoldier(data.team, data.position);
        newPlayer.userData = { id: data.id, name: data.name, team: data.team };
        players.set(data.id, newPlayer);
        scene.add(newPlayer);
        
        // Show join message
        if (gameStarted) {
            showNotification(`🟢 ${data.name} oyuna katıldı`);
        }
    });

    socket.on('playerLeft', (playerId) => {
        const playerMesh = players.get(playerId);
        if (playerMesh) {
            const playerName = playerMesh.userData.name;
            scene.remove(playerMesh);
            players.delete(playerId);
            
            // Show leave message
            if (gameStarted) {
                showNotification(`🔴 ${playerName} oyundan ayrıldı`);
            }
        }
    });

    socket.on('gameState', (gameState) => {
        // Update all players positions
        if (gameState.players) {
            gameState.players.forEach(p => {
                if (p.id !== player.id) {
                    const playerMesh = players.get(p.id);
                    if (playerMesh) {
                        playerMesh.position.set(p.position.x, p.position.y, p.position.z);
                        playerMesh.rotation.y = p.rotation.y;
                    }
                }
            });
        }
    });

    socket.on('playerDamaged', (data) => {
        if (data.targetId === player.id) {
            player.health = data.newHealth;
            updateHealthBar();
            
            // Show damage message
            if (data.damage >= 100) {
                showNotification('💀 Kafa vuruşu! Öldün!');
            } else if (data.damage >= 35) {
                showNotification('🎯 Vücut vuruşu!');
            } else {
                showNotification('🦶 Bacak vuruşu!');
            }
            
            if (player.health <= 0) {
                player.isDead = true;
                showNotification('💀 Öldün! 5 saniye sonra yeniden doğacaksın...');
                setTimeout(() => {
                    respawn();
                }, 5000);
            }
        }
    });

    socket.on('bulletHit', (data) => {
        // Create hit effect
        createHitEffect(data.position, data.damage);
    });

    socket.on('playerRespawned', (data) => {
        const playerMesh = players.get(data.playerId);
        if (playerMesh) {
            playerMesh.position.set(data.position.x, data.position.y, data.position.z);
            
            // Show respawn message
            if (data.playerId !== player.id) {
                const playerName = playerMesh.userData.name;
                showNotification(`🔄 ${playerName} yeniden doğdu!`);
            }
        }
    });

    socket.on('roomJoined', (data) => {
        currentRoom = data.roomId;
        player.team = data.team;
        startGame();
    });

    socket.on('roomsList', (rooms) => {
        displayRooms(rooms);
    });

    socket.on('error', (error) => {
        console.error('Sunucu hatası:', error);
        showNotification(`❌ Hata: ${error}`);
    });
}

// Game Controls
function initControls() {
    // Initialize touch controls if mobile
    if (isMobile || isTouchDevice) {
        initTouchControls();
        document.getElementById('mobileControls').style.display = 'block';
        document.querySelector('.controls-info').style.display = 'none';
    } else {
        // Keyboard controls for desktop
        document.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            
            if (e.code === 'Space' && !player.isJumping && !player.isDead) {
                player.velocity.y = 0.3;
                player.isJumping = true;
            }
        });

        document.addEventListener('keyup', (e) => {
            keys[e.code] = false;
        });
    }

    // Mouse controls (for both desktop and mobile with touch)
    const canvas = document.getElementById('gameCanvas');
    
    canvas.addEventListener('click', () => {
        if (!mouse.isLocked && gameStarted && !player.isDead && !isMobile) {
            canvas.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        mouse.isLocked = document.pointerLockElement === canvas;
        document.getElementById('crosshair').style.display = mouse.isLocked ? 'block' : 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (mouse.isLocked && !isMobile) {
            player.rotation.y -= e.movementX * 0.002;
            player.rotation.x -= e.movementY * 0.002;
            player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (e.button === 0 && mouse.isLocked && !player.isDead && player.ammo > 0 && !isMobile) {
            shoot();
        }
    });
}

// Reload function
function reload() {
    if (player.ammo < 30) {
        showNotification('Mermiler dolduruluyor...');
        setTimeout(() => {
            player.ammo = 30;
            updateAmmo();
            showNotification('Mermiler doldu!');
        }, 2000);
    }
}

// Shooting mechanics
function shoot() {
    if (player.ammo <= 0) {
        showNotification('Mermi bitti!');
        return;
    }

    player.isShooting = true;
    player.ammo--;
    updateAmmo();

    // Create bullet
    const bullet = {
        id: Date.now() + Math.random(),
        position: { ...player.position },
        velocity: {
            x: Math.sin(player.rotation.y) * 0.5,
            y: Math.sin(player.rotation.x) * 0.5,
            z: -Math.cos(player.rotation.y) * 0.5
        },
        owner: player.id
    };

    bullets.push(bullet);

    // Send to server
    socket.emit('shoot', {
        bullet: bullet,
        rotation: player.rotation
    });

    // Auto-reload after 30 bullets
    if (player.ammo <= 0) {
        setTimeout(() => {
            reload();
        }, 1000);
    }
}

// Update player movement
function updatePlayer(deltaTime) {
    if (player.isDead) return;

    const speed = isMobile ? 0.08 : 0.1; // Slower speed on mobile for better control
    const oldPosition = { ...player.position };

    // Movement - Handle both keyboard and touch controls
    let moveX = 0;
    let moveZ = 0;
    
    if (isMobile || isTouchDevice) {
        // Touch controls
        if (touchControls.leftJoystick.active) {
            moveX = touchControls.leftJoystick.x * speed;
            moveZ = touchControls.leftJoystick.y * speed;
        }
        
        // Rotation from right joystick
        if (touchControls.rightJoystick.active) {
            player.rotation.y += touchControls.rightJoystick.x * 0.03;
            player.rotation.x += touchControls.rightJoystick.y * 0.02;
            player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
        }
        
        // Jump from touch button
        if (touchControls.jumpButton.active && !player.isJumping) {
            player.velocity.y = 0.3;
            player.isJumping = true;
        }
        
        // Shoot from touch button
        if (touchControls.fireButton.active && player.ammo > 0) {
            shoot();
        }
        
        // Reload from touch button
        if (touchControls.reloadButton.active) {
            reload();
        }
    } else {
        // Keyboard controls
        if (keys['KeyW']) moveZ -= speed;
        if (keys['KeyS']) moveZ += speed;
        if (keys['KeyA']) moveX -= speed;
        if (keys['KeyD']) moveX += speed;
    }

    // Apply movement relative to camera rotation
    if (moveX !== 0 || moveZ !== 0) {
        player.position.x += moveX * Math.cos(player.rotation.y) - moveZ * Math.sin(player.rotation.y);
        player.position.z += moveX * Math.sin(player.rotation.y) + moveZ * Math.cos(player.rotation.y);
    }

    // Gravity
    player.velocity.y -= 0.01;
    player.position.y += player.velocity.y;

    // Ground collision
    if (player.position.y <= 0) {
        player.position.y = 0;
        player.velocity.y = 0;
        player.isJumping = false;
    }

    // Wall collision (simple)
    if (Math.abs(player.position.x) > 45) player.position.x = oldPosition.x;
    if (Math.abs(player.position.z) > 45) player.position.z = oldPosition.z;

    // Update camera
    camera.position.set(player.position.x, player.position.y + 1.6, player.position.z);
    camera.rotation.x = player.rotation.x;
    camera.rotation.y = player.rotation.y;

    // Send position to server
    if (socket && socket.connected) {
        socket.emit('playerUpdate', {
            position: player.position,
            rotation: player.rotation,
            velocity: player.velocity
        });
    }
}

// Update bullets
function updateBullets(deltaTime) {
    bullets = bullets.filter(bullet => {
        bullet.position.x += bullet.velocity.x;
        bullet.position.y += bullet.velocity.y;
        bullet.position.z += bullet.velocity.z;

        // Remove bullets that are too far or hit ground
        if (Math.abs(bullet.position.x) > 50 || 
            Math.abs(bullet.position.z) > 50 || 
            bullet.position.y < 0) {
            return false;
        }

        return true;
    });
}

// Create hit effect
function createHitEffect(position, damage) {
    const particleGeometry = new THREE.SphereGeometry(0.1);
    const particleMaterial = new THREE.MeshBasicMaterial({ 
        color: damage >= 100 ? 0xff0000 : 0xff6600 
    });
    
    for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        particle.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        scene.add(particle);
        
        setTimeout(() => {
            scene.remove(particle);
        }, 1000);
    }
}

// UI Functions
function updateHealthBar() {
    const healthPercent = Math.max(0, player.health);
    document.getElementById('healthFill').style.width = healthPercent + '%';
    
    if (healthPercent > 60) {
        document.getElementById('healthFill').style.background = 'linear-gradient(90deg, #4CAF50, #66BB6A)';
    } else if (healthPercent > 30) {
        document.getElementById('healthFill').style.background = 'linear-gradient(90deg, #ff9800, #ffb74d)';
    } else {
        document.getElementById('healthFill').style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
    }
}

function updateAmmo() {
    document.getElementById('ammo').textContent = `🔫 ${player.ammo} / ∞`;
}

function showTeamIndicator() {
    const indicator = document.getElementById('teamIndicator');
    indicator.textContent = player.team === 'blue' ? '🔵 MAVİ TAKIM' : '🔴 KIRMIZI TAKIM';
    indicator.className = player.team === 'blue' ? 'team-blue' : 'team-red';
}

function showNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'notification';
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        document.body.removeChild(notificationDiv);
    }, 3000);
}

function respawn() {
    player.health = 100;
    player.isDead = false;
    player.position = {
        x: (Math.random() - 0.5) * 20,
        y: 0,
        z: (Math.random() - 0.5) * 20
    };
    updateHealthBar();
    showNotification('Yeniden doğdun!');
}

// Menu Functions
function findGame() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Oyun Aranıyor</div>
            <div class="loading-subtext">Sunucuya bağlanılıyor...</div>
        </div>
    `;
    
    socket.emit('findGame', { player: player });
}

function showRooms() {
    socket.emit('getRooms');
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('roomsList').style.display = 'block';
}

function createRoom() {
    const roomName = prompt('Oda adı girin:');
    if (roomName) {
        socket.emit('createRoom', { 
            name: roomName,
            player: player 
        });
    }
}

function backToMenu() {
    document.getElementById('roomsList').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'block';
}

function displayRooms(rooms) {
    const container = document.getElementById('roomsContainer');
    container.innerHTML = '';
    
    rooms.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.className = 'room-item';
        roomDiv.innerHTML = `
            <div class="room-info">
                <div class="room-name">${room.name}</div>
                <div class="room-players">Oyuncular: ${room.players.length}/20</div>
            </div>
            <div>
                <span style="color: ${room.players.length < 20 ? '#4CAF50' : '#f44336'}">
                    ${room.players.length < 20 ? 'Katıl' : 'Dolu'}
                </span>
            </div>
        `;
        
        if (room.players.length < 20) {
            roomDiv.onclick = () => joinRoom(room.id);
        }
        
        container.appendChild(roomDiv);
    });
}

function joinRoom(roomId) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Odaya Bağlanılıyor</div>
            <div class="loading-subtext">Lütfen bekleyin...</div>
        </div>
    `;
    
    socket.emit('joinRoom', { 
        roomId: roomId,
        player: player 
    });
}

// Start Game
function startGame() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('roomsList').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    
    if (!isMobile) {
        document.querySelector('.controls-info').style.display = 'block';
    }
    
    gameStarted = true;
    showTeamIndicator();
    updateHealthBar();
    updateAmmo();
    
    // Initialize game systems
    initThreeJS();
    initControls();
    
    // Start game loop
    animate();
    
    // Handle orientation changes
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
}

// Game Loop
let lastTime = 0;
function animate(currentTime = 0) {
    requestAnimationFrame(animate);
    
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    if (gameStarted && !player.isDead) {
        updatePlayer(deltaTime);
        updateBullets(deltaTime);
    }
    
    // Update other players
    players.forEach((playerMesh, playerId) => {
        // Simple animation for other players
        if (playerMesh.userData.animation) {
            playerMesh.userData.animation += deltaTime;
        }
    });
    
    renderer.render(scene, camera);
}

// Window resize
function handleResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Handle orientation change
function handleOrientationChange() {
    setTimeout(() => {
        handleResize();
        
        // Adjust touch controls position for new orientation
        if (isMobile) {
            const orientation = window.orientation || screen.orientation?.angle || 0;
            // Touch controls will automatically adjust via CSS
        }
    }, 100);
}

window.addEventListener('resize', handleResize);

// Initialize touch controls
function initTouchControls() {
    const leftJoystick = document.getElementById('leftJoystick');
    const rightJoystick = document.getElementById('rightJoystick');
    const fireButton = document.getElementById('fireButton');
    const jumpButton = document.getElementById('jumpButton');
    const reloadButton = document.getElementById('reloadButton');

    leftJoystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchControls.leftJoystick.active = true;
        const rect = leftJoystick.getBoundingClientRect();
        touchControls.leftJoystick.x = e.touches[0].clientX - rect.left - rect.width / 2;
        touchControls.leftJoystick.y = e.touches[0].clientY - rect.top - rect.height / 2;
    });

    leftJoystick.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (touchControls.leftJoystick.active) {
            const rect = leftJoystick.getBoundingClientRect();
            touchControls.leftJoystick.x = e.touches[0].clientX - rect.left - rect.width / 2;
            touchControls.leftJoystick.y = e.touches[0].clientY - rect.top - rect.height / 2;
        }
    });

    leftJoystick.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchControls.leftJoystick.active = false;
        touchControls.leftJoystick.x = 0;
        touchControls.leftJoystick.y = 0;
    });

    rightJoystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchControls.rightJoystick.active = true;
        const rect = rightJoystick.getBoundingClientRect();
        touchControls.rightJoystick.x = e.touches[0].clientX - rect.left - rect.width / 2;
        touchControls.rightJoystick.y = e.touches[0].clientY - rect.top - rect.height / 2;
    });

    rightJoystick.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (touchControls.rightJoystick.active) {
            const rect = rightJoystick.getBoundingClientRect();
            touchControls.rightJoystick.x = e.touches[0].clientX - rect.left - rect.width / 2;
            touchControls.rightJoystick.y = e.touches[0].clientY - rect.top - rect.height / 2;
        }
    });

    rightJoystick.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchControls.rightJoystick.active = false;
        touchControls.rightJoystick.x = 0;
        touchControls.rightJoystick.y = 0;
    });

    fireButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchControls.fireButton.active = true;
    });

    fireButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchControls.fireButton.active = false;
    });

    jumpButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchControls.jumpButton.active = true;
    });

    jumpButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchControls.jumpButton.active = false;
    });

    reloadButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchControls.reloadButton.active = true;
    });

    reloadButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchControls.reloadButton.active = false;
    });
}

// Initialize game
window.addEventListener('load', () => {
    // Show loading screen initially
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Sunucuya Bağlanılıyor</div>
            <div class="loading-subtext">Lütfen bekleyin...</div>
        </div>
    `;
    
    initTelegram();
    initSocket();
    
    // Prevent default touch behaviors
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('#mobileControls')) {
            e.preventDefault();
        }
    }, { passive: false });
    
    document.addEventListener('touchmove', (e) => {
        if (e.target.closest('#mobileControls')) {
            e.preventDefault();
        }
    }, { passive: false });
    
    // Prevent context menu on long press
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    // Prevent double tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
});
