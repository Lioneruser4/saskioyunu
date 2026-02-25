// game.js - Ana Oyun Mantığı
class BackroomsGame {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.playerName = "Misafir";
        this.telegramId = null;
        this.currentRoom = null;
        this.players = new Map();
        this.gameActive = false;
        this.hasKey = false;
        this.isMonster = false;
        
        // Three.js değişkenleri
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.raycaster = new THREE.Raycaster();
        
        // Fizik
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 0.15;
        this.gravity = 0.02;
        this.isGrounded = true;
        
        // Hareket
        this.moveState = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
        // Oyuncu etiketleri
        this.nameTags = [];
        
        this.init();
    }

    init() {
        this.initTelegram();
        this.initThree();
        this.initSocket();
        this.initUI();
        this.initControls();
    }

    initTelegram() {
        if (window.Telegram?.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            const user = tg.initDataUnsafe?.user;
            if (user) {
                this.telegramId = user.id.toString();
                this.playerName = user.first_name || user.username || "Telegram Kullanıcısı";
                
                // Avatar için ilk harf
                document.getElementById('user-avatar').textContent = this.playerName.charAt(0).toUpperCase();
                document.getElementById('user-name').textContent = this.playerName;
                
                // Telegram temasını uygula
                document.body.classList.add('telegram');
            }
        } else {
            // Test için
            this.playerName = "Test_" + Math.floor(Math.random() * 1000);
            document.getElementById('user-avatar').textContent = this.playerName.charAt(0);
            document.getElementById('user-name').textContent = this.playerName;
        }
        
        console.log('👤 Oyuncu:', this.playerName);
    }

    initThree() {
        console.log('🎮 Three.js başlatılıyor...');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c10);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 2, 5);
        
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: document.getElementById('game-canvas'),
            antialias: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        
        // Işıklar
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
        
        // Test odası
        this.createTestRoom();
        
        // Animasyon döngüsü
        this.animate();
    }

    createTestRoom() {
        // Zemin
        const floorGeometry = new THREE.PlaneGeometry(50, 50);
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1b2e });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Grid
        const gridHelper = new THREE.GridHelper(50, 20, 0x6c5ce7, 0x2d3436);
        gridHelper.position.y = 0.01;
        this.scene.add(gridHelper);
        
        // Duvarlar
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3436 });
        const wallHeight = 5;
        
        // Dört duvar
        const walls = [
            { pos: [0, wallHeight/2, -25], scale: [50, wallHeight, 1] },
            { pos: [0, wallHeight/2, 25], scale: [50, wallHeight, 1] },
            { pos: [-25, wallHeight/2, 0], scale: [1, wallHeight, 50] },
            { pos: [25, wallHeight/2, 0], scale: [1, wallHeight, 50] }
        ];
        
        walls.forEach(wall => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(...wall.scale),
                wallMaterial
            );
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });
    }

    initSocket() {
        const serverUrl = 'https://saskioyunu-1-2d6i.onrender.com';
        
        this.socket = io(serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            transports: ['websocket']
        });
        
        this.socket.on('connect', () => {
            console.log('✅ Sunucuya bağlandı');
            this.playerId = this.socket.id;
            
            this.socket.emit('player-join', {
                id: this.playerId,
                telegramId: this.telegramId,
                name: this.playerName
            });
            
            document.getElementById('loading-screen').style.display = 'none';
        });
        
        this.socket.on('rooms-list', (rooms) => {
            this.updateRoomsList(rooms);
        });
        
        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.gameActive = true;
            
            // Rastgele spawn
            const spawnX = (Math.random() - 0.5) * 30;
            const spawnZ = (Math.random() - 0.5) * 30;
            this.camera.position.set(spawnX, 2, spawnZ);
            
            document.getElementById('main-menu').classList.add('hidden');
            document.getElementById('game-hud').classList.add('active');
            
            if (window.innerWidth <= 768) {
                document.getElementById('mobile-controls').style.display = 'flex';
            }
            
            this.showNotification('Odaya katıldın!', 'success');
        });
        
        this.socket.on('room-players', (players) => {
            this.updatePlayersList(players);
        });
        
        this.socket.on('player-moved', (data) => {
            this.updatePlayerPosition(data);
        });
        
        this.socket.on('key-collected', (data) => {
            if (data.playerId === this.playerId) {
                this.hasKey = true;
                document.getElementById('key-status').innerHTML = '🔑 <span style="color:#4cd137;">ANAHTAR ALINDI</span>';
            }
            this.showNotification(`${data.playerName} anahtarı aldı!`, 'warning');
        });
        
        this.socket.on('game-start', (data) => {
            this.isMonster = (data.monsterId === this.playerId);
            if (this.isMonster) {
                this.showNotification('SİZ CANAVARSINIZ!', 'error');
            }
        });
        
        this.socket.on('player-caught', (data) => {
            if (data.caughtId === this.playerId) {
                this.showNotification('🏆 YAKALANDIN!', 'error');
                setTimeout(() => this.backToMenu(), 2000);
            }
        });
    }

    initUI() {
        // Butonlar
        document.getElementById('quick-play-btn').addEventListener('click', () => {
            this.quickPlay();
        });
        
        document.getElementById('create-room-btn').addEventListener('click', () => {
            document.getElementById('monster-selector').classList.add('active');
        });
    }

    initControls() {
        // Klavye
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Mouse bakış
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Mobil joystick
        this.initJoystick();
        
        // Mobil butonlar
        document.getElementById('jump-btn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.moveState.jump = true;
        });
        
        document.getElementById('jump-btn').addEventListener('touchend', () => {
            this.moveState.jump = false;
        });
        
        document.getElementById('interact-btn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.interact();
        });
    }

    initJoystick() {
        const joystick = document.getElementById('joystick');
        const area = document.getElementById('joystick-area');
        let active = false;
        
        area.addEventListener('touchstart', (e) => {
            active = true;
            const touch = e.touches[0];
            this.updateJoystick(touch.clientX, touch.clientY);
        });
        
        area.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!active) return;
            const touch = e.touches[0];
            this.updateJoystick(touch.clientX, touch.clientY);
        });
        
        area.addEventListener('touchend', () => {
            active = false;
            joystick.style.transform = 'translate(0px, 0px)';
            this.moveState.forward = false;
            this.moveState.backward = false;
            this.moveState.left = false;
            this.moveState.right = false;
        });
    }

    updateJoystick(x, y) {
        const area = document.getElementById('joystick-area');
        const joystick = document.getElementById('joystick');
        const rect = area.getBoundingClientRect();
        
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let deltaX = x - centerX;
        let deltaY = y - centerY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = rect.width / 2 - 25;
        
        if (distance > maxDistance) {
            deltaX = (deltaX / distance) * maxDistance;
            deltaY = (deltaY / distance) * maxDistance;
        }
        
        joystick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        
        // Hareket yönü
        this.moveState.forward = deltaY < -20;
        this.moveState.backward = deltaY > 20;
        this.moveState.left = deltaX < -20;
        this.moveState.right = deltaX > 20;
    }

    handleKeyDown(e) {
        if (!this.gameActive) return;
        
        switch(e.code) {
            case 'KeyW': this.moveState.forward = true; e.preventDefault(); break;
            case 'KeyS': this.moveState.backward = true; e.preventDefault(); break;
            case 'KeyA': this.moveState.left = true; e.preventDefault(); break;
            case 'KeyD': this.moveState.right = true; e.preventDefault(); break;
            case 'Space': this.moveState.jump = true; e.preventDefault(); break;
            case 'KeyE': this.interact(); e.preventDefault(); break;
        }
    }

    handleKeyUp(e) {
        switch(e.code) {
            case 'KeyW': this.moveState.forward = false; break;
            case 'KeyS': this.moveState.backward = false; break;
            case 'KeyA': this.moveState.left = false; break;
            case 'KeyD': this.moveState.right = false; break;
            case 'Space': this.moveState.jump = false; break;
        }
    }

    handleMouseMove(e) {
        if (!this.gameActive || document.pointerLockElement !== document.body) return;
        
        const sensitivity = 0.002;
        this.camera.rotation.y -= e.movementX * sensitivity;
        this.camera.rotation.x -= e.movementY * sensitivity;
        this.camera.rotation.x = Math.max(-1, Math.min(1, this.camera.rotation.x));
    }

    updateMovement() {
        if (!this.gameActive) return;
        
        const speed = this.moveSpeed;
        const moveX = (this.moveState.right ? 1 : 0) - (this.moveState.left ? 1 : 0);
        const moveZ = (this.moveState.forward ? 1 : 0) - (this.moveState.backward ? 1 : 0);
        
        if (moveX !== 0 || moveZ !== 0) {
            const angle = this.camera.rotation.y;
            
            if (moveZ !== 0) {
                this.velocity.x -= Math.sin(angle) * moveZ * speed;
                this.velocity.z -= Math.cos(angle) * moveZ * speed;
            }
            
            if (moveX !== 0) {
                this.velocity.x += Math.cos(angle) * moveX * speed;
                this.velocity.z -= Math.sin(angle) * moveX * speed;
            }
        }
        
        // Zıplama
        if (this.moveState.jump && this.isGrounded) {
            this.velocity.y = 0.3;
            this.isGrounded = false;
        }
        
        // Yerçekimi
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity;
        }
        
        // Pozisyon güncelle
        const newPos = this.camera.position.clone().add(this.velocity);
        
        // Basit çarpışma
        if (Math.abs(newPos.x) < 24 && Math.abs(newPos.z) < 24) {
            this.camera.position.copy(newPos);
        }
        
        // Y sınırı
        if (this.camera.position.y < 2) {
            this.camera.position.y = 2;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
        
        // Sürtünme
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
        
        // Sunucuya gönder
        if (Math.random() < 0.05) {
            this.socket?.emit('player-move', {
                id: this.playerId,
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                },
                rotation: {
                    x: this.camera.rotation.x,
                    y: this.camera.rotation.y,
                    z: this.camera.rotation.z
                }
            });
        }
    }

    quickPlay() {
        this.socket.emit('quick-play', {
            name: this.playerName,
            telegramId: this.telegramId
        });
        
        this.showNotification('Oyun aranıyor...', 'info');
    }

    selectMonster(type) {
        document.getElementById('monster-selector').classList.remove('active');
        
        this.socket.emit('create-room', {
            name: `${this.playerName}'ın Odası`,
            creator: this.playerName,
            creatorId: this.playerId,
            monsterType: type
        });
    }

    interact() {
        if (!this.gameActive) return;
        
        // Önde anahtar var mı kontrol et
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        // Anahtar kontrolü yapılacak
    }

    updateRoomsList(rooms) {
        const list = document.getElementById('rooms-list');
        const count = document.getElementById('room-count');
        
        if (!rooms || rooms.length === 0) {
            list.innerHTML = `
                <div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.3);">
                    Aktif oda yok<br>Hemen oda oluştur!
                </div>
            `;
            count.textContent = '0';
            return;
        }
        
        count.textContent = rooms.length;
        
        list.innerHTML = rooms.map(room => `
            <div class="room-card" onclick="window.game.joinRoom('${room.id}')">
                <div class="room-header">
                    <div class="room-name">
                        <span>🚪 ${room.name}</span>
                        <span class="room-badge ${room.monsterType === 'ai' ? 'badge-ai' : 'badge-player'}">
                            ${room.monsterType === 'ai' ? '🤖 YAPAY ZEKA' : '👤 OYUNCU'}
                        </span>
                    </div>
                    <div class="room-creator">
                        <div class="creator-avatar">${room.creator.charAt(0)}</div>
                        <span>${room.creator}</span>
                    </div>
                </div>
                <div class="room-stats">
                    <div class="stat"><span>👥</span> <span class="player-count">${room.players}/10</span></div>
                    <div class="stat"><span>⚡</span> ${room.status}</div>
                </div>
            </div>
        `).join('');
    }

    updatePlayersList(players) {
        const hud = document.getElementById('hud-players');
        
        hud.innerHTML = players.map(p => `
            <div class="player-avatar-mini ${p.isMonster ? 'monster' : ''}" 
                 style="background: ${p.isMonster ? 'linear-gradient(135deg, #ff4757, #c0392b)' : 'linear-gradient(135deg, #6c5ce7, #00cec9)'}">
                ${p.name.charAt(0)}
            </div>
        `).join('');
        
        // 3D etiketleri güncelle
        this.updateNameTags(players);
    }

    updateNameTags(players) {
        // Eski etiketleri temizle
        this.nameTags.forEach(tag => tag.remove());
        this.nameTags = [];
        
        // Yeni etiketler oluştur
        players.forEach(player => {
            if (player.id === this.playerId) return;
            
            const tag = document.createElement('div');
            tag.className = `player-name-tag ${player.isMonster ? 'monster' : ''}`;
            tag.textContent = player.name;
            tag.style.display = 'none';
            document.body.appendChild(tag);
            
            this.nameTags.push({
                element: tag,
                playerId: player.id,
                isMonster: player.isMonster
            });
        });
    }

    updatePlayerPosition(data) {
        const player = this.players.get(data.id) || {};
        player.position = data.position;
        this.players.set(data.id, player);
        
        // Etiket pozisyonunu güncelle
        const tag = this.nameTags.find(t => t.playerId === data.id);
        if (tag && data.position) {
            // 3D'den 2D'ye çevir
            const vector = new THREE.Vector3(data.position.x, data.position.y + 2.5, data.position.z);
            vector.project(this.camera);
            
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
            
            if (vector.z > 0 && x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight) {
                tag.element.style.display = 'block';
                tag.element.style.left = x + 'px';
                tag.element.style.top = y + 'px';
            } else {
                tag.element.style.display = 'none';
            }
        }
    }

    joinRoom(roomId) {
        this.socket.emit('join-room', {
            roomId: roomId,
            playerId: this.playerId,
            playerName: this.playerName
        });
    }

    showNotification(message, type = 'info') {
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ff4757' : type === 'success' ? '#4cd137' : '#6c5ce7'};
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            font-weight: 600;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            animation: slideDown 0.3s;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.style.animation = 'slideUp 0.3s';
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }

    backToMenu() {
        this.gameActive = false;
        this.currentRoom = null;
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('game-hud').classList.remove('active');
        document.getElementById('mobile-controls').style.display = 'none';
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        if (this.gameActive) {
            this.updateMovement();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Global
window.game = null;
window.onload = () => {
    window.game = new BackroomsGame();
};

// CSS Animasyonlar
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
