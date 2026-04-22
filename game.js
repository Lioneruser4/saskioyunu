// BACKROOMS - PROFESSIONAL FPS HORROR GAME
(function() {
    // Canvas
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Game state
    let gameActive = false;
    let frameRequest = null;
    let lastTimestamp = 0;
    
    // Stats
    let playCount = localStorage.getItem('backrooms_plays') || 0;
    let escapeCount = localStorage.getItem('backrooms_escapes') || 0;
    let deathCount = localStorage.getItem('backrooms_deaths') || 0;
    
    // ─────────────────────────────────────────────────────────────────
    // PLAYER (FPS)
    // ─────────────────────────────────────────────────────────────────
    const player = {
        x: 400,
        z: 400,
        angle: 0,
        pitch: 0,
        height: 1.65,
        velocityY: 0,
        isGrounded: true,
        hasKey: false,
        
        moveForward: 0,
        moveRight: 0,
        isRunning: false,
        
        speed: 4.2,
        runSpeed: 6.8,
        jumpPower: 5.8,
        gravity: 18,
        
        radius: 0.32
    };
    
    // ─────────────────────────────────────────────────────────────────
    // MONSTER
    // ─────────────────────────────────────────────────────────────────
    const monster = {
        x: 750,
        z: 750,
        angle: 0,
        speed: 3.0,
        chaseSpeed: 5.2,
        agroRange: 200,
        attackRange: 1.0,
        state: 'idle',
        lastSeenX: null,
        lastSeenZ: null,
        lastSeenTime: 0,
        step: 0
    };
    
    // ─────────────────────────────────────────────────────────────────
    // WORLD OBJECTS
    // ─────────────────────────────────────────────────────────────────
    const key = {
        x: 520,
        z: 350,
        collected: false
    };
    
    const exitDoor = {
        x: 180,
        z: 180,
        width: 1.2,
        height: 2.2
    };
    
    // ─────────────────────────────────────────────────────────────────
    // WALLS - GERÇEKÇİ LABİRENT DUVARLARI
    // ─────────────────────────────────────────────────────────────────
    const walls = [
        // Dış çerçeve
        { x: 0, z: 0, w: 1000, h: 1.2 },
        { x: 0, z: 998, w: 1000, h: 1.2 },
        { x: 0, z: 0, w: 1.2, h: 1000 },
        { x: 998, z: 0, w: 1.2, h: 1000 },
        
        // Level 0 - Gerçekçi labirent duvarları
        { x: 80, z: 80, w: 1.2, h: 180 },
        { x: 180, z: 120, w: 160, h: 1.2 },
        { x: 280, z: 80, w: 1.2, h: 140 },
        { x: 350, z: 180, w: 180, h: 1.2 },
        { x: 450, z: 80, w: 1.2, h: 200 },
        { x: 550, z: 220, w: 140, h: 1.2 },
        { x: 80, z: 320, w: 180, h: 1.2 },
        { x: 200, z: 380, w: 1.2, h: 180 },
        { x: 300, z: 480, w: 160, h: 1.2 },
        { x: 420, z: 380, w: 1.2, h: 200 },
        { x: 520, z: 520, w: 140, h: 1.2 },
        { x: 600, z: 380, w: 1.2, h: 200 },
        { x: 680, z: 520, w: 160, h: 1.2 },
        { x: 750, z: 80, w: 1.2, h: 220 },
        { x: 820, z: 200, w: 140, h: 1.2 },
        { x: 880, z: 80, w: 1.2, h: 180 },
        { x: 80, z: 580, w: 220, h: 1.2 },
        { x: 250, z: 640, w: 1.2, h: 160 },
        { x: 350, z: 720, w: 180, h: 1.2 },
        { x: 480, z: 640, w: 1.2, h: 180 },
        { x: 580, z: 760, w: 160, h: 1.2 },
        { x: 700, z: 640, w: 1.2, h: 200 },
        { x: 800, z: 760, w: 140, h: 1.2 },
        { x: 880, z: 600, w: 1.2, h: 200 },
        { x: 80, z: 850, w: 180, h: 1.2 },
        { x: 200, z: 800, w: 1.2, h: 160 },
        { x: 300, z: 880, w: 160, h: 1.2 },
        { x: 420, z: 800, w: 1.2, h: 180 },
        { x: 520, z: 900, w: 140, h: 1.2 },
        { x: 620, z: 800, w: 1.2, h: 200 },
        { x: 720, z: 900, w: 160, h: 1.2 },
        { x: 840, z: 800, w: 1.2, h: 180 },
        
        // İç koridor duvarları
        { x: 150, z: 250, w: 80, h: 1.2 },
        { x: 250, z: 200, w: 1.2, h: 100 },
        { x: 400, z: 250, w: 100, h: 1.2 },
        { x: 500, z: 200, w: 1.2, h: 120 },
        { x: 650, z: 280, w: 80, h: 1.2 },
        { x: 750, z: 250, w: 1.2, h: 100 },
        { x: 350, z: 400, w: 100, h: 1.2 },
        { x: 450, z: 450, w: 1.2, h: 80 },
        { x: 600, z: 420, w: 80, h: 1.2 },
        { x: 700, z: 450, w: 1.2, h: 100 },
        { x: 250, z: 550, w: 80, h: 1.2 },
        { x: 350, z: 600, w: 1.2, h: 80 },
        { x: 500, z: 580, w: 80, h: 1.2 },
        { x: 650, z: 550, w: 1.2, h: 100 },
        { x: 150, z: 700, w: 80, h: 1.2 },
        { x: 280, z: 750, w: 1.2, h: 80 },
        { x: 450, z: 720, w: 80, h: 1.2 },
        { x: 600, z: 680, w: 1.2, h: 100 },
        { x: 780, z: 700, w: 80, h: 1.2 },
        { x: 850, z: 450, w: 1.2, h: 100 },
        { x: 900, z: 500, w: 80, h: 1.2 },
        { x: 100, z: 450, w: 1.2, h: 80 },
        { x: 150, z: 480, w: 60, h: 1.2 },
        
        // Oda bölmeleri
        { x: 800, z: 350, w: 1.2, h: 60 },
        { x: 820, z: 380, w: 60, h: 1.2 },
        { x: 200, z: 850, w: 1.2, h: 60 },
        { x: 230, z: 820, w: 60, h: 1.2 },
        { x: 700, z: 150, w: 1.2, h: 60 },
        { x: 730, z: 180, w: 60, h: 1.2 },
        { x: 450, z: 150, w: 1.2, h: 60 },
        { x: 480, z: 120, w: 60, h: 1.2 },
        
        // Merkez labirent
        { x: 400, z: 300, w: 80, h: 1.2 },
        { x: 480, z: 300, w: 1.2, h: 80 },
        { x: 550, z: 350, w: 80, h: 1.2 },
        { x: 620, z: 300, w: 1.2, h: 100 },
        { x: 300, z: 350, w: 1.2, h: 80 },
        { x: 320, z: 380, w: 60, h: 1.2 },
    ];
    
    // ─────────────────────────────────────────────────────────────────
    // INPUT SYSTEM
    // ─────────────────────────────────────────────────────────────────
    const keys = {
        KeyW: false, KeyS: false, KeyA: false, KeyD: false,
        Space: false, ShiftLeft: false, KeyE: false
    };
    
    let mouseLocked = false;
    
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
    let monsterBuffer = null;
    let footstepBuffer = null;
    let lastFootstepTime = 0;
    let monsterAudioLoaded = false;
    let footstepLoaded = false;
    
    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Monster sound
            fetch('canavar.mp3')
                .then(res => res.arrayBuffer())
                .then(buf => audioContext.decodeAudioData(buf))
                .then(decoded => {
                    monsterBuffer = decoded;
                    monsterAudioLoaded = true;
                })
                .catch(() => console.log('Monster ses yok'));
            
            // Footstep sound
            fetch('ayaq.mp3')
                .then(res => res.arrayBuffer())
                .then(buf => audioContext.decodeAudioData(buf))
                .then(decoded => {
                    footstepBuffer = decoded;
                    footstepLoaded = true;
                })
                .catch(() => console.log('Ayak sesi yok'));
        } catch(e) {}
    }
    
    function playSound(buffer, volume = 0.4, pitch = 1) {
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
        if (!footstepLoaded || !gameActive) return;
        const now = Date.now();
        const interval = player.isRunning ? 320 : 480;
        const isMoving = player.moveForward !== 0 || player.moveRight !== 0;
        if (isMoving && player.isGrounded && now - lastFootstepTime > interval) {
            lastFootstepTime = now;
            const pitch = 0.85 + Math.random() * 0.3;
            playSound(footstepBuffer, 0.25, pitch);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // COLLISION SYSTEM
    // ─────────────────────────────────────────────────────────────────
    function checkCollision(x, z, radius) {
        for (const wall of walls) {
            const left = wall.x - wall.w / 2;
            const right = wall.x + wall.w / 2;
            const top = wall.z - wall.h / 2;
            const bottom = wall.z + wall.h / 2;
            
            const closestX = Math.max(left, Math.min(x, right));
            const closestZ = Math.max(top, Math.min(z, bottom));
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
        
        if (keys.KeyW) moveF += 1;
        if (keys.KeyS) moveF -= 1;
        if (keys.KeyD) moveR += 1;
        if (keys.KeyA) moveR -= 1;
        
        if (joystickActive && (Math.abs(joystickDir.x) > 0.1 || Math.abs(joystickDir.y) > 0.1)) {
            moveF = joystickDir.y;
            moveR = joystickDir.x;
        }
        
        player.isRunning = (keys.ShiftLeft || mobileRun) && (moveF !== 0 || moveR !== 0);
        
        if (moveF !== 0 || moveR !== 0) {
            const len = Math.hypot(moveF, moveR);
            moveF /= len;
            moveR /= len;
        }
        
        const speed = (player.isRunning ? player.runSpeed : player.speed) * deltaTime;
        const cosA = Math.cos(player.angle);
        const sinA = Math.sin(player.angle);
        
        let moveX = (moveF * cosA + moveR * sinA) * speed;
        let moveZ = (moveF * -sinA + moveR * cosA) * speed;
        
        // X axis movement
        let newX = player.x + moveX;
        if (!checkCollision(newX, player.z, player.radius)) {
            player.x = newX;
        } else {
            let slideX = player.x + moveX * 0.3;
            if (!checkCollision(slideX, player.z, player.radius)) {
                player.x = slideX;
            }
        }
        
        // Z axis movement
        let newZ = player.z + moveZ;
        if (!checkCollision(player.x, newZ, player.radius)) {
            player.z = newZ;
        } else {
            let slideZ = player.z + moveZ * 0.3;
            if (!checkCollision(player.x, slideZ, player.radius)) {
                player.z = slideZ;
            }
        }
        
        // Boundaries
        player.x = Math.max(2, Math.min(player.x, 998));
        player.z = Math.max(2, Math.min(player.z, 998));
        
        // Footsteps
        if ((moveF !== 0 || moveR !== 0) && player.isGrounded) {
            playFootstep();
        }
        
        // Gravity and jump
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
                if (keys.Space) keys.Space = false;
            }
        } else {
            player.isGrounded = false;
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // MONSTER AI
    // ─────────────────────────────────────────────────────────────────
    function updateMonster(deltaTime) {
        if (!gameActive) return;
        
        const dx = player.x - monster.x;
        const dz = player.z - monster.z;
        const distToPlayer = Math.hypot(dx, dz);
        
        // Update monster step animation
        monster.step += deltaTime * 8;
        
        // State machine
        if (distToPlayer < monster.agroRange) {
            monster.state = 'chase';
            monster.lastSeenX = player.x;
            monster.lastSeenZ = player.z;
            monster.lastSeenTime = Date.now();
        } else if (monster.state === 'chase') {
            const timeSinceSeen = (Date.now() - monster.lastSeenTime) / 1000;
            if (timeSinceSeen > 5) {
                monster.state = 'idle';
                monster.lastSeenX = null;
                monster.lastSeenZ = null;
            }
        }
        
        // Movement
        let targetX = monster.x, targetZ = monster.z;
        
        if (monster.state === 'chase' && monster.lastSeenX) {
            targetX = monster.lastSeenX;
            targetZ = monster.lastSeenZ;
        } else {
            // Patrol - wander
            const angle = Date.now() * 0.0005;
            targetX = 500 + Math.sin(angle) * 200;
            targetZ = 500 + Math.cos(angle * 0.7) * 200;
        }
        
        const dirX = targetX - monster.x;
        const dirZ = targetZ - monster.z;
        const dist = Math.hypot(dirX, dirZ);
        
        if (dist > 0.2) {
            const speed = monster.state === 'chase' ? monster.chaseSpeed : monster.speed;
            const move = Math.min(speed * deltaTime, dist - 0.1);
            monster.x += (dirX / dist) * move;
            monster.z += (dirZ / dist) * move;
            monster.angle = Math.atan2(dirX, dirZ);
        }
        
        // Monster collision
        if (checkCollision(monster.x, monster.z, 0.4)) {
            monster.x -= (dirX / dist) * 0.15;
            monster.z -= (dirZ / dist) * 0.15;
        }
        
        // Check catch
        if (distToPlayer < monster.attackRange) {
            gameActive = false;
            deathCount++;
            localStorage.setItem('backrooms_deaths', deathCount);
            updateStats();
            showScreen('caught');
            if (audioContext) audioContext.suspend();
            return;
        }
        
        // Danger overlay
        const dangerOverlay = document.getElementById('danger-overlay');
        if (distToPlayer < 130) {
            const intensity = Math.min(0.7, 0.2 + (1 - distToPlayer / 130) * 0.5);
            dangerOverlay.style.opacity = intensity;
            dangerOverlay.classList.add('active');
        } else {
            dangerOverlay.style.opacity = 0;
            dangerOverlay.classList.remove('active');
        }
        
        // Distance HUD
        const distEl = document.getElementById('distance');
        if (distEl) {
            const distM = Math.floor(distToPlayer);
            if (distToPlayer < 60) {
                distEl.innerHTML = `⚠️ ${distM}m`;
                distEl.style.color = '#e74c3c';
            } else {
                distEl.innerHTML = `📏 ${distM}m`;
                distEl.style.color = '#d4a017';
            }
        }
        
        // Monster sound effect
        if (monsterAudioLoaded && distToPlayer < 100 && monster.state === 'chase') {
            if (Math.random() < 0.02) {
                playSound(monsterBuffer, 0.3, 0.7 + Math.random() * 0.6);
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // INTERACTION
    // ─────────────────────────────────────────────────────────────────
    function interact() {
        if (!gameActive) return;
        
        // Key pickup
        if (!key.collected) {
            const dx = player.x - key.x;
            const dz = player.z - key.z;
            if (Math.hypot(dx, dz) < 1.3) {
                key.collected = true;
                player.hasKey = true;
                const keyStatus = document.getElementById('key-status');
                keyStatus.innerHTML = '🔑 ANAHTAR ALINDI';
                keyStatus.classList.add('has-key');
                playSound(monsterBuffer, 0.5);
            }
        }
        
        // Exit door
        if (player.hasKey) {
            const dx = player.x - exitDoor.x;
            const dz = player.z - exitDoor.z;
            if (Math.hypot(dx, dz) < 1.5) {
                gameActive = false;
                escapeCount++;
                playCount++;
                localStorage.setItem('backrooms_plays', playCount);
                localStorage.setItem('backrooms_escapes', escapeCount);
                updateStats();
                showScreen('win');
                if (audioContext) audioContext.suspend();
            }
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // 3D RENDERING (RAYCASTING)
    // ─────────────────────────────────────────────────────────────────
    let screenW, screenH;
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        screenW = canvas.width;
        screenH = canvas.height;
    }
    
    function draw() {
        if (!ctx) return;
        
        screenW = canvas.width;
        screenH = canvas.height;
        
        const fov = Math.PI / 2.6;
        const halfFov = fov / 2;
        const numRays = Math.min(160, Math.floor(screenW / 3));
        
        for (let i = 0; i <= numRays; i++) {
            const rayAngle = player.angle - halfFov + (i / numRays) * fov;
            let rayX = player.x;
            let rayZ = player.z;
            let hitDist = 400;
            let hitWall = null;
            
            const step = 0.06;
            
            for (let s = 0; s < 800; s++) {
                rayX += Math.sin(rayAngle) * step;
                rayZ += Math.cos(rayAngle) * step;
                
                let wallHit = false;
                for (const wall of walls) {
                    const left = wall.x - wall.w / 2;
                    const right = wall.x + wall.w / 2;
                    const top = wall.z - wall.h / 2;
                    const bottom = wall.z + wall.h / 2;
                    
                    if (rayX >= left && rayX <= right && rayZ >= top && rayZ <= bottom) {
                        wallHit = true;
                        hitWall = wall;
                        break;
                    }
                }
                
                if (wallHit) {
                    const dx = rayX - player.x;
                    const dz = rayZ - player.z;
                    hitDist = Math.hypot(dx, dz);
                    break;
                }
                
                if (rayX < 1 || rayX > 999 || rayZ < 1 || rayZ > 999) {
                    hitDist = 400;
                    break;
                }
            }
            
            // Fish-eye correction
            const correctedDist = hitDist * Math.cos(rayAngle - player.angle);
            const wallHeight = Math.min(screenH, (3.2 / Math.max(0.2, correctedDist)) * screenH * 0.75);
            const wallY = (screenH - wallHeight) / 2;
            
            // Wall shading based on distance
            const shade = Math.min(0.85, 0.25 + 0.6 / (1 + correctedDist / 25));
            const r = Math.floor(55 * shade);
            const g = Math.floor(40 * shade);
            const b = Math.floor(20 * shade);
            
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const xPos = (i / numRays) * screenW;
            const width = screenW / numRays;
            ctx.fillRect(xPos, wallY, width + 1, wallHeight);
            
            // Wall texture detail (horizontal lines)
            if (correctedDist < 40) {
                ctx.fillStyle = `rgba(212,160,23,${0.08 * (1 - correctedDist / 40)})`;
                ctx.fillRect(xPos, wallY, width + 1, wallHeight);
            }
            
            // Ceiling
            ctx.fillStyle = `rgb(25,20,10)`;
            ctx.fillRect(xPos, 0, width + 1, wallY);
            
            // Floor
            const floorShade = Math.min(0.6, 0.2 + 0.4 / (1 + correctedDist / 20));
            ctx.fillStyle = `rgb(${Math.floor(20 * floorShade)},${Math.floor(15 * floorShade)},${Math.floor(8 * floorShade)})`;
            ctx.fillRect(xPos, wallY + wallHeight, width + 1, screenH - (wallY + wallHeight));
        }
        
        // Draw crosshair
        ctx.beginPath();
        ctx.strokeStyle = '#d4a017';
        ctx.lineWidth = 2;
        ctx.moveTo(screenW / 2 - 12, screenH / 2);
        ctx.lineTo(screenW / 2 - 5, screenH / 2);
        ctx.moveTo(screenW / 2 + 5, screenH / 2);
        ctx.lineTo(screenW / 2 + 12, screenH / 2);
        ctx.moveTo(screenW / 2, screenH / 2 - 12);
        ctx.lineTo(screenW / 2, screenH / 2 - 5);
        ctx.moveTo(screenW / 2, screenH / 2 + 5);
        ctx.lineTo(screenW / 2, screenH / 2 + 12);
        ctx.stroke();
        
        // Key indicator (3D position)
        if (!key.collected) {
            const dx = key.x - player.x;
            const dz = key.z - player.z;
            const angleToKey = Math.atan2(dx, dz);
            let angleDiff = angleToKey - player.angle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            const distToKey = Math.hypot(dx, dz);
            if (distToKey < 70 && Math.abs(angleDiff) < Math.PI / 2.2) {
                const screenX = screenW / 2 + (angleDiff / (Math.PI / 2.2)) * (screenW / 3);
                if (screenX > 0 && screenX < screenW) {
                    const size = Math.max(20, Math.min(45, Math.floor(70 / distToKey)));
                    ctx.font = `${size}px monospace`;
                    ctx.fillStyle = '#d4a017';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = '#d4a017';
                    ctx.fillText('🔑', screenX - 15, screenH / 2 - 45);
                    ctx.shadowBlur = 0;
                }
            }
        }
        
        // Exit indicator
        if (player.hasKey) {
            const dx = exitDoor.x - player.x;
            const dz = exitDoor.z - player.z;
            const angleToExit = Math.atan2(dx, dz);
            let angleDiff = angleToExit - player.angle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            const distToExit = Math.hypot(dx, dz);
            if (distToExit < 80 && Math.abs(angleDiff) < Math.PI / 2.2) {
                const screenX = screenW / 2 + (angleDiff / (Math.PI / 2.2)) * (screenW / 3);
                if (screenX > 0 && screenX < screenW) {
                    const size = Math.max(20, Math.min(45, Math.floor(70 / distToExit)));
                    ctx.font = `${size}px monospace`;
                    ctx.fillStyle = '#2ecc71';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = '#2ecc71';
                    ctx.fillText('🚪', screenX - 15, screenH / 2 - 45);
                    ctx.shadowBlur = 0;
                }
            }
        }
        
        requestAnimationFrame(draw);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // CONTROLS SETUP
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
                player.angle += e.movementX * 0.0035;
                player.pitch += e.movementY * 0.002;
                player.pitch = Math.max(-0.7, Math.min(0.7, player.pitch));
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
            if (code === 'Space') e.preventDefault();
        });
        
        window.addEventListener('keyup', (e) => {
            const code = e.code;
            if (keys.hasOwnProperty(code)) keys[code] = false;
        });
        
        // Mobile joystick
        const joystickArea = document.getElementById('joystickArea');
        const joystickHandle = document.getElementById('joystickHandle');
        
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
        
        // Mobile buttons
        const jumpBtn = document.getElementById('jumpBtn');
        if (jumpBtn) {
            jumpBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileJump = true;
            });
        }
        
        const runBtn = document.getElementById('runBtn');
        if (runBtn) {
            runBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                mobileRun = true;
            });
            runBtn.addEventListener('touchend', () => { mobileRun = false; });
            runBtn.addEventListener('touchcancel', () => { mobileRun = false; });
        }
        
        // Prevent multi-touch panning
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });
        
        document.body.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
    }
    
    // ─────────────────────────────────────────────────────────────────
    // UI & SCREENS
    // ─────────────────────────────────────────────────────────────────
    function updateStats() {
        document.getElementById('playCount').innerText = playCount;
        document.getElementById('escapeCount').innerText = escapeCount;
        document.getElementById('deathCount').innerText = deathCount;
    }
    
    function showScreen(screenName) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('caught-screen').classList.add('hidden');
        document.getElementById('win-screen').classList.add('hidden');
        
        if (screenName === 'menu') document.getElementById('menu-screen').classList.remove('hidden');
        else if (screenName === 'loading') document.getElementById('loading-screen').classList.remove('hidden');
        else if (screenName === 'lobby') document.getElementById('lobby-screen').classList.remove('hidden');
        else if (screenName === 'caught') document.getElementById('caught-screen').classList.remove('hidden');
        else if (screenName === 'win') document.getElementById('win-screen').classList.remove('hidden');
    }
    
    function startGame() {
        gameActive = true;
        
        player.x = 400;
        player.z = 400;
        player.angle = 0;
        player.pitch = 0;
        player.height = 1.65;
        player.velocityY = 0;
        player.hasKey = false;
        player.moveForward = 0;
        player.moveRight = 0;
        
        monster.x = 750;
        monster.z = 750;
        monster.state = 'idle';
        monster.lastSeenX = null;
        monster.lastSeenZ = null;
        
        key.collected = false;
        
        const keyStatus = document.getElementById('key-status');
        keyStatus.innerHTML = '🔑 ANAHTAR YOK';
        keyStatus.classList.remove('has-key');
        
        document.getElementById('danger-overlay').style.opacity = 0;
        document.getElementById('danger-overlay').classList.remove('active');
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        showScreen('loading');
        setTimeout(() => {
            showScreen('lobby');
        }, 400);
    }
    
    function beginGameplay() {
        gameActive = true;
        
        player.x = 400;
        player.z = 400;
        player.angle = 0;
        player.hasKey = false;
        monster.x = 750;
        monster.z = 750;
        monster.state = 'idle';
        key.collected = false;
        
        const keyStatus = document.getElementById('key-status');
        keyStatus.innerHTML = '🔑 ANAHTAR YOK';
        keyStatus.classList.remove('has-key');
        
        document.getElementById('danger-overlay').style.opacity = 0;
        
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        showScreen('loading');
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
        }, 200);
    }
    
    function resetAndPlay() {
        playCount++;
        localStorage.setItem('backrooms_plays', playCount);
        updateStats();
        beginGameplay();
    }
    
    // ─────────────────────────────────────────────────────────────────
    // GAME LOOP
    // ─────────────────────────────────────────────────────────────────
    let lastTime = 0;
    
    function gameLoop(currentTime) {
        frameRequest = requestAnimationFrame(gameLoop);
        
        let deltaTime = Math.min(0.033, (currentTime - lastTime) / 1000);
        if (deltaTime <= 0 || deltaTime > 0.1) deltaTime = 0.016;
        lastTime = currentTime;
        
        if (gameActive) {
            updateMovement(deltaTime);
            updateMonster(deltaTime);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────
    function init() {
        resize();
        window.addEventListener('resize', resize);
        
        setupControls();
        initAudio();
        updateStats();
        
        // Start rendering
        draw();
        
        // Start game loop
        lastTime = performance.now();
        frameRequest = requestAnimationFrame(gameLoop);
        
        // Loading animation
        let progress = 0;
        const loadInterval = setInterval(() => {
            progress += Math.random() * 12 + 4;
            const loadProgress = document.getElementById('loadProgress');
            const loadText = document.getElementById('loadText');
            if (loadProgress) loadProgress.style.width = Math.min(progress, 100) + '%';
            if (loadText) {
                const msgs = ['LABİRENT OLUŞTURULUYOR...', 'CANAVAR UYANIYOR...', 'SESSİZ OL...', 'ARKANA BAK...', 'KAPI KİLİTLİ...'];
                loadText.innerHTML = msgs[Math.floor(Math.random() * msgs.length)];
            }
            if (progress >= 100) {
                clearInterval(loadInterval);
                setTimeout(() => {
                    showScreen('menu');
                }, 400);
            }
        }, 70);
        
        // Button events
        document.getElementById('playBtn')?.addEventListener('click', () => startGame());
        document.getElementById('startGameBtn')?.addEventListener('click', () => beginGameplay());
        document.getElementById('lobbyMenuBtn')?.addEventListener('click', () => showScreen('menu'));
        document.getElementById('retryBtn')?.addEventListener('click', () => resetAndPlay());
        document.getElementById('caughtMenuBtn')?.addEventListener('click', () => showScreen('menu'));
        document.getElementById('winRetryBtn')?.addEventListener('click', () => resetAndPlay());
        document.getElementById('winMenuBtn')?.addEventListener('click', () => showScreen('menu'));
    }
    
    init();
})();
