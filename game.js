// AMONG US x BACKROOMS - Game Engine

const COLORS = [
    0xFF0000, 0x0000FF, 0x00FF00, 0xFF69B4, 0xFF8833,
    0xFFFF00, 0x8B00FF, 0x8B4513, 0x00FFFF, 0x90EE90
];

class AABB {
    constructor(min, max) {
        this.min = min.clone();
        this.max = max.clone();
    }

    intersects(other) {
        return this.min.x < other.max.x && this.max.x > other.min.x &&
               this.min.y < other.max.y && this.max.y > other.min.y &&
               this.min.z < other.max.z && this.max.z > other.min.z;
    }

    contains(point, radius = 0.3) {
        return point.x > this.min.x + radius && point.x < this.max.x - radius &&
               point.y > this.min.y && point.y < this.max.y &&
               point.z > this.min.z + radius && point.z < this.max.z - radius;
    }
}

class Player {
    constructor(id, x, y, z, isImpostor = false, color = 0xFF0000) {
        this.id = id;
        this.position = new THREE.Vector3(x, y, z);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.isImpostor = isImpostor;
        this.isDead = false;
        this.deathPosition = null;
        this.color = color;
        this.model = null;
        this.canJump = false;
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.lastKillTime = 0;
        this.killCooldown = 30000;
        this.nearbyPlayers = [];
        this.tasks = [];
        this.completedTasks = 0;
        this.lastReportTime = 0;
        this.taskProgress = {};
        this.isDoingTask = false;
        this.taskTimer = 0;
    }

    update(deltaTime, level) {
        if (this.isDead) return;

        // Gravity
        this.velocity.y -= 0.25 * deltaTime;

        // Movement
        const moveDir = new THREE.Vector3();
        if (this.moveForward) moveDir.z -= 1;
        if (this.moveBackward) moveDir.z += 1;
        if (this.moveLeft) moveDir.x -= 1;
        if (this.moveRight) moveDir.x += 1;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            const speed = 0.08;
            this.velocity.x += moveDir.x * speed * deltaTime;
            this.velocity.z += moveDir.z * speed * deltaTime;
        }

        // Friction
        this.velocity.x *= 0.92;
        this.velocity.z *= 0.92;

        // Apply velocity
        const newPos = this.position.clone().add(this.velocity.clone().multiplyScalar(deltaTime));

        // Collision
        if (!level.checkCollision(newPos)) {
            this.position.copy(newPos);
        } else {
            // Try sliding
            const slideX = this.position.clone();
            slideX.x = newPos.x;
            if (!level.checkCollision(slideX)) {
                this.position.copy(slideX);
            } else {
                const slideZ = this.position.clone();
                slideZ.z = newPos.z;
                if (!level.checkCollision(slideZ)) {
                    this.position.copy(slideZ);
                }
            }
            this.velocity.x *= 0.5;
            this.velocity.z *= 0.5;
        }

        // Floor collision
        if (this.position.y <= 0.5) {
            this.position.y = 0.5;
            this.velocity.y = 0;
            this.canJump = true;
        }

        // Update model
        if (this.model) {
            this.model.position.copy(this.position);
            this.model.rotation.copy(this.rotation);
        }

        // Task progression
        if (this.isDoingTask && !this.isImpostor) {
            this.taskTimer += deltaTime;
            if (this.taskTimer > 8) { // 8 saniye görev
                this.completeTask();
                this.isDoingTask = false;
                this.taskTimer = 0;
            }
        }
    }

    jump() {
        if (this.canJump && !this.isDead) {
            this.velocity.y = 0.5;
            this.canJump = false;
        }
    }

    die() {
        this.isDead = true;
        this.deathPosition = this.position.clone();
    }

    canKill() {
        return this.isImpostor && !this.isDead && 
               (Date.now() - this.lastKillTime) > this.killCooldown;
    }

    kill() {
        if (this.canKill()) {
            this.lastKillTime = Date.now();
            return true;
        }
        return false;
    }

    assignTasks() {
        const taskNames = ['Görev 1', 'Görev 2', 'Görev 3'];
        this.tasks = taskNames.map((name, i) => ({
            id: i,
            name: name,
            completed: false,
            progress: 0
        }));
        this.taskProgress = {};
        this.tasks.forEach(t => this.taskProgress[t.id] = 0);
    }

    completeTask() {
        const incomplete = this.tasks.find(t => !t.completed);
        if (incomplete) {
            incomplete.completed = true;
            this.completedTasks++;
        }
    }

    getNextTask() {
        return this.tasks.find(t => !t.completed);
    }
}

class BackroomsLevel {
    constructor() {
        this.mesh = new THREE.Group();
        this.colliders = [];
        this.createLevel();
    }

    createLevel() {
        // Backrooms sarı duvar rengi
        const wallColor = 0xFFDC82;
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: wallColor,
            roughness: 0.6,
            metalness: 0
        });

        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0xEECCAA,
            roughness: 0.8,
            metalness: 0
        });

        // Ana koridor - 100x30
        const corridorLength = 100;
        const corridorWidth = 20;
        const wallHeight = 4;

        // Floor
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(corridorLength, 0.2, corridorWidth),
            floorMaterial
        );
        floor.position.y = 0;
        floor.receiveShadow = true;
        this.mesh.add(floor);
        this.colliders.push(new AABB(
            new THREE.Vector3(-corridorLength/2, -0.2, -corridorWidth/2),
            new THREE.Vector3(corridorLength/2, 0.1, corridorWidth/2)
        ));

        // Ceiling
        const ceiling = new THREE.Mesh(
            new THREE.BoxGeometry(corridorLength, 0.2, corridorWidth),
            wallMaterial
        );
        ceiling.position.y = wallHeight;
        this.mesh.add(ceiling);

        // Duvarlar
        // Front wall
        const frontWall = new THREE.Mesh(
            new THREE.BoxGeometry(corridorLength, wallHeight, 0.3),
            wallMaterial
        );
        frontWall.position.set(0, wallHeight/2, -corridorWidth/2);
        frontWall.castShadow = true;
        this.mesh.add(frontWall);
        this.colliders.push(new AABB(
            new THREE.Vector3(-corridorLength/2, 0, -corridorWidth/2 - 0.2),
            new THREE.Vector3(corridorLength/2, wallHeight, -corridorWidth/2 + 0.2)
        ));

        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.BoxGeometry(corridorLength, wallHeight, 0.3),
            wallMaterial
        );
        backWall.position.set(0, wallHeight/2, corridorWidth/2);
        backWall.castShadow = true;
        this.mesh.add(backWall);
        this.colliders.push(new AABB(
            new THREE.Vector3(-corridorLength/2, 0, corridorWidth/2 - 0.2),
            new THREE.Vector3(corridorLength/2, wallHeight, corridorWidth/2 + 0.2)
        ));

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, wallHeight, corridorWidth),
            wallMaterial
        );
        leftWall.position.set(-corridorLength/2, wallHeight/2, 0);
        leftWall.castShadow = true;
        this.mesh.add(leftWall);
        this.colliders.push(new AABB(
            new THREE.Vector3(-corridorLength/2 - 0.2, 0, -corridorWidth/2),
            new THREE.Vector3(-corridorLength/2 + 0.2, wallHeight, corridorWidth/2)
        ));

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, wallHeight, corridorWidth),
            wallMaterial
        );
        rightWall.position.set(corridorLength/2, wallHeight/2, 0);
        rightWall.castShadow = true;
        this.mesh.add(rightWall);
        this.colliders.push(new AABB(
            new THREE.Vector3(corridorLength/2 - 0.2, 0, -corridorWidth/2),
            new THREE.Vector3(corridorLength/2 + 0.2, wallHeight, corridorWidth/2)
        ));

        // Fluorescent lights
        const lightGeometry = new THREE.BoxGeometry(8, 0.3, 1.5);
        const lightMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFFFCC,
            emissive: 0xFFFFCC,
            emissiveIntensity: 0.8
        });

        for (let i = -4; i < 4; i++) {
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            light.position.set(i * 12.5, wallHeight - 0.2, 0);
            this.mesh.add(light);
        }

        // 3D Point lights for ambiance
        for (let i = 0; i < 8; i++) {
            const plight = new THREE.PointLight(0xFFFFCC, 0.5, 40);
            plight.position.set((i - 3.5) * 12.5, wallHeight - 0.5, 0);
            this.mesh.add(plight);
        }
    }

    checkCollision(position, radius = 0.4) {
        for (let collider of this.colliders) {
            if (collider.contains(position, radius)) {
                return false; // Collision!
            }
        }
        return true; // No collision
    }
}

class GameState {
    constructor(playerCount, impostorCount, duration) {
        this.playerCount = playerCount;
        this.impostorCount = impostorCount;
        this.gameDuration = duration * 60 * 1000;
        this.players = [];
        this.level = new BackroomsLevel();
        this.gameTime = this.gameDuration;
        this.phase = 'running';
        this.voting = false;
        this.meetingTimer = 0;
        this.selectedPlayerColor = null;
    }

    initialize() {
        const spawnPoints = [
            new THREE.Vector3(-40, 1, -8),
            new THREE.Vector3(-40, 1, 0),
            new THREE.Vector3(-40, 1, 8),
            new THREE.Vector3(-20, 1, -8),
            new THREE.Vector3(-20, 1, 8),
            new THREE.Vector3(0, 1, -8),
            new THREE.Vector3(0, 1, 8),
            new THREE.Vector3(20, 1, -8),
            new THREE.Vector3(20, 1, 0),
            new THREE.Vector3(20, 1, 8)
        ];

        for (let i = 0; i < this.playerCount; i++) {
            const color = COLORS[i % COLORS.length];
            const isImpostor = i < this.impostorCount;
            const spawn = spawnPoints[i % spawnPoints.length];
            
            const player = new Player(i, spawn.x, spawn.y, spawn.z, isImpostor, color);
            
            if (!isImpostor) {
                player.assignTasks();
            }
            
            this.players.push(player);
        }
    }

    checkWinCondition() {
        const alive = this.players.filter(p => !p.isDead);
        const impostors = alive.filter(p => p.isImpostor).length;
        const crewmates = alive.length - impostors;

        if (impostors >= crewmates) return 'impostors';
        if (impostors === 0) return 'crewmates';
        if (this.gameTime <= 0) return 'crewmates';

        const totalTasks = this.players.filter(p => !p.isImpostor).reduce((sum, p) => sum + p.tasks.length, 0);
        const completedTasks = this.players.filter(p => !p.isImpostor).reduce((sum, p) => sum + p.completedTasks, 0);
        if (completedTasks >= totalTasks) return 'crewmates';

        return null;
    }

    update(deltaTime) {
        this.gameTime -= deltaTime * 1000;

        this.players.forEach(player => {
            player.update(deltaTime, this.level);
            
            // Find nearby players
            player.nearbyPlayers = this.players.filter(p =>
                p.id !== player.id &&
                !p.isDead &&
                p.position.distanceTo(player.position) < 2
            );
        });

        if (this.voting) {
            this.meetingTimer -= deltaTime * 1000;
            if (this.meetingTimer <= 0) {
                this.voting = false;
            }
        }
    }
}

class AIBot {
    constructor(player, gameState) {
        this.player = player;
        this.gameState = gameState;
        this.state = 'idle'; // idle, moving, task, hunting
        this.targetPos = null;
        this.targetPlayer = null;
        this.huntingTime = 0;
        this.idleTimer = 0;
    }

    update(deltaTime) {
        if (this.player.isDead || this.player.isImpostor) return;

        this.idleTimer += deltaTime * 1000;

        // Do tasks
        const nextTask = this.player.getNextTask();
        if (nextTask && !this.player.isDoingTask) {
            this.player.isDoingTask = true;
            this.player.taskTimer = 0;
            this.state = 'task';
        }

        // Move randomly or to spawn point
        if (this.state === 'idle' || this.state === 'task') {
            if (this.idleTimer > 5000 && Math.random() < 0.3) {
                this.targetPos = new THREE.Vector3(
                    (Math.random() - 0.5) * 80,
                    1,
                    (Math.random() - 0.5) * 15
                );
                this.idleTimer = 0;
            }
        }

        // Move toward target
        if (this.targetPos) {
            const dir = this.targetPos.clone().sub(this.player.position).normalize();
            this.player.moveForward = Math.abs(dir.z) > Math.abs(dir.x);
            this.player.moveBackward = -this.player.moveForward && dir.z < 0;
            this.player.moveLeft = Math.abs(dir.x) > Math.abs(dir.z) && dir.x < 0;
            this.player.moveRight = Math.abs(dir.x) > Math.abs(dir.z) && dir.x > 0;

            if (this.player.position.distanceTo(this.targetPos) < 2) {
                this.targetPos = null;
                this.state = 'idle';
            }
        }

        // Occasional jumping
        if (Math.random() < 0.02 && this.player.canJump) {
            this.player.jump();
        }
    }
}
