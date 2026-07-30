let scene, camera, renderer, gameState, currentPlayer, aiBots = [];
let gameRunning = false;
let selectedColor = 0xFF0000;
let lastFrameTime = Date.now();

const settings = { mouseSens: 1.5, volume: 100 };
const keys = {};

function initRenderer() {
    const canvas = document.getElementById('canvas');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 80, 120);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowShadowMap;

    const ambientLight = new THREE.AmbientLight(0xFFFFCC, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xFFFFCC, 0.6);
    directionalLight.position.set(50, 30, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
}

function createAmongUsModel(player) {
    const group = new THREE.Group();

    // Body
    const bodyGeom = new THREE.CapsuleGeometry(0.2, 0.5, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: player.color,
        roughness: 0.4,
        metalness: 0.2
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.position.y = 0.25;
    group.add(body);

    // Head
    const headGeom = new THREE.SphereGeometry(0.22, 32, 32);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.castShadow = true;
    head.position.y = 0.7;
    group.add(head);

    // Visor (Among Us characteristic)
    const visorGeom = new THREE.SphereGeometry(0.18, 32, 16);
    const visorMat = new THREE.MeshStandardMaterial({
        color: 0x00AA00,
        emissive: 0x00FF00,
        emissiveIntensity: 0.3,
        roughness: 0.1,
        metalness: 0.8
    });
    const visor = new THREE.Mesh(visorGeom, visorMat);
    visor.position.set(0, 0.75, 0.15);
    visor.scale.set(0.6, 0.4, 0.3);
    visor.castShadow = true;
    group.add(visor);

    // Backpack
    const backpackGeom = new THREE.BoxGeometry(0.15, 0.35, 0.2);
    const backpackMat = new THREE.MeshStandardMaterial({
        color: player.color,
        roughness: 0.5
    });
    const backpack = new THREE.Mesh(backpackGeom, backpackMat);
    backpack.position.set(0, 0.3, -0.2);
    backpack.castShadow = true;
    group.add(backpack);

    // Death indicator
    if (player.isDead) {
        group.rotation.z = Math.PI / 2;
    }

    group.position.copy(player.position);
    player.model = group;
    return group;
}

function setupColorSelector() {
    const selector = document.getElementById('colorSelector');
    selector.innerHTML = '';
    COLORS.forEach((color, idx) => {
        const btn = document.createElement('button');
        btn.className = 'color-btn';
        if (idx === 0) btn.classList.add('selected');
        btn.style.backgroundColor = '#' + color.toString(16).padStart(6, '0');
        btn.onclick = () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = color;
        };
        selector.appendChild(btn);
    });
}

function initGame() {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    const impostorCount = parseInt(document.getElementById('killerCount').value);
    const duration = parseInt(document.getElementById('gameDuration').value);

    gameState = new GameState(playerCount, impostorCount, duration);
    gameState.initialize();

    // Set first player color to selected
    gameState.players[0].color = selectedColor;

    gameState.players.forEach(player => {
        const model = createAmongUsModel(player);
        scene.add(model);
    });

    scene.add(gameState.level.mesh);

    currentPlayer = gameState.players[0];

    // Create AI bots for all other players
    gameState.players.forEach(player => {
        if (player.id !== currentPlayer.id && !player.isImpostor) {
            aiBots.push(new AIBot(player, gameState));
        }
    });

    document.getElementById('lobby').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    
    if (currentPlayer.isImpostor) {
        document.getElementById('killerPanel').style.display = 'block';
        document.getElementById('tasksUI').style.display = 'none';
    } else {
        document.getElementById('tasksUI').style.display = 'block';
    }

    gameRunning = true;

    const canvas = document.getElementById('canvas');
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();
    });
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.getElementById('canvas') && gameRunning) {
        const deltaX = event.movementX * 0.001 * settings.mouseSens;
        const deltaY = event.movementY * 0.001 * settings.mouseSens;

        currentPlayer.rotation.y -= deltaX;
        currentPlayer.rotation.x -= deltaY;
        currentPlayer.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, currentPlayer.rotation.x));

        camera.rotation.order = 'YXZ';
        camera.rotation.y = currentPlayer.rotation.y;
        camera.rotation.x = currentPlayer.rotation.x;
    }
}

function onKeyDown(event) {
    keys[event.key.toLowerCase()] = true;
    if (!gameRunning) return;

    const key = event.key.toLowerCase();
    if (key === 'w') currentPlayer.moveForward = true;
    if (key === 'a') currentPlayer.moveLeft = true;
    if (key === 's') currentPlayer.moveBackward = true;
    if (key === 'd') currentPlayer.moveRight = true;
    if (key === ' ') {
        event.preventDefault();
        currentPlayer.jump();
    }

    if (key === 'e' && currentPlayer.isImpostor) {
        const nearby = currentPlayer.nearbyPlayers.filter(p => !p.isImpostor);
        if (nearby.length > 0 && currentPlayer.canKill()) {
            if (currentPlayer.kill()) {
                nearby[0].die();
            }
        }
    }

    if (key === 'r' && !currentPlayer.isImpostor) {
        const deadBodies = gameState.players.filter(p =>
            p.isDead &&
            currentPlayer.position.distanceTo(p.position) < 3
        );
        if (deadBodies.length > 0 && Date.now() - currentPlayer.lastReportTime > 5000) {
            gameState.voting = true;
            gameState.meetingTimer = 30000;
            currentPlayer.lastReportTime = Date.now();
        }
    }
}

function onKeyUp(event) {
    keys[event.key.toLowerCase()] = false;
    if (!gameRunning) return;

    const key = event.key.toLowerCase();
    if (key === 'w') currentPlayer.moveForward = false;
    if (key === 'a') currentPlayer.moveLeft = false;
    if (key === 's') currentPlayer.moveBackward = false;
    if (key === 'd') currentPlayer.moveRight = false;
}

function updateHUD() {
    const timeMin = Math.floor(gameState.gameTime / 60000);
    const timeSec = Math.floor((gameState.gameTime % 60000) / 1000);

    document.getElementById('timerDisplay').textContent = `Zaman: ${timeMin}:${timeSec.toString().padStart(2, '0')}`;
    document.getElementById('coordsDisplay').textContent = `Pos: (${Math.floor(currentPlayer.position.x)}, ${Math.floor(currentPlayer.position.y)}, ${Math.floor(currentPlayer.position.z)})`;

    const roleText = currentPlayer.isImpostor ? 'İMPOSTOR' : 'CREW (GÖREV SAHIBI)';
    document.getElementById('roleDisplay').textContent = `Rol: ${roleText}`;

    // Tasks UI
    if (!currentPlayer.isImpostor) {
        let tasksHTML = '';
        currentPlayer.tasks.forEach((task, i) => {
            const completed = task.completed ? 'completed' : '';
            const progress = currentPlayer.isDoingTask && !task.completed ? '...' : (task.completed ? '✓' : '○');
            tasksHTML += `<div class="task-item ${completed}">${i + 1}. ${progress} ${task.name}</div>`;
        });
        document.getElementById('tasksList').innerHTML = tasksHTML;
    }

    // Kill cooldown
    if (currentPlayer.isImpostor) {
        const cooldown = Math.max(0, currentPlayer.killCooldown - (Date.now() - currentPlayer.lastKillTime));
        const nearby = currentPlayer.nearbyPlayers.filter(p => !p.isImpostor).length;
        
        if (nearby > 0) {
            document.getElementById('killBtn').disabled = false;
            document.getElementById('killBtn').textContent = `ÖLDÜR (E) - ${nearby} HEDEF`;
        } else {
            document.getElementById('killBtn').disabled = true;
            document.getElementById('killBtn').textContent = `ÖLDÜR (E) - Yakında değil`;
        }

        if (cooldown > 0) {
            document.getElementById('killCooldown').textContent = `Bekleme: ${(cooldown / 1000).toFixed(1)}s`;
        } else {
            document.getElementById('killCooldown').textContent = 'Hazır!';
        }
    }

    // Dead body detection
    const deadBodies = gameState.players.filter(p =>
        p.isDead && currentPlayer.position.distanceTo(p.position) < 3
    );

    if (deadBodies.length > 0 && !currentPlayer.isImpostor) {
        document.getElementById('reportPanel').style.display = 'block';
    } else {
        document.getElementById('reportPanel').style.display = 'none';
    }
}

function updateVotePanel() {
    if (gameState.voting) {
        document.getElementById('votePanel').style.display = 'block';
        const timeLeft = Math.ceil(gameState.meetingTimer / 1000);
        document.getElementById('voteTimer').textContent = timeLeft;

        let voteHTML = '';
        gameState.players.forEach(player => {
            if (!player.isDead) {
                const colorHex = player.color.toString(16).padStart(6, '0');
                voteHTML += `<div class="vote-player">
                    <div class="vote-player-color" style="background: #${colorHex};"></div>
                    <div>${player.isImpostor ? 'İMPOSTOR' : 'CREW'} #${player.id}</div>
                </div>`;
            }
        });
        document.getElementById('voteList').innerHTML = voteHTML;
    } else {
        document.getElementById('votePanel').style.display = 'none';
    }
}

function gameLoop(deltaTime) {
    if (!gameRunning) return;

    gameState.update(deltaTime);
    currentPlayer.update(deltaTime, gameState.level);

    aiBots.forEach(bot => bot.update(deltaTime));

    camera.position.copy(currentPlayer.position);
    camera.position.y += 0.6;

    updateHUD();
    updateVotePanel();

    const winner = gameState.checkWinCondition();
    if (winner) {
        endGame(winner);
    }

    renderer.render(scene, camera);
}

function endGame(winner) {
    gameRunning = false;
    const msg = winner === 'impostors' ? 'İMPOSTORLAR KAZANDI!' : 'CREW KAZANDI!';
    setTimeout(() => {
        alert(msg);
        location.reload();
    }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
    setupColorSelector();

    document.getElementById('startBtn').addEventListener('click', () => {
        initGame();
    });

    document.getElementById('playerCount').addEventListener('input', (e) => {
        document.getElementById('playerCountValue').textContent = e.target.value;
    });

    document.getElementById('killerCount').addEventListener('input', (e) => {
        const max = Math.floor(document.getElementById('playerCount').value / 2);
        e.target.value = Math.min(e.target.value, max);
        document.getElementById('killerCountValue').textContent = e.target.value;
    });

    document.getElementById('gameDuration').addEventListener('input', (e) => {
        document.getElementById('gameDurationValue').textContent = e.target.value;
    });

    document.getElementById('killBtn').addEventListener('click', () => {
        if (currentPlayer.isImpostor && currentPlayer.canKill()) {
            const nearby = currentPlayer.nearbyPlayers.filter(p => !p.isImpostor);
            if (nearby.length > 0 && currentPlayer.kill()) {
                nearby[0].die();
            }
        }
    });

    document.getElementById('reportBtn').addEventListener('click', () => {
        const deadBodies = gameState.players.filter(p =>
            p.isDead && currentPlayer.position.distanceTo(p.position) < 3
        );
        if (deadBodies.length > 0 && Date.now() - currentPlayer.lastReportTime > 5000) {
            gameState.voting = true;
            gameState.meetingTimer = 30000;
            currentPlayer.lastReportTime = Date.now();
        }
    });
});

document.addEventListener('mousemove', onMouseMove);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

window.addEventListener('load', () => {
    initRenderer();
    let lastTime = Date.now();
    
    function animate() {
        const now = Date.now();
        const deltaTime = Math.min((now - lastTime) / 1000, 0.016);
        lastTime = now;
        gameLoop(deltaTime);
        requestAnimationFrame(animate);
    }
    animate();
});
