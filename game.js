// Game variables
let socket;
let scene, camera, renderer;
let player, controls;
let players = {};
let bullets = [];
let rooms = [];
let currentRoom = null;
let team = null; // 'blue' or 'red'
let health = 100;
let playerGltf;
let walls = [];
let direction = new THREE.Vector3();

// Mobile controls
const mobileControls = document.getElementById('mobileControls');
const shootBtn = document.getElementById('shootBtn');
const jumpBtn = document.getElementById('jumpBtn');
const joystick = document.getElementById('joystick');
const isMobile = 'ontouchstart' in window;
const healthDiv = document.getElementById('health');
const crosshair = document.getElementById('crosshair');

// Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Connect to server
socket = io('https://saskioyunu-1-2d6i.onrender.com');

// Get user info from Telegram
const user = tg.initDataUnsafe?.user;
if (user) {
    socket.emit('join', { name: user.first_name, id: user.id });
} else {
    socket.emit('join', { name: 'Guest', id: Date.now() });
}

// Menu elements
const menu = document.getElementById('menu');
const roomsDiv = document.getElementById('rooms');
const createRoomDiv = document.getElementById('createRoom');
const gameCanvas = document.getElementById('gameCanvas');
const sidePanel = document.getElementById('sidePanel');
const findGameBtn = document.getElementById('findGame');
const showRoomsBtn = document.getElementById('showRooms');
const createRoomBtn = document.getElementById('createRoomBtn');
const backToMenuBtn = document.getElementById('backToMenu');
const backToMenuBtn2 = document.getElementById('backToMenu2');
const createBtn = document.getElementById('create');
const roomList = document.getElementById('roomList');
const playersDiv = document.getElementById('players');
const startGameBtn = document.getElementById('startGame');

// Menu events
findGameBtn.addEventListener('click', () => {
    socket.emit('findGame');
});

showRoomsBtn.addEventListener('click', () => {
    socket.emit('getRooms');
    menu.style.display = 'none';
    roomsDiv.style.display = 'block';
});

createRoomBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    createRoomDiv.style.display = 'block';
});

backToMenuBtn.addEventListener('click', () => {
    roomsDiv.style.display = 'none';
    menu.style.display = 'flex';
});

backToMenuBtn2.addEventListener('click', () => {
    createRoomDiv.style.display = 'none';
    menu.style.display = 'flex';
});

createBtn.addEventListener('click', () => {
    const aiType = document.getElementById('aiType').value;
    socket.emit('createRoom', { aiType });
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

// Socket events
socket.on('rooms', (data) => {
    roomList.innerHTML = '';
    data.forEach(room => {
        const div = document.createElement('div');
        div.textContent = `Room ${room.id}: ${room.players}/20`;
        div.addEventListener('click', () => {
            socket.emit('joinRoom', room.id);
        });
        roomList.appendChild(div);
    });
});

socket.on('joinedRoom', (data) => {
    currentRoom = data.roomId;
    team = data.team;
    roomsDiv.style.display = 'none';
    sidePanel.style.display = 'block';
    updatePlayers(data.players);
});

socket.on('playersUpdate', (data) => {
    updatePlayers(data);
    // Update meshes
    data.forEach(p => {
        if (p.id !== socket.id) {
            if (!players[p.id]) {
                if (playerGltf) {
                    // Create mesh for new player
                    const mesh = playerGltf.scene.clone();
                    mesh.position.set(p.position.x, p.position.y, p.position.z);
                    mesh.scale.set(0.5, 0.5, 0.5);
                    mesh.mixer = new THREE.AnimationMixer(mesh);
                    mesh.userId = p.id;
                    mesh.traverse((child) => {
                        if (child.isMesh) {
                            child.material.color.set(p.team === 'blue' ? 0x0000ff : 0xff0000);
                        }
                    });
                    scene.add(mesh);
                    players[p.id] = mesh;
                }
            } else {
                // Update position
                players[p.id].position.set(p.position.x, p.position.y, p.position.z);
            }
        }
    });
    // Remove disconnected players
    Object.keys(players).forEach(id => {
        if (!data.find(p => p.id === id)) {
            scene.remove(players[id]);
            delete players[id];
        }
    });
});

socket.on('playerUpdate', (data) => {
    if (players[data.id]) {
        players[data.id].position.set(data.position.x, data.position.y, data.position.z);
        players[data.id].rotation.y = data.rotation;
    }
});

socket.on('playerHit', (data) => {
    if (data.id === socket.id) {
        health -= data.damage;
        healthDiv.textContent = `HP: ${health}`;
        if (health <= 0) {
            health = 100;
            player.position.set(0, 0.9, 0);
        }
    }
});

socket.on('gameStarted', () => {
    initGame();
});

socket.on('bulletFired', (data) => {
    createBullet(data);
});

// Update players list
function updatePlayers(playerList) {
    playersDiv.innerHTML = '';
    playerList.forEach(p => {
        const div = document.createElement('div');
        div.textContent = `${p.name} (${p.team}) - HP: ${p.health}`;
        playersDiv.appendChild(div);
    });
    if (playerList.length >= 2) {
        startGameBtn.style.display = 'block';
    }
}

// Initialize Three.js game
function initGame() {
    menu.style.display = 'none';
    sidePanel.style.display = 'none';
    gameCanvas.style.display = 'block';
    healthDiv.style.display = 'block';
    crosshair.style.display = 'block';

    if (isMobile) {
        mobileControls.style.display = 'block';
        shootBtn.style.display = 'block';
        jumpBtn.style.display = 'block';
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x888888); // Backrooms yellow-ish

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Eye level

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: gameCanvas });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Resize
    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    // Add fluorescent lights
    for (let i = -10; i <= 10; i += 5) {
        for (let j = -10; j <= 10; j += 5) {
            const light = new THREE.PointLight(0xffffff, 0.5, 10);
            light.position.set(i, 3, j);
            scene.add(light);
        }
    }

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00 }); // Yellow walls
    // North wall
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 4), wallMaterial);
    northWall.position.set(0, 2, -50);
    scene.add(northWall);
    // South
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 4), wallMaterial);
    southWall.position.set(0, 2, 50);
    southWall.rotation.y = Math.PI;
    scene.add(southWall);
    // East
    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 4), wallMaterial);
    eastWall.position.set(50, 2, 0);
    eastWall.rotation.y = -Math.PI / 2;
    scene.add(eastWall);
    // West
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(100, 4), wallMaterial);
    westWall.position.set(-50, 2, 0);
    westWall.rotation.y = Math.PI / 2;
    scene.add(westWall);

    walls = [northWall, southWall, eastWall, westWall];

    // Load GLTF

    const loader = new THREE.GLTFLoader();

    loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', (gltf) => {

        playerGltf = gltf;

        player = gltf.scene.clone();

        player.position.set(0, 0, 0);

        player.scale.set(0.5, 0.5, 0.5);

        player.mixer = new THREE.AnimationMixer(player);

        player.animations = gltf.animations;

        player.velocity = new THREE.Vector3();

        player.traverse((child) => {

            if (child.isMesh) {

                child.material.color.set(team === 'blue' ? 0x0000ff : 0xff0000);

            }

        });

        scene.add(player);

    }, undefined, (error) => console.error('Error loading model:', error));

    // Other players

    players = {};

    // Controls

    if (!isMobile) {

        controls = new THREE.PointerLockControls(camera, document.body);

        gameCanvas.addEventListener('click', () => {

            controls.lock();

        });

        document.addEventListener('mousedown', (e) => {

            if (e.button === 0) shoot();

        });

    } else {

        // Mobile look

        let lastTouchX = 0;

        let lastTouchY = 0;

        gameCanvas.addEventListener('touchstart', (e) => {

            const touch = e.touches[0];

            lastTouchX = touch.clientX;

            lastTouchY = touch.clientY;

        });

        gameCanvas.addEventListener('touchmove', (e) => {

            const touch = e.touches[0];

            const deltaX = touch.clientX - lastTouchX;

            const deltaY = touch.clientY - lastTouchY;

            camera.rotation.y -= deltaX * 0.01;

            camera.rotation.x -= deltaY * 0.01;

            camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));

            lastTouchX = touch.clientX;

            lastTouchY = touch.clientY;

        });

        shootBtn.addEventListener('touchstart', () => {

            shoot();

        });

        jumpBtn.addEventListener('touchstart', () => {

            if (player && player.position.y <= 0.9) {

                player.velocity.y = 0.2;

            }

        });

        // Joystick

        let joystickCenter = {x: 75, y: 75};

        let touchId = null;

        mobileControls.addEventListener('touchstart', (e) => {

            const touch = e.touches[0];

            touchId = touch.identifier;

            joystickCenter.x = touch.clientX - mobileControls.getBoundingClientRect().left;

            joystickCenter.y = touch.clientY - mobileControls.getBoundingClientRect().top;

        });

        mobileControls.addEventListener('touchmove', (e) => {

            const touch = Array.from(e.touches).find(t => t.identifier === touchId);

            if (touch) {

                const rect = mobileControls.getBoundingClientRect();

                const x = touch.clientX - rect.left;

                const y = touch.clientY - rect.top;

                const dx = x - joystickCenter.x;

                const dy = y - joystickCenter.y;

                const dist = Math.sqrt(dx*dx + dy*dy);

                const maxDist = 50;

                const clampedDist = Math.min(dist, maxDist);

                const angle = Math.atan2(dy, dx);

                direction.x = Math.cos(angle) * (clampedDist / maxDist);

                direction.z = Math.sin(angle) * (clampedDist / maxDist);

                joystick.style.transform = `translate(${joystickCenter.x + Math.cos(angle) * clampedDist - 25}px, ${joystickCenter.y + Math.sin(angle) * clampedDist - 25}px)`;

            }

        });

        mobileControls.addEventListener('touchend', (e) => {

            if (!Array.from(e.touches).find(t => t.identifier === touchId)) {

                touchId = null;

                direction.set(0,0,0);

                joystick.style.transform = 'translate(50%, 50%)';

            }

        });

    }

    const moveSpeed = 0.1;

    const jumpSpeed = 0.2;

    const gravity = -0.01;

    const keys = {};

    if (!isMobile) {

        document.addEventListener('keydown', (e) => keys[e.code] = true);

        document.addEventListener('keyup', (e) => keys[e.code] = false);

    }

    // Game loop

    function animate() {

        requestAnimationFrame(animate);

        if (!player) return;

        // Update mixer

        if (player.mixer) {

            player.mixer.update(0.016);

        }

        // Movement

        const moveDirection = new THREE.Vector3();

        if (isMobile) {

            moveDirection.copy(direction).multiplyScalar(moveSpeed);

        } else {

            if (keys['KeyW']) moveDirection.z -= 1;

            if (keys['KeyS']) moveDirection.z += 1;

            if (keys['KeyA']) moveDirection.x -= 1;

            if (keys['KeyD']) moveDirection.x += 1;

            moveDirection.normalize().multiplyScalar(moveSpeed);

        }

        moveDirection.applyEuler(camera.rotation);

        const newPos = player.position.clone().add(moveDirection);

        if (!checkCollision(newPos)) {

            player.position.add(moveDirection);

        }

        // Jumping

        if (!isMobile && keys['Space'] && player.position.y <= 0.9) {

            player.velocity.y = jumpSpeed;

        }

        player.velocity.y += gravity;

        player.position.y += player.velocity.y;

        if (player.position.y < 0.9) {

player.position.y = 0.9;

            player.velocity.y = 0;

        }

        // Camera follow

        camera.position.set(player.position.x, player.position.y + 1.6, player.position.z);

        // Animations

        const speed = moveDirection.length();

        if (player.mixer) {

            if (player.velocity.y > 0) {

                const jumpAction = player.mixer.clipAction('TPose');

                jumpAction.play();

            } else if (speed > 0.05) {

                if (speed > 0.15) {

                    const runAction = player.mixer.clipAction('Run');

                    runAction.play();

                } else {

                    const walkAction = player.mixer.clipAction('Walk');

                    walkAction.play();

                }

            } else {

                const idleAction = player.mixer.clipAction('Idle');

                idleAction.play();

            }

        }

        // Send position to server

        socket.emit('updatePosition', {

            position: player.position,

            rotation: camera.rotation.y

        });

        renderer.render(scene, camera);

    }

    animate();

}

// Check collision with walls
function checkCollision(pos) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(0.5, 1.8, 0.5));
    for (let wall of walls) {
        const wallBox = new THREE.Box3().setFromObject(wall);
        if (wallBox.intersectsBox(playerBox)) return true;
    }
    return false;
}

// Shoot function
function shoot() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(players).concat(walls));
    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object.userId && !walls.includes(hit.object)) {
            let damage = 35;
            const hitY = hit.point.y;
            const objY = hit.object.position.y;
            if (hitY > objY + 1.2) damage = 100;
            else if (hitY < objY + 0.6) damage = 20;
            socket.emit('hit', { targetId: hit.object.userId, damage });
        }
    }
    // Muzzle flash
    const flash = new THREE.PointLight(0xffffff, 10, 10);
    flash.position.copy(camera.position);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 100);
    // Shooting animation
    if (player.mixer) {
        const shootAction = player.mixer.clipAction('TPose');
        if (shootAction) {
            shootAction.reset().play();
        }
    }
}

// Create bullet (if needed)
function createBullet(data) {
    // Not used in instant hit, but kept for compatibility
}
