// BACKROOMS - FPS HORROR GAME
(function() {
    // Canvas
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Game state
    let gameActive = false;
    let gameWin = false;
    let frameRequest = null;
    
    // ─────────────────────────────────────────────────────────────────
    // PLAYER (FPS)
    // ─────────────────────────────────────────────────────────────────
    const player = {
        x: 400,
        z: 400,
        angle: 0,           // yaw (horizontal angle)
        pitch: 0,           // vertical angle
        height: 1.65,       // eye level
        velocityY: 0,
        isGrounded: true,
        hasKey: false,
        health: 100,
        
        // Movement
        moveForward: 0,
        moveRight: 0,
        isRunning: false,
        
        speed: 4.5,
        runSpeed: 7.2,
        jumpPower: 5.5,
        gravity: 18,
        
        // Collision radius
        radius: 0.35
    };
    
    // ─────────────────────────────────────────────────────────────────
    // MONSTER
    // ─────────────────────────────────────────────────────────────────
    const monster = {
        x: 750,
        z: 750,
        angle: 0,
        speed: 3.2,
        chaseSpeed: 5.5,
        agroRange: 220,
        attackRange: 1.2,
        state: 'idle',      // idle, chase, attack
        lastSeenX: null,
        lastSeenZ: null,
        path: [],
        pathTimer: 0
    };
    
    // ─────────────────────────────────────────────────────────────────
    // WORLD OBJECTS
    // ─────────────────────────────────────────────────────────────────
    const key = {
        x: 580,
        z: 520,
        collected: false
    };
    
    const exitDoor = {
        x: 150,
        z: 150,
        width: 1.2,
        height: 2.2,
        unlocked: false
    };
    
    // ─────────────────────────────────────────────────────────────────
    // WALLS (AABB collision)
    // ─────────────────────────────────────────────────────────────────
    const walls = [
        // Border walls
        { x: 0, z: 0, w: 1000, h: 1.2 },
        { x: 0, z: 998, w: 1000, h: 1.2 },
        { x: 0, z: 0, w: 1.2, h: 1000 },
        { x: 998, z: 0, w: 1.2, h: 1000 },
        
        // Labirent duvarları
        { x: 120, z: 120, w: 1, h: 200 },
        { x: 220, z: 200, w: 180, h: 1 },
        { x: 300, z: 120, w: 1, h: 150 },
        { x: 400, z: 250, w: 200, h: 1 },
        { x: 500, z: 120, w: 1, h: 200 },
        { x: 600, z: 350, w: 150, h: 1 },
        { x: 100, z: 400, w: 200, h: 1 },
        { x: 250, z: 450, w: 1, h: 200 },
        { x: 350, z: 550, w: 200, h: 1 },
        { x: 550, z: 500, w: 1, h: 200 },
        { x: 650, z: 600, w: 150, h: 1 },
        { x: 750, z: 100, w: 1, h: 250 },
        { x: 800, z: 300, w: 150, h: 1 },
        { x: 850, z: 400, w: 1, h: 200 },
        { x: 100, z: 650, w: 250, h: 1 },
        { x: 400, z: 700, w: 1, h: 150 },
        { x: 500, z: 750, w: 200, h: 1 },
        { x: 750, z: 700, w: 1, h: 200 },
        { x: 850, z: 750, w: 150, h: 1 },
        { x: 450, z: 400, w: 80, h: 1 },
        { x: 200, z: 280, w: 1, h: 80 },
        { x: 700, z: 200, w: 80, h: 1 },
        { x: 800, z: 550, w: 1, h: 100 },
        { x: 300, z: 700, w: 80, h: 1 },
        { x: 900, z: 200, w: 1, h: 120 },
        { x: 950, z: 280, w: 50, h: 1 },
        { x: 150, z: 850, w: 1, h: 100 },
        { x: 250, z: 880, w: 120, h: 1 },
        { x: 600, z: 850, w: 1, h: 120 },
        { x: 700, z: 880, w: 150, h: 1 },
        { x: 350, z: 320, w: 100, h: 1 },
        { x: 550, z: 650, w: 1, h: 80 },
        { x: 820, z: 150, w: 80, h: 1 },
        { x: 880, z: 650, w: 1, h: 100 },
    ];
    
    // ─────────────────────────────────────────────────────────────────
    // INPUT SYSTEM
    // ─────────────────────────────────────────────────────────────────
    const keys = {
        KeyW: false, KeyS: false, KeyA: false, KeyD: false,
        Space: false, ShiftLeft: false, KeyE: false
    };
    
    let mouseLocked = false;
    let mouseX = 0, mouseY = 0;
    
    // Mobile controls
    let joystickActive = false;
    let joystickDir = { x: 0, y: 0 };
    let joystickCenter = { x: 0, y: 0 };
    let mobileJump = false;
    let mobileRun = false;
    
    // ─────────────────────────────────────────────────────────────────
    // AUDIO
    // ─────────────────────────────────────────────────────────────────
    let audioContext = null;
    let monsterAudio = null;
    let footstepAudio = null;
    let footstepTimer = 0;
    let lastFootstepTime = 0;
    let monsterAudioLoaded = false;
    let footstepAudioLoaded = false;
    
    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Monster sound
            fetch('canavar.mp3')
                .then(res => res.arrayBuffer())
                .then(buf => audioContext.decodeAudioData(buf))
                .then(decoded => {
                    monsterAudio = decoded;
                    monsterAudioLoaded = true;
                })
                .catch(e => console.log('Monster ses yüklenemedi:', e));
            
            // Footstep sound
            fetch('ayaq.mp3')
                .then(res => res.arrayBuffer())
                .then(buf => audioContext.decodeAudioData(buf))
                .then(decoded => {
                    footstepAudio = decoded;
                    footstepAudioLoaded = true;
                })
                .catch(e => console.log('Ayak sesi yüklenemedi:', e));
                
        } catch(e) {
            console.log('Audio desteklenmiyor');
        }
    }
    
    function playSound(buffer, volume = 0.5, pitch = 1) {
        if (!audioContext || !buffer) return;
        try {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = pitch;
            const gain = audioContext.createGain();
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(audioContext.destination);
            source.start();
        } catch(e) {}
    }
    
    function playFootstep() {
        if (!footstepAudioLoaded || !gameActive) return;
        const now = Date.now();
        const interval = player.isRunning ? 350 : 500;
        if (now - lastFootstepTime > interval && (player.moveForward !== 0 || player.moveRight !== 0)) {
            lastFootstepTime = now;
            const pitch = 0.8 + Math.random() * 0.4;
            playSound(footstepAudio, 0.3, pitch);
        }
    }
    
    function updateMonsterSound() {
        if (!monsterAudioLoaded || !gameActive) return;
        const dx = player.x - monster.x;
        const dz = player.z - monster.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist < 150 && monster.state === 'chase') {
            const volume = Math.min(0.7, 0.3 + (1 - dist / 150) * 0.4);
            // Continuous monster sound logic would go here
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // COLLISION & MOVEMENT
    // ─────────────────────────────────────────────────────────────────
    function checkCollision(x, z, radius) {
        for (const wall of walls) {
            const halfW = wall.w / 2;
            const halfH = wall.h / 2;
            const closestX = Math.max(wall.x - halfW, Math.min(x, wall.x + halfW));
            const closestZ = Math.max(wall.z - halfH, Math.min(z, wall.z + halfH));
            const dx = x - closestX;
            const dz = z - closestZ;
            if (dx * dx + dz * dz < radius * radius) {
                return true;
            }
        }
        return false;
    }
    
    function updateMovement(deltaTime) {
        if (!gameActive) return;
        
        // Get input
        let moveF = 0, moveR = 0;
        
        // Keyboard
        if (keys.KeyW) moveF += 1;
        if (keys.KeyS) moveF -= 1;
        if (keys.KeyD) moveR += 1;
        if (keys.KeyA) moveR -= 1;
        
        // Mobile joystick
        if (joystickActive && (Math.abs(joystickDir.x) > 0.1 || Math.abs(joystickDir.y) > 0.1)) {
            moveF = joystickDir.y;
            moveR = joystickDir.x;
        }
        
        // Running
        player.isRunning = (keys.ShiftLeft || mobileRun) && (moveF !== 0 || moveR !== 0);
        
        // Normalize diagonal
        if (moveF !== 0 || moveR !== 0) {
            const len = Math.hypot(moveF, moveR);
            moveF /= len;
            moveR /= len;
        }
        
        // Calculate movement
        const speed = (player.isRunning ? player.runSpeed : player.speed) * deltaTime;
        const moveAngle = player.angle;
        const cosA = Math.cos(moveAngle);
        const sinA = Math.sin(moveAngle);
        
        let moveX = (moveF * cosA + moveR * sinA) * speed;
        let moveZ = (moveF * -sinA + moveR * cosA) * speed;
        
        // Apply movement with collision
        let newX = player.x + moveX;
        let newZ = player.z + moveZ;
        
        if (!checkCollision(newX, player.z, player.radius)) {
            player.x = newX;
        } else {
            // Slide along wall
            if (!checkCollision(player.x + moveX * 0.5, player.z, player.radius)) {
                player.x += moveX * 0.5;
            }
        }
        
        if (!checkCollision(player.x, newZ, player.radius)) {
            player.z = newZ;
        } else {
            if (!checkCollision(player.x, player.z + moveZ * 0.5, player.radius)) {
                player.z += moveZ * 0.5;
            }
        }
        
        // Keep in bounds
        player.x = Math.max(2, Math.min(player.x, 998));
        player.z = Math.max(2, Math.min(player.z, 998));
        
        // Footstep sound
        if ((moveF !== 0 || moveR !== 0) && player.isGrounded) {
            playFootstep();
        }
        
        // Gravity and jumping
        player.velocityY -= player.gravity * deltaTime;
        player.height += player.velocityY * deltaTime;
        
        if (player.height <= 1.65) {
            player.height = 1.65;
            player.velocityY = 0;
            player.isGrounded = true;
            
            if (keys.Space || mobileJump) {
                player.velocityY = player.jumpPower;
                player.isGrounded = false;
                mobileJump = false;
            }
        } else {
            player.isGrounded = false;
        }
        
        // Reset jump flag
        if (keys.Space) keys.Space = false;
    }
    
    // ─────────────────────────────────────────────────────────────────
    // MONSTER AI
    // ─────────────────────────────────────────────────────────────────
    function updateMonster(deltaTime) {
        if (!gameActive) return;
        
        const dx = player.x - monster.x;
        const dz = player.z - monster.z;
        const distToPlayer = Math.hypot(dx, dz);
        
        // State machine
        if (distToPlayer < monster.agroRange) {
            monster.state = 'chase';
            monster.lastSeenX = player.x;
            monster.lastSeenZ = player.z;
        } else if (monster.state === 'chase' && monster.lastSeenX) {
            const distToLastSeen = Math.hypot(monster.lastSeenX - monster.x, monster.lastSeenZ - monster.z);
            if (distToLastSeen < 1.5) {
                monster.state = 'idle';
                monster.lastSeenX = null;
            }
        }
        
        // Movement
        let targetX = monster.x, targetZ = monster.z;
        
        if (monster.state === 'chase') {
            targetX = monster.lastSeenX !== null ? monster.lastSeenX : player.x;
            targetZ = monster.lastSeenZ !== null ? monster.lastSeenZ : player.z;
        } else {
            // Patrol - wander randomly
            if (!monster.path.length) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 70;
                targetX = monster.x + Math.cos(angle) * dist;
                targetZ = monster.z + Math.sin(angle) * dist;
                targetX = Math.max(10, Math.min(targetX, 990));
                targetZ = Math.max(10, Math.min(targetZ, 990));
            } else {
                targetX = monster.path[0].x;
                targetZ = monster.path[0].z;
            }
        }
        
        // Move monster
        const dirX = targetX - monster.x;
        const dirZ = targetZ - monster.z;
        const dist = Math.hypot(dirX, dirZ);
        
        if (dist > 0.2) {
            const speed = monster.state === 'chase' ? monster.chaseSpeed : monster.speed;
            const move = Math.min(speed * deltaTime, dist - 0.1);
            monster.x += (dirX / dist) * move;
            monster.z += (dirZ / dist) * move;
            monster.angle = Math.atan2(dirX, dirZ);
        } else if (monster.path.length) {
            monster.path.shift();
        }
        
        // Monster collision with walls
        if (checkCollision(monster.x, monster.z, 0.4)) {
            monster.x -= (dirX / dist) * 0.2;
            monster.z -= (dirZ / dist) * 0.2;
        }
        
        // Check catch
        if (distToPlayer < monster.attackRange) {
            gameActive = false;
            showScreen('caught');
            if (audioContext) audioContext.suspend();
            return;
        }
        
        // Update danger overlay
        const dangerOverlay = document.getElementById('danger-overlay');
        if (distToPlayer < 120) {
            const intensity = Math.min(0.8, 0.3 + (1 - distToPlayer / 120) * 0.5);
            dangerOverlay.style.opacity = intensity;
            dangerOverlay.classList.add('active');
        } else {
            dangerOverlay.style.opacity = 0;
            dangerOverlay.classList.remove('active');
        }
        
        // Update distance HUD
        const distEl = document.getElementById('distance');
        if (distEl) {
            const distM = Math.floor(distToPlayer);
            distEl.innerHTML = distM < 50 ? `⚠️ ${distM}m` : `📏 ${distM}m`;
            if (distToPlayer < 50) distEl.style.color = '#e74c3c';
            else distEl.style.color = '#d4a017';
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // INTERACTION
    // ─────────────────────────────────────────────────────────────────
    function interact() {
        if (!gameActive) return;
        
        // Check key pickup
        if (!key.collected) {
            const dx = player.x - key.x;
            const dz = player.z - key.z;
            if (Math.hypot(dx, dz) < 1.2) {
                key.collected = true;
                player.hasKey = true;
                const keyStatus = document.getElementById('key-status');
                keyStatus.innerHTML = '🔑 ANAHTAR ALINDI ✓';
                keyStatus.classList.add('has-key');
                playSound(monsterAudio, 0.4);
            }
        }
        
        // Check exit
        if (player.hasKey && !exitDoor.unlocked) {
            const dx = player.x - exitDoor.x;
            const dz = player.z - exitDoor.z;
            if (Math.hypot(dx, dz) < 1.5) {
                gameActive = false;
                gameWin = true;
                showScreen('win');
                if (audioContext) audioContext.suspend();
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // RENDERING (3D RAYCASTING STYLE)
    // ─────────────────────────────────────────────────────────────────
    const resolution = { width: 0, height: 0 };
    const depthBuffer = [];
    
    function updateResolution() {
        resolution.width = canvas.width;
        resolution.height = canvas.height;
    }
    
    function draw() {
        if (!ctx) return;
        
        updateResolution();
        
        const screenW = resolution.width;
        const screenH = resolution.height;
        
        // Clear
        ctx.fillStyle = '#0a0800';
        ctx.fillRect(0, 0, screenW, screenH);
        
        // Simple raycasting for walls
        const fov = Math.PI / 2.8;
        const halfFov = fov / 2;
        const numRays = Math.min(120, Math.floor(screenW / 4));
        const rayStep = fov / numRays;
        
        for (let i = 0; i <= numRays; i++) {
            const rayAngle = player.angle - halfFov + i * rayStep;
            let rayX = player.x;
            let rayZ = player.z;
            let hit = false;
            let hitDist = 500;
            let hitWall = null;
            
            const step = 0.05;
            const maxSteps = 800;
            
            for (let s = 0; s < maxSteps; s++) {
                rayX += Math.sin(rayAngle) * step;
                rayZ += Math.cos(rayAngle) * step;
                
                let wallHit = false;
                for (const wall of walls) {
                    const halfW = wall.w / 2;
                    const halfH = wall.h / 2;
                    if (rayX >= wall.x - halfW && rayX <= wall.x + halfW &&
                        rayZ >= wall.z - halfH && rayZ <= wall.z + halfH) {
                        wallHit = true;
                        hitWall = wall;
                        break;
                    }
                }
                
                if (wallHit) {
                    const dx = rayX - player.x;
                    const dz = rayZ - player.z;
                    hitDist = Math.hypot(dx, dz);
                    hit = true;
                    break;
                }
                
                // Border check
                if (rayX < 1 || rayX > 999 || rayZ < 1 || rayZ > 999) {
                    hitDist = 500;
                    hit = true;
                    break;
                }
            }
            
            if (hit) {
                // Correct fish-eye
                const correctedDist = hitDist * Math.cos(rayAngle - player.angle);
                const wallHeight = Math.min(screenH, (3.5 / correctedDist) * screenH * 0.8);
                const wallY = (screenH - wallHeight) / 2;
                
                // Shading based on distance
                const shade = Math.min(1, 0.3 + 0.7 / (1 + correctedDist / 20));
                const r = Math.floor(40 * shade);
                const g = Math.floor(28 * shade);
                const b = Math.floor(12 * shade);
                
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                const xPos = (i / numRays) * screenW;
                const width = screenW / numRays;
                ctx.fillRect(xPos, wallY, width + 1, wallHeight);
                
                // Wall highlight
                if (hitDist < 30) {
                    ctx.fillStyle = `rgba(212,160,23,${0.1 * (1 - hitDist / 30)})`;
                    ctx.fillRect(xPos, wallY, width + 1, wallHeight);
                }
            } else {
                // Ceiling and floor
                const xPos = (i / numRays) * screenW;
                const width = screenW / numRays;
                ctx.fillStyle = '#1a1200';
                ctx.fillRect(xPos, screenH / 2, width + 1, screenH / 2);
                ctx.fillStyle = '#0a0800';
                ctx.fillRect(xPos, 0, width + 1, screenH / 2);
            }
        }
        
        // Draw key (3D position indicator)
        if (!key.collected) {
            const dx = key.x - player.x;
            const dz = key.z - player.z;
            const angleToKey = Math.atan2(dx, dz);
            let angleDiff = angleToKey - player.angle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            const distToKey = Math.hypot(dx, dz);
            if (distToKey < 80 && Math.abs(angleDiff) < Math.PI / 2.5) {
                const screenX = screenW / 2 + (angleDiff / (Math.PI / 2.5)) * (screenW / 3);
                if (screenX > 0 && screenX < screenW) {
                    ctx.font = `${Math.max(18, Math.min(36, Math.floor(80 / distToKey)))}px monospace`;
                    ctx.fillStyle = '#d4a017';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#d4a017';
                    ctx.fillText('🔑', screenX - 15, screenH / 2 - 40);
                    ctx.shadowBlur = 0;
                }
            }
        }
        
        // Draw exit indicator
        if (player.hasKey && !exitDoor.unlocked) {
            const dx = exitDoor.x - player.x;
            const dz = exitDoor.z - player.z;
            const angleToExit = Math.atan2(dx, dz);
            let angleDiff = angleToExit - player.angle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            const distToExit = Math.hypot(dx, dz);
            if (distToExit < 80 && Math.abs(angleDiff) < Math.PI / 2.5) {
                const screenX = screenW / 2 + (angleDiff / (Math.PI / 2.5)) * (screenW / 3);
                if (screenX > 0 && screenX < screenW) {
                    ctx.font = `${Math.max(18, Math.min(36, Math.floor(80 / distToExit)))}px monospace`;
                    ctx.fillStyle = '#2ecc71';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#2ecc71';
                    ctx.fillText('🚪', screenX - 15, screenH / 2 - 40);
                    ctx.shadowBlur = 0;
                }
            }
        }
        
        // Crosshair
        ctx.beginPath();
        ctx.strokeStyle = '#d4a017';
        ctx.lineWidth = 2;
        ctx.moveTo(screenW / 2 - 10, screenH / 2);
        ctx.lineTo(screenW / 2 - 4, screenH / 2);
        ctx.moveTo(screenW / 2 + 4, screenH / 2);
        ctx.lineTo(screenW / 2 + 10, screenH / 2);
        ctx.moveTo(screenW / 2, screenH / 2 - 10);
        ctx.lineTo(screenW / 2, screenH / 2 - 4);
        ctx.moveTo(screenW / 2, screenH / 2 + 4);
        ctx.lineTo(screenW / 2, screenH / 2 + 10);
        ctx.stroke();
        
        requestAnimationFrame(draw);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // MOUSE & CONTROLS
    // ─────────────────────────────────────────────────────────────────
    function setupControls() {
        // Mouse lock
        canvas.addEventListener('click', () => {
            if (gameActive && !mouseLocked) {
                canvas.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            mouseLocked = document.pointerLockElement === canvas;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (mouseLocked && gameActive) {
                player.angle += e.movementX * 0.003;
                player.pitch += e.movementY * 0.002;
                player.pitch = Math.max(-0.8, Math.min(0.8, player.pitch));
            }
        });
        
        // Keyboard
        window.addEventListener('keydown', (e) => {
            const code = e.code;
            if (keys.hasOwnProperty(code)) {
                keys[code] = true;
                e.preventDefault();
            }
            if (code === 'KeyE') {
                interact();
                e.preventDefault();
            }
            if (code === 'Space') {
                e.preventDefault();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            const code = e.code;
            if (keys.hasOwnProperty(code)) keys[code] = false;
        });
        
        // Mobile joystick
        const joystickArea = document.getElementById('joystick-area');
        const joystickHandle = document.getElementById('joystick-handle');
        
        if (joystickArea) {
            joystickArea.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const rect = joystickArea.getBoundingClientRect();
                joystickCenter.x = rect.left + rect.width / 2;
                joystickCenter.y = rect.top + rect.height / 2;
                joystickActive = true;
            });
            
            joystickArea.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!joystickActive) return;
                const touch = e.touches[0];
                const dx = touch.clientX - joystickCenter.x;
                const dy = touch.clientY - joystickCenter.y;
                const distance = Math.min(Math.hypot(dx, dy), 50);
                const angle = Math.atan2(dy, dx);
                joystickDir.x = Math.cos(angle) * (distance / 50);
                joystickDir.y = Math.sin(angle) * (distance / 50);
                joystickHandle.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
            });
            
            joystickArea.addEventListener('touchend', () => {
                joystickActive = false;
                joystickDir = { x: 0, y: 0 };
                joystickHandle.style.transform = 'translate(0px, 0px)';
            });
        }
        
        // Mobile jump
        const jumpBtn = document.getElementById('jump-btn');
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileJump = true;
            });
        }
        
        // Mobile run
        const runBtn = document.getElementById('run-btn');
        if (runBtn) {
            runBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileRun = true;
            });
            runBtn.addEventListener('touchend', () => {
                mobileRun = false;
            });
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // GAME LOOP
    // ─────────────────────────────────────────────────────────────────
    let lastTime = 0;
    
    function gameLoop(currentTime) {
        if (!frameRequest) return;
        
        let deltaTime = Math.min(0.033, (currentTime - lastTime) / 1000);
        if (deltaTime <= 0) deltaTime = 0.016;
        lastTime = currentTime;
        
        if (gameActive) {
            updateMovement(deltaTime);
            updateMonster(deltaTime);
            updateMonsterSound();
        }
        
        frameRequest = requestAnimationFrame(gameLoop);
    }
    
    function startGameLoop() {
        lastTime = performance.now();
        frameRequest = requestAnimationFrame(gameLoop);
        draw();
    }
    
    // ─────────────────────────────────────────────────────────────────
    // SCREEN MANAGEMENT
    // ─────────────────────────────────────────────────────────────────
    function showScreen(screenName) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('caught-screen').classList.add('hidden');
        document.getElementById('win-screen').classList.add('hidden');
        
        if (screenName === 'menu') document.getElementById('menu-screen').classList.remove('hidden');
        else if (screenName === 'loading') document.getElementById('loading-screen').classList.remove('hidden');
        else if (screenName === 'caught') document.getElementById('caught-screen').classList.remove('hidden');
        else if (screenName === 'win') document.getElementById('win-screen').classList.remove('hidden');
    }
    
    function startGame() {
        // Reset game state
        gameActive = true;
        gameWin = false;
        
        player.x = 400;
        player.z = 400;
        player.angle = 0;
        player.pitch = 0;
        player.height = 1.65;
        player.velocityY = 0;
        player.hasKey = false;
        player.isRunning = false;
        
        monster.x = 750;
        monster.z = 750;
        monster.state = 'idle';
        monster.lastSeenX = null;
        monster.lastSeenZ = null;
        
        key.collected = false;
        exitDoor.unlocked = false;
        
        // Reset UI
        const keyStatus = document.getElementById('key-status');
        keyStatus.innerHTML = '🔑 ANAHTAR YOK';
        keyStatus.classList.remove('has-key');
        
        document.getElementById('danger-overlay').style.opacity = 0;
        document.getElementById('danger-overlay').classList.remove('active');
        
        // Resume audio
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        showScreen('loading');
        
        setTimeout(() => {
            showScreen('menu');
        }, 500);
    }
    
    function beginGame() {
        gameActive = true;
        gameWin = false;
        
        player.x = 400;
        player.z = 400;
        player.angle = 0;
        player.pitch = 0;
        player.hasKey = false;
        
        monster.x = 750;
        monster.z = 750;
        monster.state = 'idle';
        
        key.collected = false;
        
        const keyStatus = document.getElementById('key-status');
        keyStatus.innerHTML = '🔑 ANAHTAR YOK';
        keyStatus.classList.remove('has-key');
        
        document.getElementById('danger-overlay').style.opacity = 0;
        
        showScreen('loading');
        
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('menu-screen').classList.add('hidden');
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }, 300);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────
    function init() {
        updateResolution();
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            updateResolution();
        });
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        setupControls();
        initAudio();
        startGameLoop();
        
        // Loading animation
        let progress = 0;
        const loadInterval = setInterval(() => {
            progress += Math.random() * 15 + 5;
            const loadProgress = document.getElementById('loadProgress');
            const loadText = document.getElementById('loadText');
            if (loadProgress) loadProgress.style.width = Math.min(progress, 100) + '%';
            if (loadText) {
                const tips = ['LABİRENT HAZIRLANIYOR...', 'CANAVAR BEKLİYOR...', 'SESSİZ OL...', 'KAÇMAYA HAZIRLAN...'];
                loadText.innerHTML = tips[Math.floor(Math.random() * tips.length)];
            }
            if (progress >= 100) {
                clearInterval(loadInterval);
                setTimeout(() => {
                    showScreen('menu');
                }, 500);
            }
        }, 80);
        
        // Button events
        document.getElementById('playBtn')?.addEventListener('click', () => beginGame());
        document.getElementById('retryBtn')?.addEventListener('click', () => beginGame());
        document.getElementById('menuBtn')?.addEventListener('click', () => showScreen('menu'));
        document.getElementById('winRetryBtn')?.addEventListener('click', () => beginGame());
        document.getElementById('winMenuBtn')?.addEventListener('click', () => showScreen('menu'));
    }
    
    init();
})();
