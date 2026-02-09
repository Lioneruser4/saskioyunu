// Telegram WebApp başlatma
window.Telegram.WebApp.ready();

// Oyun değişkenleri
let scene, camera, renderer, controls;
let players = {};
let currentPlayer = null;
let ball = null;
let field = null;
let goals = [];
let socket = null;
let currentRoom = null;
let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Animasyon değişkenleri
let mixer;
let clock = new THREE.Clock();
let moveDirection = new THREE.Vector3();
let currentVelocity = new THREE.Vector3();

// Oyun durumu
let gameState = {
    isPlaying: false,
    scores: { blue: 0, red: 0 },
    timeLeft: 600,
    ballPosition: { x: 0, y: 1, z: 0 }
};

// Üç.js başlatma
function init() {
    // Telegram kullanıcı bilgilerini al
    const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
    
    // Kullanıcı arayüzünü güncelle
    if (tgUser) {
        document.getElementById('username').textContent = tgUser.first_name || 'Oyuncu';
        if (tgUser.photo_url) {
            document.getElementById('profilePic').src = tgUser.photo_url;
        }
    } else {
        // Telegram dışında test için
        document.getElementById('username').textContent = 'Test Oyuncu';
        document.getElementById('profilePic').src = 'https://ui-avatars.com/api/?name=Oyuncu&background=random';
    }
    
    // Sahne oluştur
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Gökyüzü mavisi
    
    // Kamera oluştur
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 50);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('gameCanvas'),
        antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Işıklar
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Saha oluştur
    createField();
    
    // Top oluştur
    createBall();
    
    // Kontroller
    setupControls();
    
    // Socket.io bağlantısı
    socket = io();
    
    // Event listeners
    setupEventListeners();
    
    // Animasyon döngüsü
    animate();
}

// Futbol sahası oluştur
function createField() {
    // Zemin
    const groundGeometry = new THREE.PlaneGeometry(80, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x3CB371, // Çim yeşili
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Çizgiler
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    
    // Orta çizgi
    const middleLinePoints = [
        new THREE.Vector3(0, 0.1, -25),
        new THREE.Vector3(0, 0.1, 25)
    ];
    const middleLineGeometry = new THREE.BufferGeometry().setFromPoints(middleLinePoints);
    const middleLine = new THREE.Line(middleLineGeometry, lineMaterial);
    scene.add(middleLine);
    
    // Orta daire
    const circleGeometry = new THREE.CircleGeometry(9.15, 32);
    const circleEdges = new THREE.EdgesGeometry(circleGeometry);
    const circle = new THREE.LineSegments(circleEdges, lineMaterial);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.1;
    scene.add(circle);
    
    // Kale alanları
    createGoalArea(-35, 0, 0x4361ee); // Mavi takım
    createGoalArea(35, 0, 0xf72585); // Kırmızı takım
}

// Kale alanı oluştur
function createGoalArea(x, z, color) {
    const goalGeometry = new THREE.BoxGeometry(5, 2.5, 1);
    const goalMaterial = new THREE.MeshLambertMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.7
    });
    const goal = new THREE.Mesh(goalGeometry, goalMaterial);
    goal.position.set(x, 1.25, z);
    goal.castShadow = true;
    scene.add(goal);
    goals.push(goal);
    
    // Kale ağları
    const netGeometry = new THREE.BoxGeometry(4.8, 2.4, 0.1);
    const netMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.5
    });
    const net = new THREE.Mesh(netGeometry, netMaterial);
    net.position.set(x, 1.2, z + (x > 0 ? -0.5 : 0.5));
    scene.add(net);
}

// Top oluştur
function createBall() {
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffffff,
        shininess: 100
    });
    ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(0, 1, 0);
    scene.add(ball);
}

// Oyuncu oluştur
function createPlayer(id, username, team, position) {
    const playerColor = team === 'blue' ? 0x4361ee : 0xf72585;
    
    // Oyuncu gövdesi
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: playerColor });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    
    // Oyuncu başı
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC99 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.9;
    head.castShadow = true;
    
    // Oyuncu grup
    const playerGroup = new THREE.Group();
    playerGroup.add(body);
    playerGroup.add(head);
    playerGroup.position.set(position.x, position.y, position.z);
    
    scene.add(playerGroup);
    
    // Oyuncu bilgisi
    players[id] = {
        id: id,
        mesh: playerGroup,
        team: team,
        username: username,
        velocity: new THREE.Vector3(),
        isJumping: false
    };
    
    return playerGroup;
}

// Kontrolleri ayarla
function setupControls() {
    if (isMobile) {
        setupMobileControls();
    } else {
        setupDesktopControls();
    }
}

// Mobil kontroller
function setupMobileControls() {
    document.getElementById('mobileControls').style.display = 'flex';
    
    const joystickThumb = document.getElementById('joystickThumb');
    const joystickBase = joystickThumb.parentElement;
    const baseRect = joystickBase.getBoundingClientRect();
    const baseRadius = baseRect.width / 2;
    
    let isJoystickActive = false;
    
    // Joystick dokunma event'leri
    joystickThumb.addEventListener('touchstart', (e) => {
        isJoystickActive = true;
        e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isJoystickActive) return;
        
        const touch = e.touches[0];
        const x = touch.clientX - baseRect.left - baseRadius;
        const y = touch.clientY - baseRect.top - baseRadius;
        
        // Joystick sınırları
        const distance = Math.min(Math.sqrt(x*x + y*y), baseRadius * 0.7);
        const angle = Math.atan2(y, x);
        
        const thumbX = Math.cos(angle) * distance;
        const thumbY = Math.sin(angle) * distance;
        
        joystickThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
        
        // Hareket yönü
        moveDirection.set(-thumbY / (baseRadius * 0.7), 0, -thumbX / (baseRadius * 0.7));
        
        e.preventDefault();
    });
    
    document.addEventListener('touchend', () => {
        isJoystickActive = false;
        joystickThumb.style.transform = 'translate(40px, 40px)';
        moveDirection.set(0, 0, 0);
    });
    
    // Buton event'leri
    document.getElementById('jumpBtn').addEventListener('touchstart', () => {
        if (currentPlayer && !players[currentPlayer.id].isJumping) {
            players[currentPlayer.id].velocity.y = 0.1;
            players[currentPlayer.id].isJumping = true;
            socket.emit('playerAction', {
                roomId: currentRoom?.id,
                action: 'jump'
            });
        }
    });
    
    document.getElementById('passBtn').addEventListener('touchstart', () => {
        kickBall(5, 'pass');
    });
    
    document.getElementById('shootBtn').addEventListener('touchstart', () => {
        kickBall(15, 'shoot');
    });
}

// Masaüstü kontrolleri
function setupDesktopControls() {
    const keys = {};
    
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        
        if (e.key === ' ' && currentPlayer && !players[currentPlayer.id].isJumping) {
            players[currentPlayer.id].velocity.y = 0.1;
            players[currentPlayer.id].isJumping = true;
            socket.emit('playerAction', {
                roomId: currentRoom?.id,
                action: 'jump'
            });
        }
        
        // Fare ile şut (test için)
        if (e.key === 'f') {
            kickBall(15, 'shoot');
        }
        if (e.key === 'p') {
            kickBall(5, 'pass');
        }
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    
    // Hareket güncelleme
    function updateDesktopMovement() {
        if (!currentPlayer) return;
        
        moveDirection.set(0, 0, 0);
        
        if (keys['w'] || keys['arrowup']) moveDirection.z = -1;
        if (keys['s'] || keys['arrowdown']) moveDirection.z = 1;
        if (keys['a'] || keys['arrowleft']) moveDirection.x = -1;
        if (keys['d'] || keys['arrowright']) moveDirection.x = 1;
        
        // Normalize
        if (moveDirection.length() > 0) {
            moveDirection.normalize();
        }
    }
    
    // Fare kontrolleri
    let isMouseDown = false;
    
    window.addEventListener('mousedown', () => {
        isMouseDown = true;
    });
    
    window.addEventListener('mouseup', () => {
        isMouseDown = false;
    });
    
    window.addEventListener('mousemove', (e) => {
        if (isMouseDown && currentPlayer) {
            // Oyuncu rotasyonu
            const player = players[currentPlayer.id];
            if (player) {
                player.mesh.rotation.y += e.movementX * 0.01;
            }
        }
    });
    
    // Oyun döngüsüne hareket güncellemesini ekle
    const originalAnimate = animate;
    animate = function() {
        updateDesktopMovement();
        originalAnimate();
    };
}

// Topa vur
function kickBall(force, type) {
    if (!currentPlayer || !ball) return;
    
    const player = players[currentPlayer.id];
    const direction = new THREE.Vector3();
    
    // Top yönünü hesapla
    direction.subVectors(ball.position, player.mesh.position).normalize();
    
    // Topa vur
    ball.position.y += 0.2; // Biraz yukarı kaldır
    ball.userData.velocity = direction.multiplyScalar(force / 10);
    
    // Sunucuya gönder
    socket.emit('ballKick', {
        roomId: currentRoom?.id,
        force: force,
        direction: { x: direction.x, y: direction.y, z: direction.z },
        type: type
    });
    
    // Ses efekti (basit)
    playSound(type === 'shoot' ? 'shoot' : 'pass');
}

// Ses efekti
function playSound(type) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'shoot') {
        oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    } else {
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    }
}

// Event listeners
function setupEventListeners() {
    // Oda kur butonu
    document.getElementById('createRoomBtn').addEventListener('click', () => {
        document.getElementById('timeSelection').style.display = 'flex';
    });
    
    // Süre seçimi
    document.querySelectorAll('.time-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.time-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            
            const duration = parseInt(option.dataset.time);
            
            // Telegram kullanıcı bilgilerini al
            const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
            
            // Sunucuya bağlan
            socket.emit('join', {
                userId: tgUser?.id || Date.now().toString(),
                username: tgUser?.first_name || 'Oyuncu',
                photoUrl: tgUser?.photo_url || '',
                roomId: null // Yeni oda
            });
            
            // Oda ekranını göster
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('roomScreen').style.display = 'flex';
        });
    });
    
    // Hemen oyna
    document.getElementById('quickPlayBtn').addEventListener('click', () => {
        const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
        
        socket.emit('join', {
            userId: tgUser?.id || Date.now().toString(),
            username: tgUser?.first_name || 'Oyuncu',
            photoUrl: tgUser?.photo_url || '',
            roomId: 'quickplay'
        });
    });
    
    // Takım değiştir
    document.getElementById('blueTeam').addEventListener('click', (e) => {
        if (e.target.classList.contains('player-slot')) return;
        switchTeam('blue');
    });
    
    document.getElementById('redTeam').addEventListener('click', (e) => {
        if (e.target.classList.contains('player-slot')) return;
        switchTeam('red');
    });
    
    // Oyuna başla
    document.getElementById('startGameBtn').addEventListener('click', () => {
        if (currentRoom) {
            socket.emit('startGame', {
                roomId: currentRoom.id
            });
        }
    });
    
    // Menüye dön
    document.getElementById('backToMenuBtn').addEventListener('click', () => {
        document.getElementById('roomScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('timeSelection').style.display = 'none';
    });
}

// Takım değiştir
function switchTeam(team) {
    if (!currentPlayer || !currentRoom) return;
    
    socket.emit('switchTeam', {
        userId: currentPlayer.id,
        roomId: currentRoom.id,
        team: team
    });
}

// Socket event listeners
socket.on('joined', (data) => {
    currentRoom = data.room;
    currentPlayer = data.player;
    
    // Oyuncuları listele
    updatePlayerList(data.room);
});

socket.on('playerJoined', (data) => {
    updatePlayerList(data.room);
});

socket.on('teamUpdated', (data) => {
    updateTeamDisplay(data.blueTeam, data.redTeam);
});

socket.on('gameStarted', (data) => {
    // Oyun ekranını göster
    document.getElementById('roomScreen').style.display = 'none';
    document.getElementById('scoreboard').style.display = 'flex';
    
    // Oyun durumunu güncelle
    gameState.isPlaying = true;
    gameState.scores = { blue: 0, red: 0 };
    
    // Oyuncuları oluştur
    data.players.forEach(player => {
        if (player.id !== currentPlayer.id) {
            createPlayer(player.id, player.username, player.team, player.position || { x: 0, y: 1, z: 0 });
        }
    });
    
    // Kendi oyuncumuzu oluştur
    if (currentPlayer) {
        createPlayer(currentPlayer.id, currentPlayer.username, currentPlayer.team, 
                    currentPlayer.position || { x: 0, y: 1, z: 0 });
        
        // Kamera kontrolü
        setupCamera();
    }
    
    // Geri sayım
    startCountdown(3);
});

socket.on('playerMoved', (data) => {
    const player = players[data.userId];
    if (player) {
        player.mesh.position.set(data.position.x, data.position.y, data.position.z);
        player.mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    }
});

socket.on('ballMoved', (data) => {
    if (ball) {
        ball.position.set(data.position.x, data.position.y, data.position.z);
        ball.userData.velocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z);
    }
});

socket.on('goalScored', (data) => {
    // Skoru güncelle
    document.getElementById('blueScore').textContent = data.scores.blue;
    document.getElementById('redScore').textContent = data.scores.red;
    
    // Topu sıfırla
    if (ball) {
        ball.position.set(0, 1, 0);
        ball.userData.velocity = new THREE.Vector3(0, 0, 0);
    }
    
    // Gol animasyonu
    showGoalAnimation(data.team);
});

socket.on('gameUpdate', (data) => {
    gameState = data;
    
    // Topu güncelle
    if (ball && data.ball) {
        ball.position.set(data.ball.x, data.ball.y, data.ball.z);
    }
});

socket.on('gameEnded', (data) => {
    gameState.isPlaying = false;
    
    // Oyun sonu ekranı
    setTimeout(() => {
        alert(`Oyun bitti!\nMavi: ${data.scores.blue} - Kırmızı: ${data.scores.red}`);
        location.reload();
    }, 1000);
});

// Oyun listesini güncelle
function updatePlayerList(room) {
    const blueList = document.getElementById('bluePlayers');
    const redList = document.getElementById('redPlayers');
    
    blueList.innerHTML = '';
    redList.innerHTML = '';
    
    room.blueTeam.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-slot';
        div.textContent = player.username;
        blueList.appendChild(div);
    });
    
    room.redTeam.forEach(player => {
        const div = document.createElement('div');
        div.className = 'player-slot';
        div.textContent = player.username;
        redList.appendChild(div);
    });
}

// Takım görüntüsünü güncelle
function updateTeamDisplay(blueTeam, redTeam) {
    updatePlayerList({ blueTeam, redTeam, players: [...blueTeam, ...redTeam] });
}

// Kamera ayarı
function setupCamera() {
    if (!currentPlayer) return;
    
    const player = players[currentPlayer.id];
    if (!player) return;
    
    // Üçüncü şahıs kamerası
    camera.position.set(0, 10, -15);
    camera.lookAt(player.mesh.position);
    
    // Kamera takibi
    const cameraOffset = new THREE.Vector3(0, 10, -15);
    
    // Oyun döngüsüne kamera takibini ekle
    const originalAnimate = animate;
    animate = function() {
        if (player) {
            const playerPosition = player.mesh.position.clone();
            const cameraPosition = playerPosition.clone().add(cameraOffset);
            camera.position.lerp(cameraPosition, 0.1);
            camera.lookAt(playerPosition);
        }
        originalAnimate();
    };
}

// Geri sayım
function startCountdown(seconds) {
    const countdownElement = document.getElementById('countdown');
    countdownElement.style.display = 'block';
    
    let count = seconds;
    
    const interval = setInterval(() => {
        countdownElement.textContent = count > 0 ? count : 'BAŞLA!';
        
        if (count === 0) {
            clearInterval(interval);
            setTimeout(() => {
                countdownElement.style.display = 'none';
            }, 1000);
        }
        
        count--;
    }, 1000);
}

// Gol animasyonu
function showGoalAnimation(team) {
    const color = team === 'blue' ? '#4361ee' : '#f72585';
    const message = team === 'blue' ? 'MAVİ TAKIM GOL!' : 'KIRMIZI TAKIM GOL!';
    
    const goalDiv = document.createElement('div');
    goalDiv.style.position = 'fixed';
    goalDiv.style.top = '50%';
    goalDiv.style.left = '50%';
    goalDiv.style.transform = 'translate(-50%, -50%)';
    goalDiv.style.fontSize = '48px';
    goalDiv.style.color = color;
    goalDiv.style.fontWeight = 'bold';
    goalDiv.style.textShadow = '0 0 20px white';
    goalDiv.style.zIndex = '100';
    goalDiv.textContent = message;
    
    document.body.appendChild(goalDiv);
    
    setTimeout(() => {
        document.body.removeChild(goalDiv);
    }, 2000);
}

// Animasyon döngüsü
function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Oyuncu hareketi
    if (currentPlayer && gameState.isPlaying) {
        const player = players[currentPlayer.id];
        if (player) {
            // Hareket
            if (moveDirection.length() > 0) {
                const speed = 0.1;
                player.velocity.x = moveDirection.x * speed;
                player.velocity.z = moveDirection.z * speed;
                
                // Rotasyon
                if (moveDirection.z !== 0 || moveDirection.x !== 0) {
                    player.mesh.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                }
                
                // Sunucuya gönder
                socket.emit('playerMove', {
                    roomId: currentRoom?.id,
                    userId: currentPlayer.id,
                    position: player.mesh.position,
                    rotation: player.mesh.rotation
                });
            } else {
                player.velocity.x *= 0.9;
                player.velocity.z *= 0.9;
            }
            
            // Yerçekimi
            player.velocity.y -= 0.01;
            
            // Zıplama kontrolü
            if (player.mesh.position.y <= 1) {
                player.mesh.position.y = 1;
                player.velocity.y = 0;
                player.isJumping = false;
            }
            
            // Pozisyon güncelle
            player.mesh.position.x += player.velocity.x;
            player.mesh.position.y += player.velocity.y;
            player.mesh.position.z += player.velocity.z;
        }
    }
    
    // Top hareketi
    if (ball && ball.userData.velocity) {
        ball.position.x += ball.userData.velocity.x;
        ball.position.y += ball.userData.velocity.y;
        ball.position.z += ball.userData.velocity.z;
        
        // Yerçekimi
        ball.userData.velocity.y -= 0.01;
        
        // Zemin çarpışması
        if (ball.position.y < 0.5) {
            ball.position.y = 0.5;
            ball.userData.velocity.y *= -0.8;
            ball.userData.velocity.x *= 0.9;
            ball.userData.velocity.z *= 0.9;
        }
        
        // Kale çarpışması
        goals.forEach(goal => {
            const distance = ball.position.distanceTo(goal.position);
            if (distance < 3) {
                // Gol kontrolü
                const team = goal.position.x > 0 ? 'blue' : 'red';
                socket.emit('goal', {
                    roomId: currentRoom?.id,
                    team: team
                });
            }
        });
    }
    
    renderer.render(scene, camera);
}

// Pencere boyutu değiştiğinde
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Uygulamayı başlat
window.onload = init;
