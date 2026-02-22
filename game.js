/**
 * SAŞKİ OYUNU - PROFESYONEL OYUN MOTORU
 * @version 3.0.0
 * @author SAŞKİ GAMES
 */

// ==================== OYUN MOTORU ANA SINIFI ====================
class GameEngine {
    constructor(containerId, options = {}) {
        // Temel özellikler
        this.container = document.getElementById(containerId);
        this.options = {
            debug: false,
            graphics: 'high',
            shadows: true,
            antiAliasing: true,
            ...options
        };
        
        // Oyun durumu
        this.state = {
            isRunning: false,
            isPaused: false,
            isGameOver: false,
            currentRoom: null,
            currentMap: 'backrooms',
            gameMode: 'team_deathmatch',
            roundTime: 600, // saniye
            warmupTime: 30,
            respawnTime: 5,
            scoreLimit: 100
        };
        
        // Oyuncular
        this.players = new Map();
        this.localPlayer = null;
        this.localPlayerId = null;
        this.playerMeshes = new Map();
        
        // Fizik ve hareket
        this.physics = {
            gravity: 9.8,
            jumpForce: 5,
            moveSpeed: 5,
            sprintMultiplier: 1.5,
            crouchMultiplier: 0.5,
            friction: 0.8,
            acceleration: 10
        };
        
        // Silah sistemi
        this.weapons = {
            AK47: {
                name: 'AK-47',
                type: 'rifle',
                damage: 35,
                headshotMultiplier: 3.0,
                fireRate: 100, // ms
                reloadTime: 2000,
                ammo: 30,
                maxAmmo: 90,
                range: 100,
                accuracy: 0.8,
                recoil: 0.3,
                scope: false,
                burst: false,
                auto: true
            },
            M4A4: {
                name: 'M4A4',
                type: 'rifle',
                damage: 33,
                headshotMultiplier: 3.0,
                fireRate: 90,
                reloadTime: 2100,
                ammo: 30,
                maxAmmo: 90,
                range: 95,
                accuracy: 0.85,
                recoil: 0.25,
                scope: false,
                burst: false,
                auto: true
            },
            SNIPER: {
                name: 'Keskin Nişancı',
                type: 'sniper',
                damage: 100,
                headshotMultiplier: 2.0,
                fireRate: 1000,
                reloadTime: 3000,
                ammo: 10,
                maxAmmo: 30,
                range: 200,
                accuracy: 0.95,
                recoil: 0.5,
                scope: true,
                burst: false,
                auto: false
            },
            SHOTGUN: {
                name: 'Pompalı',
                type: 'shotgun',
                damage: 20,
                headshotMultiplier: 1.5,
                fireRate: 800,
                reloadTime: 2500,
                ammo: 8,
                maxAmmo: 32,
                range: 30,
                accuracy: 0.3,
                recoil: 0.4,
                pellets: 8,
                scope: false,
                burst: false,
                auto: false
            },
            PISTOL: {
                name: 'Tabanca',
                type: 'pistol',
                damage: 25,
                headshotMultiplier: 2.5,
                fireRate: 200,
                reloadTime: 1500,
                ammo: 12,
                maxAmmo: 48,
                range: 50,
                accuracy: 0.9,
                recoil: 0.1,
                scope: false,
                burst: false,
                auto: false
            }
        };
        
        this.currentWeapon = 'AK47';
        this.ammo = 30;
        this.reserveAmmo = 90;
        this.isReloading = false;
        this.isFiring = false;
        this.lastFireTime = 0;
        
        // Üç boyutlu sahne
        this.initThreeJS();
        
        // Harita
        this.currentMap = null;
        
        // Sesler
        this.sounds = {};
        this.loadSounds();
        
        // Animasyon döngüsü
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        
        console.log('🎮 Oyun motoru başlatıldı');
    }

    // ==================== THREE.JS BAŞLATMA ====================
    initThreeJS() {
        // Sahne
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c12);
        this.scene.fog = new THREE.Fog(0x0a0c12, 50, 200);
        
        // Kamera
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        this.camera.position.set(0, 2, 5);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.container,
            antialias: this.options.antiAliasing,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.options.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.bias = 0.0001;
        
        // Işıklandırma
        this.setupLights();
        
        // Kontroller
        this.setupControls();
    }

    // ==================== IŞIKLANDIRMA ====================
    setupLights() {
        // Ambient ışık
        this.ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(this.ambientLight);
        
        // Ana ışık (güneş)
        this.mainLight = new THREE.DirectionalLight(0xffeedd, 1.2);
        this.mainLight.position.set(20, 30, 10);
        this.mainLight.castShadow = true;
        this.mainLight.receiveShadow = true;
        
        // Gölge ayarları
        this.mainLight.shadow.mapSize.width = 2048;
        this.mainLight.shadow.mapSize.height = 2048;
        this.mainLight.shadow.camera.near = 0.5;
        this.mainLight.shadow.camera.far = 100;
        this.mainLight.shadow.camera.left = -50;
        this.mainLight.shadow.camera.right = 50;
        this.mainLight.shadow.camera.top = 50;
        this.mainLight.shadow.camera.bottom = -50;
        this.mainLight.shadow.bias = -0.0005;
        
        this.scene.add(this.mainLight);
        
        // Yardımcı ışıklar
        const fillLight = new THREE.PointLight(0x446688, 0.5);
        fillLight.position.set(-10, 10, -10);
        this.scene.add(fillLight);
        
        const backLight = new THREE.PointLight(0x885544, 0.3);
        backLight.position.set(0, 5, -20);
        this.scene.add(backLight);
    }

    // ==================== KONTROLLER ====================
    setupControls() {
        // Klavye kontrolleri
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            shift: false,
            space: false,
            ctrl: false,
            r: false,
            '1': false,
            '2': false,
            '3': false
        };
        
        // Fare kontrolleri
        this.mouse = {
            x: 0,
            y: 0,
            left: false,
            right: false,
            wheel: 0
        };
        
        // Joystick kontrolleri (mobil)
        this.joysticks = {
            move: { active: false, x: 0, y: 0 },
            aim: { active: false, x: 0, y: 0 }
        };
        
        // Event listener'lar
        this.setupKeyboardListeners();
        this.setupMouseListeners();
        this.setupTouchListeners();
    }

    setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.state.isRunning) return;
            
            const key = e.key.toLowerCase();
            
            // Hareket tuşları
            if (key === 'w') this.keys.w = true;
            if (key === 'a') this.keys.a = true;
            if (key === 's') this.keys.s = true;
            if (key === 'd') this.keys.d = true;
            if (key === 'shift') this.keys.shift = true;
            if (key === ' ') {
                this.keys.space = true;
                this.jump();
            }
            if (key === 'control') this.keys.ctrl = true;
            if (key === 'r') {
                this.keys.r = true;
                this.reload();
            }
            
            // Silah seçimi
            if (key === '1') this.switchWeapon('AK47');
            if (key === '2') this.switchWeapon('M4A4');
            if (key === '3') this.switchWeapon('SNIPER');
            if (key === '4') this.switchWeapon('SHOTGUN');
            if (key === '5') this.switchWeapon('PISTOL');
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            
            if (key === 'w') this.keys.w = false;
            if (key === 'a') this.keys.a = false;
            if (key === 's') this.keys.s = false;
            if (key === 'd') this.keys.d = false;
            if (key === 'shift') this.keys.shift = false;
            if (key === ' ') this.keys.space = false;
            if (key === 'control') this.keys.ctrl = false;
            if (key === 'r') this.keys.r = false;
        });
    }

    setupMouseListeners() {
        // Fare hareketi (kamera)
        document.addEventListener('mousemove', (e) => {
            if (!this.state.isRunning) return;
            
            this.mouse.x = e.movementX;
            this.mouse.y = e.movementY;
            
            // Kamerayı döndür
            this.camera.rotation.y -= this.mouse.x * 0.002;
            this.camera.rotation.x -= this.mouse.y * 0.002;
            this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
        });

        // Fare tıklamaları
        document.addEventListener('mousedown', (e) => {
            if (!this.state.isRunning) return;
            
            if (e.button === 0) {
                this.mouse.left = true;
                this.startFiring();
            }
            if (e.button === 2) {
                this.mouse.right = true;
                this.aim();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.left = false;
                this.stopFiring();
            }
            if (e.button === 2) {
                this.mouse.right = false;
                this.stopAim();
            }
        });

        // Fare tekerleği (silah değiştirme)
        document.addEventListener('wheel', (e) => {
            if (!this.state.isRunning) return;
            
            this.mouse.wheel = e.deltaY;
            this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
        });
    }

    setupTouchListeners() {
        // Mobil joystick kontrolleri
        const moveJoystick = document.getElementById('moveJoystick');
        const aimJoystick = document.getElementById('aimJoystick');
        
        if (moveJoystick) {
            moveJoystick.addEventListener('touchstart', (e) => this.handleJoystickStart(e, 'move'));
            moveJoystick.addEventListener('touchmove', (e) => this.handleJoystickMove(e, 'move'));
            moveJoystick.addEventListener('touchend', () => this.handleJoystickEnd('move'));
        }
        
        if (aimJoystick) {
            aimJoystick.addEventListener('touchstart', (e) => this.handleJoystickStart(e, 'aim'));
            aimJoystick.addEventListener('touchmove', (e) => this.handleJoystickMove(e, 'aim'));
            aimJoystick.addEventListener('touchend', () => this.handleJoystickEnd('aim'));
        }
    }

    handleJoystickStart(e, type) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = e.target.getBoundingClientRect();
        
        this.joysticks[type].active = true;
        this.joysticks[type].startX = touch.clientX;
        this.joysticks[type].startY = touch.clientY;
        this.joysticks[type].centerX = rect.left + rect.width / 2;
        this.joysticks[type].centerY = rect.top + rect.height / 2;
    }

    handleJoystickMove(e, type) {
        if (!this.joysticks[type].active) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const dx = touch.clientX - this.joysticks[type].centerX;
        const dy = touch.clientY - this.joysticks[type].centerY;
        
        const distance = Math.sqrt(dx*dx + dy*dy);
        const maxDistance = 40;
        
        if (distance > maxDistance) {
            const angle = Math.atan2(dy, dx);
            this.joysticks[type].x = Math.cos(angle);
            this.joysticks[type].y = Math.sin(angle);
        } else {
            this.joysticks[type].x = dx / maxDistance;
            this.joysticks[type].y = dy / maxDistance;
        }
    }

    handleJoystickEnd(type) {
        this.joysticks[type].active = false;
        this.joysticks[type].x = 0;
        this.joysticks[type].y = 0;
    }

    // ==================== SES SİSTEMİ ====================
    loadSounds() {
        // Sesleri yükle (gerçek projede URL'ler eklenecek)
        this.sounds = {
            shoot: {
                AK47: this.createSound('ak47_shoot', 0.5),
                M4A4: this.createSound('m4a4_shoot', 0.5),
                SNIPER: this.createSound('sniper_shoot', 0.7),
                SHOTGUN: this.createSound('shotgun_shoot', 0.6),
                PISTOL: this.createSound('pistol_shoot', 0.3)
            },
            reload: this.createSound('reload', 0.4),
            hit: this.createSound('hit', 0.3),
            death: this.createSound('death', 0.5),
            footstep: this.createSound('footstep', 0.2),
            jump: this.createSound('jump', 0.3),
            land: this.createSound('land', 0.2)
        };
    }

    createSound(name, volume) {
        // Ses nesnesi oluştur (gerçek ses dosyalarıyla değiştirilecek)
        return {
            play: () => {
                if (this.options.debug) {
                    console.log(`🔊 Ses çalındı: ${name}`);
                }
            },
            stop: () => {},
            setVolume: (v) => {}
        };
    }

    // ==================== HARİTA SİSTEMİ ====================
    loadMap(mapName) {
        console.log(`🗺️ Harita yükleniyor: ${mapName}`);
        
        // Eski haritayı temizle
        if (this.currentMap) {
            this.scene.remove(this.currentMap);
        }
        
        // Yeni haritayı oluştur
        switch(mapName) {
            case 'backrooms':
                this.currentMap = this.createBackroomsMap();
                break;
            case 'warehouse':
                this.currentMap = this.createWarehouseMap();
                break;
            case 'complex':
                this.currentMap = this.createComplexMap();
                break;
            default:
                this.currentMap = this.createBackroomsMap();
        }
        
        this.scene.add(this.currentMap);
        this.state.currentMap = mapName;
    }

    createBackroomsMap() {
        const mapGroup = new THREE.Group();
        
        // Zemin (sarı halı)
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0xffdd99,
            roughness: 0.8,
            emissive: 0x221100,
            emissiveIntensity: 0.1
        });
        
        const floorGeo = new THREE.PlaneGeometry(100, 100);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;
        floor.receiveShadow = true;
        floor.castShadow = false;
        mapGroup.add(floor);

        // Grid deseni (meşhur backrooms halısı)
        const gridHelper = new THREE.GridHelper(100, 50, 0xffaa66, 0x442200);
        gridHelper.position.y = 0.01;
        mapGroup.add(gridHelper);

        // Duvarlar
        const wallMat = new THREE.MeshStandardMaterial({ 
            color: 0xffcc88,
            roughness: 0.6,
            emissive: 0x221100,
            emissiveIntensity: 0.05
        });
        
        const wallHeight = 5;
        
        // Dış duvarlar
        const wallPositions = [
            { pos: [0, wallHeight/2, -45], scale: [90, wallHeight, 2] },
            { pos: [0, wallHeight/2, 45], scale: [90, wallHeight, 2] },
            { pos: [-45, wallHeight/2, 0], scale: [2, wallHeight, 90] },
            { pos: [45, wallHeight/2, 0], scale: [2, wallHeight, 90] }
        ];
        
        wallPositions.forEach(w => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(...w.scale), wallMat);
            wall.position.set(...w.pos);
            wall.castShadow = true;
            wall.receiveShadow = true;
            mapGroup.add(wall);
        });

        // İç duvarlar (labirent)
        for (let i = -35; i <= 35; i += 10) {
            for (let j = -35; j <= 35; j += 10) {
                if (Math.random() > 0.7) {
                    const pillar = new THREE.Mesh(
                        new THREE.BoxGeometry(1.5, 4, 1.5),
                        new THREE.MeshStandardMaterial({ color: 0xccaa88 })
                    );
                    pillar.position.set(i, 2, j);
                    pillar.castShadow = true;
                    pillar.receiveShadow = true;
                    mapGroup.add(pillar);
                    
                    // Duvar ekle
                    if (Math.random() > 0.5) {
                        const wall = new THREE.Mesh(
                            new THREE.BoxGeometry(5, 4, 0.5),
                            new THREE.MeshStandardMaterial({ color: 0xccaa88 })
                        );
                        wall.position.set(i + 3, 2, j);
                        wall.castShadow = true;
                        wall.receiveShadow = true;
                        mapGroup.add(wall);
                    }
                }
            }
        }

        // Tavan lambaları (floresan)
        for (let i = -40; i <= 40; i += 10) {
            for (let j = -40; j <= 40; j += 10) {
                // Işık
                const light = new THREE.PointLight(0xffdd99, 0.8, 20);
                light.position.set(i, 4.5, j);
                mapGroup.add(light);
                
                // Lamba modeli
                const lampMat = new THREE.MeshStandardMaterial({ 
                    color: 0xeeeeee, 
                    emissive: 0x442200,
                    emissiveIntensity: 0.3
                });
                const lamp = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), lampMat);
                lamp.position.set(i, 4.6, j);
                lamp.castShadow = true;
                lamp.receiveShadow = true;
                mapGroup.add(lamp);
            }
        }

        return mapGroup;
    }

    createWarehouseMap() {
        const mapGroup = new THREE.Group();
        
        // Zemin
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x555555,
            roughness: 0.9
        });
        
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        mapGroup.add(floor);

        // Grid
        const grid = new THREE.GridHelper(80, 40, 0xffaa66, 0x334455);
        grid.position.y = 0.01;
        mapGroup.add(grid);

        // Konteynırlar
        const containerMat = new THREE.MeshStandardMaterial({ color: 0x884422 });
        
        for (let i = -30; i <= 30; i += 15) {
            for (let j = -30; j <= 30; j += 15) {
                if (i !== 0 || j !== 0) {
                    const container = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), containerMat);
                    container.position.set(i, 2, j);
                    container.castShadow = true;
                    container.receiveShadow = true;
                    mapGroup.add(container);
                }
            }
        }

        return mapGroup;
    }

    createComplexMap() {
        const mapGroup = new THREE.Group();
        
        // Zemin
        const floorMat = new THREE.MeshStandardMaterial({ 
            color: 0x667788,
            roughness: 0.7
        });
        
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        mapGroup.add(floor);

        // Grid
        const grid = new THREE.GridHelper(100, 50, 0xffaa66, 0x445566);
        grid.position.y = 0.01;
        mapGroup.add(grid);

        // Binalar
        for (let i = -40; i <= 40; i += 20) {
            for (let j = -40; j <= 40; j += 20) {
                const building = new THREE.Mesh(
                    new THREE.BoxGeometry(8, 10, 8),
                    new THREE.MeshStandardMaterial({ color: 0xaa9988 })
                );
                building.position.set(i, 5, j);
                building.castShadow = true;
                building.receiveShadow = true;
                mapGroup.add(building);
            }
        }

        return mapGroup;
    }

    // ==================== OYUNCU SİSTEMİ ====================
    createPlayer(id, data) {
        const group = new THREE.Group();
        
        // Minecraft tarzı blok karakter
        const colors = {
            red: 0xff5555,
            blue: 0x5555ff,
            skin: 0xefcbaa,
            pants: 0x2a4a6a,
            boots: 0x442211
        };
        
        const teamColor = data.team === 'red' ? colors.red : colors.blue;
        
        // Gövde
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.2, 0.4),
            new THREE.MeshStandardMaterial({ color: teamColor })
        );
        body.position.y = 0.6;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        
        // Baş
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            new THREE.MeshStandardMaterial({ color: colors.skin })
        );
        head.position.y = 1.3;
        head.castShadow = true;
        head.receiveShadow = true;
        group.add(head);
        
        // Kollar
        const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
        
        const leftArm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: teamColor }));
        leftArm.position.set(-0.6, 0.8, 0);
        leftArm.castShadow = true;
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: teamColor }));
        rightArm.position.set(0.6, 0.8, 0);
        rightArm.castShadow = true;
        group.add(rightArm);
        
        // Bacaklar
        const legGeo = new THREE.BoxGeometry(0.35, 0.8, 0.35);
        
        const leftLeg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: colors.pants }));
        leftLeg.position.set(-0.25, 0, 0);
        leftLeg.castShadow = true;
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: colors.pants }));
        rightLeg.position.set(0.25, 0, 0);
        rightLeg.castShadow = true;
        group.add(rightLeg);
        
        // Silah
        this.addWeaponToPlayer(group, data.weapon || 'AK47');
        
        // İsim etiketi
        this.createNameTag(group, data.username);
        
        // Sağlık barı
        this.createHealthBar(group, data.health || 100);
        
        group.userData = {
            id: id,
            username: data.username,
            team: data.team,
            health: data.health || 100,
            maxHealth: 100,
            weapon: data.weapon || 'AK47'
        };
        
        this.players.set(id, group);
        this.playerMeshes.set(id, group);
        
        return group;
    }

    addWeaponToPlayer(playerGroup, weaponType) {
        const weaponGroup = new THREE.Group();
        
        // Silah gövdesi
        let weaponGeo, weaponMat;
        
        switch(weaponType) {
            case 'AK47':
                weaponGeo = new THREE.BoxGeometry(0.2, 0.2, 0.8);
                weaponMat = new THREE.MeshStandardMaterial({ color: 0x442211 });
                break;
            case 'M4A4':
                weaponGeo = new THREE.BoxGeometry(0.18, 0.18, 0.75);
                weaponMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
                break;
            case 'SNIPER':
                weaponGeo = new THREE.BoxGeometry(0.15, 0.15, 1.2);
                weaponMat = new THREE.MeshStandardMaterial({ color: 0x224466 });
                break;
            case 'SHOTGUN':
                weaponGeo = new THREE.BoxGeometry(0.25, 0.25, 0.7);
                weaponMat = new THREE.MeshStandardMaterial({ color: 0x663322 });
                break;
            default:
                weaponGeo = new THREE.BoxGeometry(0.15, 0.15, 0.4);
                weaponMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        }
        
        const weaponBody = new THREE.Mesh(weaponGeo, weaponMat);
        weaponBody.position.set(0.5, 0.7, -0.3);
        weaponBody.castShadow = true;
        weaponGroup.add(weaponBody);
        
        // Namlu
        const barrel = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.1, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        barrel.position.set(0.5, 0.7, -0.7);
        barrel.castShadow = true;
        weaponGroup.add(barrel);
        
        // Dipçik (sadece uzun silahlar)
        if (weaponType === 'AK47' || weaponType === 'M4A4' || weaponType === 'SNIPER') {
            const stock = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, 0.2),
                new THREE.MeshStandardMaterial({ color: 0x442211 })
            );
            stock.position.set(0.5, 0.7, 0.1);
            stock.castShadow = true;
            weaponGroup.add(stock);
        }
        
        playerGroup.add(weaponGroup);
    }

    createNameTag(playerGroup, name) {
        // Canvas üzerinde isim yazısı
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'Bold 16px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(name, canvas.width/2, 22);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1, 0.25, 1);
        sprite.position.set(0, 2.2, 0);
        
        playerGroup.add(sprite);
    }

    createHealthBar(playerGroup, health) {
        const barGroup = new THREE.Group();
        
        // Arka plan (kırmızı)
        const bg = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.1, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xff0000 })
        );
        bg.position.set(0, 2.0, 0);
        barGroup.add(bg);
        
        // Can (yeşil)
        const fill = new THREE.Mesh(
            new THREE.BoxGeometry(0.8 * (health/100), 0.1, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x00ff00 })
        );
        fill.position.set(0, 2.0, 0);
        barGroup.add(fill);
        
        playerGroup.add(barGroup);
    }

    updatePlayerHealth(playerId, health) {
        const player = this.players.get(playerId);
        if (player) {
            // Can barını güncelle
            const barGroup = player.children.find(c => c.type === 'Group' && c.children.some(ch => ch.material?.color?.getHex() === 0x00ff00));
            if (barGroup) {
                const fill = barGroup.children[1];
                fill.scale.x = health / 100;
            }
            player.userData.health = health;
        }
    }

    // ==================== SİLAH SİSTEMİ ====================
    switchWeapon(weaponName) {
        if (this.weapons[weaponName] && this.currentWeapon !== weaponName) {
            this.currentWeapon = weaponName;
            this.ammo = this.weapons[weaponName].ammo;
            this.reserveAmmo = this.weapons[weaponName].maxAmmo;
            
            // UI güncelle
            document.getElementById('weaponName').textContent = this.weapons[weaponName].name;
            document.getElementById('weaponAmmo').textContent = `${this.ammo}/${this.reserveAmmo}`;
            
            // Animasyon
            this.showNotification(`Silah değiştirildi: ${this.weapons[weaponName].name}`, 'info');
        }
    }

    cycleWeapon(direction) {
        const weapons = Object.keys(this.weapons);
        const currentIndex = weapons.indexOf(this.currentWeapon);
        let newIndex = currentIndex + direction;
        
        if (newIndex < 0) newIndex = weapons.length - 1;
        if (newIndex >= weapons.length) newIndex = 0;
        
        this.switchWeapon(weapons[newIndex]);
    }

    startFiring() {
        this.isFiring = true;
        this.fire();
    }

    stopFiring() {
        this.isFiring = false;
    }

    fire() {
        if (!this.state.isRunning) return;
        if (this.isReloading) return;
        if (this.ammo <= 0) {
            this.reload();
            return;
        }
        
        const now = Date.now();
        const weapon = this.weapons[this.currentWeapon];
        
        if (now - this.lastFireTime < weapon.fireRate) return;
        
        this.lastFireTime = now;
        this.ammo--;
        
        // UI güncelle
        document.getElementById('weaponAmmo').textContent = `${this.ammo}/${this.reserveAmmo}`;
        
        // Ateş sesi
        this.sounds.shoot[this.currentWeapon].play();
        
        // Mermi izi
        this.createBulletTrail();
        
        // Muzzle flash
        this.createMuzzleFlash();
        
        // Recoil
        this.applyRecoil();
        
        // Raycast atış
        this.performRaycast();
        
        if (this.isFiring && weapon.auto) {
            setTimeout(() => this.fire(), weapon.fireRate);
        }
    }

    performRaycast() {
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.camera.quaternion);
        
        raycaster.set(this.camera.position, direction);
        
        const players = Array.from(this.players.values())
            .filter(p => p.userData.id !== this.localPlayerId);
        
        const intersects = raycaster.intersectObjects(players, true);
        
        if (intersects.length > 0) {
            let hit = intersects[0];
            let hitPlayer = null;
            
            // Hangi oyuncuya vurduğunu bul
            for (let [id, playerMesh] of this.players) {
                if (playerMesh === hit.object || playerMesh.children.includes(hit.object)) {
                    hitPlayer = id;
                    break;
                }
            }
            
            if (hitPlayer) {
                const hitY = hit.point.y;
                const playerY = this.players.get(hitPlayer).position.y;
                const relativeY = hitY - playerY;
                
                let hitZone = 'body';
                if (relativeY > 1.1) hitZone = 'head';
                else if (relativeY < 0.3) hitZone = 'leg';
                else if (relativeY > 0.6 && relativeY < 1.1) hitZone = 'body';
                else hitZone = 'arm';
                
                // Kan efekti
                this.createBloodEffect(hit.point);
                
                // Sunucuya gönder
                if (window.socket) {
                    window.socket.emit('player:shoot', {
                        targetId: hitPlayer,
                        hitZone: hitZone,
                        weapon: this.currentWeapon
                    });
                }
            }
        }
    }

    createBulletTrail() {
        const start = this.camera.position.clone();
        const end = this.camera.position.clone();
        end.z -= 100;
        
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffaa00 });
        const line = new THREE.Line(geometry, material);
        
        this.scene.add(line);
        setTimeout(() => this.scene.remove(line), 50);
    }

    createMuzzleFlash() {
        const flash = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffaa00 })
        );
        flash.position.copy(this.camera.position);
        flash.position.z -= 0.5;
        
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 50);
    }

    createBloodEffect(position) {
        const particleCount = 10;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            positions[i*3] = position.x + (Math.random() - 0.5) * 0.5;
            positions[i*3+1] = position.y + (Math.random() - 0.5) * 0.5;
            positions[i*3+2] = position.z + (Math.random() - 0.5) * 0.5;
            
            colors[i*3] = 1;
            colors[i*3+1] = 0;
            colors[i*3+2] = 0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({ 
            size: 0.1,
            vertexColors: true,
            transparent: true
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        setTimeout(() => this.scene.remove(particles), 500);
    }

    applyRecoil() {
        const weapon = this.weapons[this.currentWeapon];
        this.camera.rotation.x -= weapon.recoil * 0.01;
        this.camera.rotation.y += (Math.random() - 0.5) * weapon.recoil * 0.01;
    }

    reload() {
        if (this.isReloading) return;
        if (this.ammo === this.weapons[this.currentWeapon].ammo) return;
        if (this.reserveAmmo <= 0) return;
        
        this.isReloading = true;
        const weapon = this.weapons[this.currentWeapon];
        
        this.showNotification('Yeniden dolduruluyor...', 'info');
        this.sounds.reload.play();
        
        setTimeout(() => {
            const needed = weapon.ammo - this.ammo;
            const available = Math.min(needed, this.reserveAmmo);
            
            this.ammo += available;
            this.reserveAmmo -= available;
            
            document.getElementById('weaponAmmo').textContent = `${this.ammo}/${this.reserveAmmo}`;
            this.isReloading = false;
        }, weapon.reloadTime);
    }

    aim() {
        // Nişan alma
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
    }

    stopAim() {
        // Nişan almayı bırak
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
    }

    // ==================== HAREKET SİSTEMİ ====================
    updateMovement(deltaTime) {
        if (!this.localPlayer) return;
        
        const speed = this.physics.moveSpeed * deltaTime;
        const sprintMultiplier = this.keys.shift ? this.physics.sprintMultiplier : 1;
        const crouchMultiplier = this.keys.ctrl ? this.physics.crouchMultiplier : 1;
        
        const finalSpeed = speed * sprintMultiplier * crouchMultiplier;
        
        // Hareket vektörü
        const moveX = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
        const moveZ = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);
        
        if (moveX !== 0 || moveZ !== 0) {
            // Kameraya göre yönlendir
            const angle = this.camera.rotation.y;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const forwardZ = moveZ * cos - moveX * sin;
            const forwardX = moveZ * sin + moveX * cos;
            
            this.localPlayer.position.x += forwardX * finalSpeed;
            this.localPlayer.position.z += forwardZ * finalSpeed;
            
            // Ayak sesi
            if (!this.footstepTimer || Date.now() - this.footstepTimer > 400) {
                this.footstepTimer = Date.now();
                this.sounds.footstep.play();
            }
        }
        
        // Joystick hareketi (mobil)
        if (this.joysticks.move.active) {
            const moveX = this.joysticks.move.x;
            const moveZ = this.joysticks.move.y;
            
            const angle = this.camera.rotation.y;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            const forwardZ = moveZ * cos - moveX * sin;
            const forwardX = moveZ * sin + moveX * cos;
            
            this.localPlayer.position.x += forwardX * finalSpeed;
            this.localPlayer.position.z += forwardZ * finalSpeed;
        }
        
        // Joystick aim (mobil kamera)
        if (this.joysticks.aim.active) {
            this.camera.rotation.y -= this.joysticks.aim.x * 0.02;
            this.camera.rotation.x -= this.joysticks.aim.y * 0.02;
            this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
        }
        
        // Kamerayı oyuncuya konumlandır
        this.camera.position.copy(this.localPlayer.position);
        this.camera.position.y += 1.5; // Göz hizası
        
        // Sunucuya gönder
        if (window.socket) {
            window.socket.emit('player:move', {
                position: this.localPlayer.position,
                rotation: {
                    x: this.camera.rotation.x,
                    y: this.camera.rotation.y
                }
            });
        }
    }

    jump() {
        if (!this.localPlayer) return;
        if (this.isJumping) return;
        
        this.isJumping = true;
        this.sounds.jump.play();
        
        // Zıplama animasyonu
        const startY = this.localPlayer.position.y;
        const jumpHeight = 2;
        let jumpTime = 0;
        
        const jumpInterval = setInterval(() => {
            jumpTime += 0.1;
            const progress = jumpTime / 0.5; // 0.5 saniye
            
            if (progress >= 1) {
                clearInterval(jumpInterval);
                this.localPlayer.position.y = startY;
                this.isJumping = false;
                this.sounds.land.play();
            } else {
                this.localPlayer.position.y = startY + Math.sin(progress * Math.PI) * jumpHeight;
            }
        }, 16);
    }

    // ==================== ANİMASYON DÖNGÜSÜ ====================
    start() {
        this.state.isRunning = true;
        this.clock.start();
        this.animate();
    }

    stop() {
        this.state.isRunning = false;
    }

    animate() {
        if (!this.state.isRunning) return;
        
        requestAnimationFrame(() => this.animate());
        
        this.deltaTime = this.clock.getDelta();
        
        // Hareket güncelleme
        this.updateMovement(this.deltaTime);
        
        // Sahneyi render et
        this.renderer.render(this.scene, this.camera);
    }

    // ==================== YARDIMCI FONKSİYONLAR ====================
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        const colors = {
            info: '#ff416c',
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545'
        };
        
        notification.style.borderLeftColor = colors[type] || colors.info;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }

    addKillFeed(killer, victim, weapon) {
        const feed = document.getElementById('killFeed');
        const item = document.createElement('div');
        item.className = 'kill-item';
        item.innerHTML = `<span style="color: #ff416c;">${killer}</span> → <span style="color: #fff;">${victim}</span> <span style="color: #ffaa00;">[${weapon}]</span>`;
        feed.appendChild(item);
        
        setTimeout(() => item.remove(), 3000);
    }

    // ==================== TEMİZLİK ====================
    dispose() {
        this.stop();
        
        // Three.js kaynaklarını temizle
        this.scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        
        this.renderer.dispose();
        
        console.log('🗑️ Oyun motoru temizlendi');
    }
}

// ==================== OYUNU BAŞLAT ====================
function initGame(roomData) {
    const game = new GameEngine('gameCanvas', {
        debug: false,
        graphics: 'high',
        shadows: true,
        antiAliasing: true
    });
    
    // Haritayı yükle
    game.loadMap(roomData.map || 'backrooms');
    
    // Oyunu başlat
    game.start();
    
    return game;
}

// ==================== GLOBAL FONKSİYONLAR ====================
window.GameEngine = GameEngine;
window.initGame = initGame;
