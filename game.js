const canvas = document.getElementById('gameCanvas');
const hud = document.getElementById('hud');
const lobbyOverlay = document.getElementById('lobbyOverlay');
const settingsOverlay = document.getElementById('settingsOverlay');
const meetingOverlay = document.getElementById('meetingOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const roleLine = document.getElementById('roleLine');
const statusLine = document.getElementById('statusLine');
const taskProgressBar = document.getElementById('taskProgressBar');
const taskListEl = document.getElementById('taskList');
const centerHint = document.getElementById('centerHint');
const taskBtn = document.getElementById('taskBtn');
const reportBtn = document.getElementById('reportBtn');
const killBtn = document.getElementById('killBtn');
const pauseBtn = document.getElementById('pauseBtn');
const mobileControls = document.getElementById('mobileControls');
const stickArea = document.getElementById('stickArea');
const stickKnob = document.getElementById('stickKnob');
const lookArea = document.getElementById('lookArea');
const jumpBtn = document.getElementById('jumpBtn');
const meetingReason = document.getElementById('meetingReason');
const meetingTimerEl = document.getElementById('meetingTimer');
const suspectGrid = document.getElementById('suspectGrid');
const skipVoteBtn = document.getElementById('skipVoteBtn');
const meetingInfo = document.getElementById('meetingInfo');
const resultToast = document.getElementById('resultToast');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverText = document.getElementById('gameOverText');

const playerCountEl = document.getElementById('playerCount');
const killerCountEl = document.getElementById('killerCount');
const gameMinutesEl = document.getElementById('gameMinutes');
const taskCountEl = document.getElementById('taskCount');
const mouseSensitivityEl = document.getElementById('mouseSensitivity');
const lookSensitivityTouchEl = document.getElementById('lookSensitivityTouch');
const settingMouseEl = document.getElementById('settingMouse');
const settingTouchEl = document.getElementById('settingTouch');

const SETTINGS_KEY = 'backrooms-suspects-settings';
const TASK_LABELS = [
  'Elektrik rölesini kalibre et',
  'Sarı terminale güç ver',
  'Arızalı kamerayı sıfırla',
  'Havalandırma panelini sabitle',
  'Sunucu çekirdeğini başlat',
  'Kabloları renk sırasına göre bağla',
  'Kapı sensörünü yeniden eşleştir'
];
const BOT_NAMES = ['Astra', 'Byte', 'Cora', 'Droid', 'Echo', 'Flux', 'Giga', 'Hexa', 'Ion'];
const CREWMATE_COLORS = [0x40c76d, 0x4c8eff, 0xff8848, 0xa86cff, 0x1dd5d2, 0xff5ea8, 0xf6d34d, 0xf15b5b];
const FLOOR_Y = 0;
const PLAYER_RADIUS = 0.42;
const PLAYER_HEIGHT = 1.75;
const CAMERA_EYE = 1.58;

let game = null;
let renderer = null;
let scene = null;
let camera = null;
let clock = new THREE.Clock();

const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  pointerLocked: false,
  touchMove: { x: 0, y: 0 },
  touchLook: { x: 0, y: 0 },
  activeMoveTouchId: null,
  activeLookTouchId: null,
  isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
function playReportTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'square';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(620, ctx.currentTime);
    osc2.frequency.setValueAtTime(310, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(); osc2.start();
    osc1.stop(ctx.currentTime + 0.58); osc2.stop(ctx.currentTime + 0.58);
  } catch (e) {}
}
function showToast(text, ms = 2200) {
  resultToast.textContent = text;
  resultToast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => resultToast.classList.remove('show'), ms);
}
function loadSettings() {
  const defaults = { mouse: 1.1, touch: 1.15 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      mouse: clamp(Number(parsed.mouse) || defaults.mouse, 0.6, 2.2),
      touch: clamp(Number(parsed.touch) || defaults.touch, 0.4, 2.4),
    };
  } catch {
    return defaults;
  }
}
function saveSettings() {
  const data = {
    mouse: Number(settingMouseEl.value),
    touch: Number(settingTouchEl.value),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  mouseSensitivityEl.value = String(data.mouse);
  lookSensitivityTouchEl.value = String(data.touch);
  if (game) {
    game.settings.mouse = data.mouse;
    game.settings.touch = data.touch;
  }
}
function syncSettingsUi() {
  const s = loadSettings();
  mouseSensitivityEl.value = String(s.mouse);
  lookSensitivityTouchEl.value = String(s.touch);
  settingMouseEl.value = String(s.mouse);
  settingTouchEl.value = String(s.touch);
}

class BackroomsMap {
  constructor(sceneRef) {
    this.scene = sceneRef;
    this.cellSize = 4;
    this.width = 17;
    this.height = 17;
    this.grid = [];
    this.walkableCells = [];
    this.walls = [];
    this.wallMeshes = [];
    this.lightMeshes = [];
    this.taskSpots = [];
    this.spawnPoints = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.generateMaze();
    this.buildVisuals();
  }
  generateMaze() {
    const w = this.width;
    const h = this.height;
    this.grid = Array.from({ length: h }, () => Array(w).fill(0));
    const carve = (x, y) => {
      this.grid[y][x] = 1;
      const dirs = [
        [2, 0], [-2, 0], [0, 2], [0, -2]
      ].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && this.grid[ny][nx] === 0) {
          this.grid[y + dy / 2][x + dx / 2] = 1;
          carve(nx, ny);
        }
      }
    };
    carve(1, 1);

    const addRoom = (cx, cy, rw, rh) => {
      for (let y = cy; y < cy + rh; y++) {
        for (let x = cx; x < cx + rw; x++) {
          if (x > 0 && y > 0 && x < w - 1 && y < h - 1) this.grid[y][x] = 1;
        }
      }
    };
    addRoom(3, 3, 3, 3);
    addRoom(11, 3, 3, 3);
    addRoom(5, 9, 5, 3);
    addRoom(11, 11, 3, 3);

    this.walkableCells.length = 0;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (this.grid[z][x] === 1) this.walkableCells.push({ x, z });
      }
    }

    const chooseUniqueCells = (count, minDist = 0) => {
      const chosen = [];
      const shuffled = this.walkableCells.slice().sort(() => Math.random() - 0.5);
      for (const c of shuffled) {
        const ok = chosen.every(other => Math.abs(other.x - c.x) + Math.abs(other.z - c.z) >= minDist);
        if (ok) chosen.push(c);
        if (chosen.length >= count) break;
      }
      return chosen;
    };
    this.spawnPoints = chooseUniqueCells(9, 3).map(c => this.cellToWorld(c.x, c.z));
    this.taskSpots = chooseUniqueCells(8, 4).map(c => this.cellToWorld(c.x, c.z));
  }
  cellToWorld(x, z) {
    const halfW = this.width * this.cellSize * 0.5;
    const halfH = this.height * this.cellSize * 0.5;
    return {
      x: x * this.cellSize - halfW + this.cellSize * 0.5,
      z: z * this.cellSize - halfH + this.cellSize * 0.5,
    };
  }
  worldToCell(x, z) {
    const halfW = this.width * this.cellSize * 0.5;
    const halfH = this.height * this.cellSize * 0.5;
    const cx = Math.floor((x + halfW) / this.cellSize);
    const cz = Math.floor((z + halfH) / this.cellSize);
    return { x: clamp(cx, 0, this.width - 1), z: clamp(cz, 0, this.height - 1) };
  }
  isWalkableWorld(x, z) {
    const c = this.worldToCell(x, z);
    return this.grid[c.z]?.[c.x] === 1;
  }
  buildVisuals() {
    const floorGeo = new THREE.PlaneGeometry(this.width * this.cellSize, this.height * this.cellSize, 24, 24);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8d8153, roughness: 0.98, metalness: 0.02 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(this.width * this.cellSize, this.height * this.cellSize, 1, 1);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xc7c79e, roughness: 1, metalness: 0.0, side: THREE.DoubleSide });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.position.y = 3.5;
    ceiling.rotation.x = Math.PI / 2;
    this.group.add(ceiling);

    const wallGeo = new THREE.BoxGeometry(this.cellSize, 3.5, this.cellSize);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc7bf71, roughness: 0.9, metalness: 0.02 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x8d8450, roughness: 1.0 });

    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[z][x] === 0) {
          const p = this.cellToWorld(x, z);
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(p.x, 1.75, p.z);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.group.add(wall);
          this.wallMeshes.push(wall);
          this.walls.push({
            minX: p.x - this.cellSize * 0.5,
            maxX: p.x + this.cellSize * 0.5,
            minZ: p.z - this.cellSize * 0.5,
            maxZ: p.z + this.cellSize * 0.5,
          });
        } else if ((x + z) % 3 === 0 && Math.random() > 0.58) {
          const p = this.cellToWorld(x, z);
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.9, 0.7), trimMat);
          pillar.position.set(p.x + rand(-0.7, 0.7), 1.45, p.z + rand(-0.7, 0.7));
          pillar.castShadow = true;
          pillar.receiveShadow = true;
          this.group.add(pillar);
          this.walls.push({
            minX: pillar.position.x - 0.35,
            maxX: pillar.position.x + 0.35,
            minZ: pillar.position.z - 0.35,
            maxZ: pillar.position.z + 0.35,
          });
        }
      }
    }

    const lightGeo = new THREE.BoxGeometry(1.6, 0.08, 1.1);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xe8f4a8, emissiveIntensity: 0.9 });
    for (let i = 0; i < this.walkableCells.length; i += 4) {
      const c = this.walkableCells[i];
      const p = this.cellToWorld(c.x, c.z);
      const lightPanel = new THREE.Mesh(lightGeo, lightMat);
      lightPanel.position.set(p.x, 3.45, p.z);
      this.group.add(lightPanel);
      this.lightMeshes.push(lightPanel);
      const light = new THREE.PointLight(0xfff7d0, 1.2, 8, 2);
      light.position.set(p.x, 3.15, p.z);
      light.castShadow = false;
      this.group.add(light);
    }
  }
}

function createCharacter(color, isPlayer = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.75 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x8de5ff, emissive: 0x296b92, emissiveIntensity: 0.5, roughness: 0.12, metalness: 0.35 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 8, 16), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = 1.08;
  group.add(body);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 18), visorMat);
  visor.scale.set(1.2, 0.7, 0.55);
  visor.position.set(0, 1.32, 0.33);
  visor.castShadow = true;
  group.add(visor);

  const legGeo = new THREE.CapsuleGeometry(0.12, 0.28, 6, 10);
  const leg1 = new THREE.Mesh(legGeo, darkMat);
  const leg2 = new THREE.Mesh(legGeo, darkMat);
  leg1.position.set(-0.16, 0.38, 0);
  leg2.position.set(0.16, 0.38, 0);
  leg1.castShadow = leg2.castShadow = true;
  group.add(leg1, leg2);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.48, 0.3), bodyMat);
  backpack.position.set(0, 1.1, -0.34);
  backpack.castShadow = true;
  group.add(backpack);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8), bodyMat);
  antenna.position.set(0, 1.88, -0.04);
  group.add(antenna);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), new THREE.MeshStandardMaterial({ color: 0xfff36d, emissive: 0xd0aa18, emissiveIntensity: 0.65 }));
  tip.position.set(0, 2.02, -0.04);
  group.add(tip);

  if (isPlayer) {
    const marker = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 10, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.05;
    group.add(marker);
  }

  return group;
}

function createBodyMesh(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232734, roughness: 0.82 });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.72), mat);
  lower.position.y = 0.18;
  lower.castShadow = true;
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.54, 10), dark);
  bone.rotation.z = Math.PI / 2;
  bone.position.set(0.48, 0.23, 0);
  group.add(lower, bone);
  return group;
}

function createTaskTerminal(label, color = 0x63d9ff) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.65), new THREE.MeshStandardMaterial({ color: 0x394257, roughness: 0.88 }));
  base.position.y = 0.55;
  base.castShadow = true;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.05), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.12 }));
  screen.position.set(0, 0.8, 0.35);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0x596178 }));
  cap.position.y = 1.12;
  group.add(base, screen, cap);
  group.userData.label = label;
  return group;
}

class Game {
  constructor() {
    this.settings = loadSettings();
    this.config = {
      playerCount: Number(playerCountEl.value),
      killerCount: Number(killerCountEl.value),
      gameMinutes: Number(gameMinutesEl.value),
      taskCount: Number(taskCountEl.value),
    };
    this.running = false;
    this.paused = false;
    this.meeting = null;
    this.timeLeft = this.config.gameMinutes * 60;
    this.tasksCompleted = 0;
    this.totalTasks = this.config.taskCount;
    this.lastHint = '';
    this.scene = scene;
    this.map = new BackroomsMap(scene);
    this.actors = [];
    this.tasks = [];
    this.bodies = [];
    this.killCooldown = 0;
    this.botKillCooldown = 5;
    this.reportCooldown = 0;
    this.playerVote = null;
    this.playerId = 'player';
    this.tmpVec = new THREE.Vector3();
    this.setupWorld();
    this.bindUI();
    this.running = true;
    this.updateHud(true);
  }
  bindUI() {
    taskBtn.onclick = () => this.tryInteractTask();
    reportBtn.onclick = () => this.tryReport();
    killBtn.onclick = () => this.tryKill();
    pauseBtn.onclick = () => this.toggleSettings(true);
  }
  toggleSettings(open) {
    if (open) {
      this.paused = true;
      settingsOverlay.classList.remove('hidden');
      document.exitPointerLock?.();
    } else {
      this.paused = false;
      settingsOverlay.classList.add('hidden');
    }
  }
  setupWorld() {
    this.scene.fog = new THREE.FogExp2(0xc1bc72, 0.024);
    this.scene.background = new THREE.Color(0xb9b463);

    const hemi = new THREE.HemisphereLight(0xffffdd, 0x6f6a44, 1.05);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.35);
    dir.position.set(20, 28, 16);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -38;
    dir.shadow.camera.right = 38;
    dir.shadow.camera.top = 38;
    dir.shadow.camera.bottom = -38;
    this.scene.add(dir);

    const spawnPool = this.map.spawnPoints.slice();
    const popSpawn = () => spawnPool.splice(Math.floor(Math.random() * spawnPool.length), 1)[0];
    const allActors = [];
    const total = this.config.playerCount;
    const rolePool = Array.from({ length: total }, (_, i) => i < this.config.killerCount ? 'killer' : 'crew').sort(() => Math.random() - 0.5);

    for (let i = 0; i < total; i++) {
      const isPlayer = i === 0;
      const actor = {
        id: isPlayer ? this.playerId : `bot_${i}`,
        name: isPlayer ? 'Sen' : BOT_NAMES[i - 1] || `Bot ${i}`,
        color: CREWMATE_COLORS[i % CREWMATE_COLORS.length],
        role: rolePool[i],
        alive: true,
        exiled: false,
        isPlayer,
        mesh: createCharacter(CREWMATE_COLORS[i % CREWMATE_COLORS.length], isPlayer),
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        yaw: rand(-Math.PI, Math.PI),
        pitch: 0,
        grounded: true,
        moveSpeed: isPlayer ? 5.8 : rand(2.1, 2.9),
        sprint: 0,
        nearTaskId: null,
        ai: {
          state: 'wander',
          target: null,
          repath: 0,
          wait: rand(0.4, 1.5),
          nextTaskAt: rand(2, 6),
          vote: null,
          suspicion: 0,
          memoryBody: null,
          chaseBias: Math.random(),
        },
      };
      const spawn = popSpawn() || choice(this.map.spawnPoints);
      actor.position.set(spawn.x + rand(-0.3, 0.3), FLOOR_Y, spawn.z + rand(-0.3, 0.3));
      actor.mesh.position.copy(actor.position);
      actor.mesh.rotation.y = actor.yaw;
      this.scene.add(actor.mesh);
      this.actors.push(actor);
      allActors.push(actor);
    }

    this.player = this.actors.find(a => a.isPlayer);
    camera.position.set(this.player.position.x, CAMERA_EYE, this.player.position.z);
    this.assignTasks();
  }
  assignTasks() {
    const shuffled = this.map.taskSpots.slice().sort(() => Math.random() - 0.5);
    const count = Math.min(this.config.taskCount, shuffled.length);
    for (let i = 0; i < count; i++) {
      const label = TASK_LABELS[i % TASK_LABELS.length];
      const mesh = createTaskTerminal(label, i % 2 ? 0x6bf3c5 : 0x6ea8ff);
      mesh.position.set(shuffled[i].x, 0, shuffled[i].z);
      mesh.rotation.y = rand(-Math.PI, Math.PI);
      this.scene.add(mesh);
      this.tasks.push({
        id: `task_${i}`,
        label,
        pos: new THREE.Vector3(shuffled[i].x, 0, shuffled[i].z),
        mesh,
        completed: false,
        progress: 0,
        assignedTo: null,
        claimedByBots: false,
      });
    }
  }
  destroy() {
    this.running = false;
    for (const actor of this.actors) this.scene.remove(actor.mesh);
    for (const task of this.tasks) this.scene.remove(task.mesh);
    for (const body of this.bodies) this.scene.remove(body.mesh);
    if (this.map?.group) this.scene.remove(this.map.group);
  }
  getAliveActors() {
    return this.actors.filter(a => a.alive);
  }
  getAliveCrew() {
    return this.actors.filter(a => a.alive && a.role === 'crew');
  }
  getAliveKillers() {
    return this.actors.filter(a => a.alive && a.role === 'killer');
  }
  update(dt) {
    if (!this.running) return;
    if (!this.meeting && !this.paused) this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.endGame('Süre doldu', 'Mürettebat süreyi doldurdu. Katiller herkesi temizleyemedi.');
      return;
    }
    this.killCooldown = Math.max(0, this.killCooldown - dt);
    this.botKillCooldown = Math.max(0, this.botKillCooldown - dt);
    this.reportCooldown = Math.max(0, this.reportCooldown - dt);

    if (this.meeting) {
      this.updateMeeting(dt);
      this.updateHud();
      return;
    }
    if (this.paused) return;

    this.updatePlayer(dt);
    this.updateBots(dt);
    this.animateWorld(dt);
    this.checkReportOpportunities();
    this.checkWinConditions();
    this.updateHud();
  }
  animateWorld(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.map.lightMeshes.length; i++) {
      const m = this.map.lightMeshes[i];
      m.material.emissiveIntensity = 0.72 + Math.sin(t * 2.5 + i) * 0.08;
    }
    for (const actor of this.actors) {
      if (!actor.alive) continue;
      actor.mesh.position.set(actor.position.x, 0, actor.position.z);
      if (!actor.isPlayer) actor.mesh.rotation.y = actor.yaw;
      const step = Math.min(actor.velocity.length() * 0.18, 0.45);
      if (actor.mesh.children[2] && actor.mesh.children[3]) {
        actor.mesh.children[2].rotation.x = Math.sin(t * 8 + actor.position.x) * step * 3.5;
        actor.mesh.children[3].rotation.x = -Math.sin(t * 8 + actor.position.x) * step * 3.5;
      }
    }
  }
  updatePlayer(dt) {
    if (!this.player.alive) {
      camera.position.set(this.player.position.x, 0.45, this.player.position.z + 0.01);
      return;
    }
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.touchMove.x;
    const moveZ = (input.back ? 1 : 0) - (input.forward ? 1 : 0) + input.touchMove.y;
    const mag = Math.hypot(moveX, moveZ);
    let wishX = 0, wishZ = 0;
    if (mag > 0.001) {
      const nx = moveX / Math.max(1, mag);
      const nz = moveZ / Math.max(1, mag);
      const cy = Math.cos(this.player.yaw);
      const sy = Math.sin(this.player.yaw);
      wishX = nx * cy - nz * sy;
      wishZ = nz * cy + nx * sy;
    }

    const accel = this.player.grounded ? 24 : 10;
    const friction = this.player.grounded ? 12 : 2.2;
    this.player.velocity.x = lerp(this.player.velocity.x, wishX * this.player.moveSpeed, clamp(accel * dt, 0, 1));
    this.player.velocity.z = lerp(this.player.velocity.z, wishZ * this.player.moveSpeed, clamp(accel * dt, 0, 1));
    if (mag < 0.05) {
      this.player.velocity.x = lerp(this.player.velocity.x, 0, clamp(friction * dt, 0, 1));
      this.player.velocity.z = lerp(this.player.velocity.z, 0, clamp(friction * dt, 0, 1));
    }

    if (input.jump && this.player.grounded) {
      this.player.velocity.y = 5.35;
      this.player.grounded = false;
    }
    this.player.velocity.y -= 14.5 * dt;
    this.moveActor(this.player, dt, true);
    camera.position.set(this.player.position.x, CAMERA_EYE + Math.max(this.player.position.y, 0), this.player.position.z);

    const dir = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const target = camera.position.clone().add(dir);
    camera.lookAt(target.x, camera.position.y + Math.tan(this.player.pitch), target.z);
  }
  moveActor(actor, dt, allowY = false) {
    const pos = actor.position;
    if (allowY) {
      pos.y += actor.velocity.y * dt;
      if (pos.y <= FLOOR_Y) {
        pos.y = FLOOR_Y;
        actor.velocity.y = 0;
        actor.grounded = true;
      }
    }

    pos.x += actor.velocity.x * dt;
    this.resolveCircleCollisions(pos, PLAYER_RADIUS);
    if (!this.map.isWalkableWorld(pos.x, pos.z)) {
      pos.x -= actor.velocity.x * dt;
      actor.velocity.x *= -0.08;
    }

    pos.z += actor.velocity.z * dt;
    this.resolveCircleCollisions(pos, PLAYER_RADIUS);
    if (!this.map.isWalkableWorld(pos.x, pos.z)) {
      pos.z -= actor.velocity.z * dt;
      actor.velocity.z *= -0.08;
    }

    actor.mesh.position.set(pos.x, pos.y, pos.z);
  }
  resolveCircleCollisions(pos, radius) {
    for (const wall of this.map.walls) {
      const closestX = clamp(pos.x, wall.minX, wall.maxX);
      const closestZ = clamp(pos.z, wall.minZ, wall.maxZ);
      let dx = pos.x - closestX;
      let dz = pos.z - closestZ;
      let d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 1e-8) {
          const left = Math.abs(pos.x - wall.minX);
          const right = Math.abs(pos.x - wall.maxX);
          const top = Math.abs(pos.z - wall.minZ);
          const bottom = Math.abs(pos.z - wall.maxZ);
          const m = Math.min(left, right, top, bottom);
          if (m === left) dx = -1, dz = 0;
          else if (m === right) dx = 1, dz = 0;
          else if (m === top) dx = 0, dz = -1;
          else dx = 0, dz = 1;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const push = (radius - d) + 0.001;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
  }
  updateBots(dt) {
    for (const bot of this.actors) {
      if (bot.isPlayer || !bot.alive) continue;
      bot.ai.repath -= dt;
      bot.ai.wait -= dt;
      bot.ai.nextTaskAt -= dt;

      const nearbyBody = this.findVisibleBodyFor(bot, 5.4);
      if (nearbyBody && !this.reportCooldown) {
        this.startMeeting(`${bot.name} bir ceset buldu.`, nearbyBody.owner?.name || 'Bilinmeyen');
        return;
      }

      if (bot.role === 'killer') {
        this.updateKillerBot(bot, dt);
      } else {
        this.updateCrewBot(bot, dt);
      }

      this.moveActor(bot, dt);
    }
  }
  updateCrewBot(bot, dt) {
    if (bot.ai.nextTaskAt <= 0) {
      const task = this.tasks.find(t => !t.completed);
      if (task) {
        bot.ai.state = 'task';
        bot.ai.target = task.pos.clone();
      } else {
        bot.ai.state = 'wander';
      }
      bot.ai.nextTaskAt = rand(4.5, 8.5);
    }
    if (bot.ai.state === 'task') {
      const liveTask = this.getNearestTask(bot.position, 2.1, false);
      if (liveTask) {
        bot.ai.wait = Math.max(bot.ai.wait, rand(0.8, 1.7));
        if (bot.ai.wait < 0.02) {
          if (Math.random() > 0.48) this.completeTask(liveTask, bot);
          bot.ai.state = 'wander';
          bot.ai.target = null;
          bot.ai.nextTaskAt = rand(4.5, 8.2);
        }
      } else if (bot.ai.repath <= 0 || !bot.ai.target || dist2D(bot.position, bot.ai.target) < 1.1) {
        const task = this.tasks.find(t => !t.completed);
        bot.ai.target = (task ? task.pos : new THREE.Vector3(choice(this.map.spawnPoints).x, 0, choice(this.map.spawnPoints).z)).clone();
        bot.ai.repath = rand(1.2, 2.4);
      }
    } else {
      if (bot.ai.repath <= 0 || !bot.ai.target || dist2D(bot.position, bot.ai.target) < 0.8) {
        const p = choice(this.map.spawnPoints) || choice(this.map.taskSpots);
        bot.ai.target = new THREE.Vector3(p.x + rand(-0.8, 0.8), 0, p.z + rand(-0.8, 0.8));
        bot.ai.repath = rand(1.8, 3.3);
      }
    }
    this.steerBotTowards(bot, bot.ai.target, dt, 0.95);
  }
  updateKillerBot(bot, dt) {
    const target = this.chooseKillerTarget(bot);
    if (target) {
      bot.ai.state = 'hunt';
      bot.ai.target = target.position.clone();
      const d = dist2D(bot.position, target.position);
      const witnessed = this.anyWitnessCanSee(bot, target, 4.2);
      if (d < 1.3 && !witnessed && this.botKillCooldown <= 0) {
        this.killActor(target, bot);
        this.botKillCooldown = rand(4.5, 7.5);
        bot.ai.wait = rand(0.7, 1.4);
        return;
      }
    } else if (bot.ai.repath <= 0 || !bot.ai.target || dist2D(bot.position, bot.ai.target) < 0.8) {
      bot.ai.state = 'fake';
      const task = this.tasks.find(t => !t.completed);
      const p = task ? task.pos : choice(this.map.spawnPoints);
      bot.ai.target = new THREE.Vector3(p.x + rand(-1.0, 1.0), 0, p.z + rand(-1.0, 1.0));
      bot.ai.repath = rand(1.4, 2.9);
    }
    const speedFactor = bot.ai.state === 'hunt' ? 1.15 : 0.92;
    this.steerBotTowards(bot, bot.ai.target, dt, speedFactor);
  }
  chooseKillerTarget(bot) {
    const candidates = this.actors.filter(a => a.alive && a.role === 'crew');
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = dist2D(bot.position, c.position);
      const nearbyWitnesses = this.actors.filter(o => o.alive && o.id !== bot.id && o.id !== c.id && dist2D(o.position, c.position) < 3.7).length;
      const score = d + nearbyWitnesses * 5 + (c.isPlayer ? 0.6 : 0);
      if (score < bestScore && d < 10.5) {
        best = c;
        bestScore = score;
      }
    }
    return best;
  }
  steerBotTowards(bot, target, dt, speedFactor = 1) {
    if (!target) {
      bot.velocity.x = lerp(bot.velocity.x, 0, clamp(dt * 4.5, 0, 1));
      bot.velocity.z = lerp(bot.velocity.z, 0, clamp(dt * 4.5, 0, 1));
      return;
    }
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      bot.velocity.x = lerp(bot.velocity.x, 0, clamp(dt * 4.5, 0, 1));
      bot.velocity.z = lerp(bot.velocity.z, 0, clamp(dt * 4.5, 0, 1));
      return;
    }
    const dirX = dx / d;
    const dirZ = dz / d;
    const desiredYaw = Math.atan2(dirX, dirZ);
    bot.yaw += normalizeAngle(desiredYaw - bot.yaw) * Math.min(1, dt * 6.5);
    bot.velocity.x = lerp(bot.velocity.x, dirX * bot.moveSpeed * speedFactor, clamp(dt * 5.5, 0, 1));
    bot.velocity.z = lerp(bot.velocity.z, dirZ * bot.moveSpeed * speedFactor, clamp(dt * 5.5, 0, 1));
    if (Math.random() > 0.995 && bot.grounded) {
      bot.velocity.y = 4.7;
      bot.grounded = false;
    }
    bot.velocity.y -= 14 * dt;
    if (bot.position.y <= FLOOR_Y) {
      bot.position.y = FLOOR_Y;
      bot.velocity.y = Math.max(0, bot.velocity.y);
      bot.grounded = true;
    }
  }
  findNearestBody(position, radius = 2.5) {
    let best = null;
    let bestDist = radius;
    for (const body of this.bodies) {
      if (body.reported) continue;
      const d = dist2D(position, body.pos);
      if (d < bestDist) {
        best = body;
        bestDist = d;
      }
    }
    return best;
  }
  findVisibleBodyFor(actor, radius = 4.5) {
    let best = null;
    let bestDist = radius;
    for (const body of this.bodies) {
      if (body.reported) continue;
      const d = dist2D(actor.position, body.pos);
      if (d < bestDist && this.canSee(actor.position, body.pos)) {
        best = body;
        bestDist = d;
      }
    }
    return best;
  }
  canSee(from, to) {
    const steps = Math.max(5, Math.ceil(dist2D(from, to) / 0.75));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(from.x, to.x, t);
      const z = lerp(from.z, to.z, t);
      if (!this.map.isWalkableWorld(x, z)) return false;
    }
    return true;
  }
  anyWitnessCanSee(killer, victim, radius = 4) {
    return this.actors.some(a => a.alive && a.id !== killer.id && a.id !== victim.id && dist2D(a.position, victim.position) < radius && this.canSee(a.position, victim.position));
  }
  getNearestTask(position, radius = 2.2, includeCompleted = false) {
    let best = null;
    let bestDist = radius;
    for (const task of this.tasks) {
      if (!includeCompleted && task.completed) continue;
      const d = dist2D(position, task.pos);
      if (d < bestDist) {
        best = task;
        bestDist = d;
      }
    }
    return best;
  }
  completeTask(task, actor) {
    if (!task || task.completed) return;
    task.completed = true;
    task.mesh.children[1].material.color.setHex(0x75ff9d);
    task.mesh.children[1].material.emissive.setHex(0x2a8d4a);
    task.mesh.children[1].material.emissiveIntensity = 0.9;
    this.tasksCompleted++;
    if (actor?.isPlayer) showToast(`Görev tamamlandı: ${task.label}`);
  }
  killActor(victim, killer) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.velocity.set(0, 0, 0);
    victim.mesh.visible = false;
    const bodyMesh = createBodyMesh(victim.color);
    bodyMesh.position.set(victim.position.x, 0, victim.position.z);
    bodyMesh.rotation.y = rand(-Math.PI, Math.PI);
    this.scene.add(bodyMesh);
    const body = {
      owner: victim,
      killer,
      mesh: bodyMesh,
      pos: new THREE.Vector3(victim.position.x, 0, victim.position.z),
      reported: false,
    };
    this.bodies.push(body);
    if (victim.isPlayer) {
      showToast('Öldün. Toplantılarda oy kullanabilirsin ama hareket edemezsin.', 3600);
      centerHint.innerHTML = 'Öldün. Yakınında biri cesedi bulursa toplantı başlayacak.';
    }
  }
  tryInteractTask() {
    if (!this.player.alive || this.meeting || this.paused) return;
    if (this.player.role !== 'crew') {
      showToast('Katil görev yapamaz, sahte dolaşır.');
      return;
    }
    const task = this.getNearestTask(this.player.position, 2.15, false);
    if (!task) {
      showToast('Yakında görev terminali yok.');
      return;
    }
    this.completeTask(task, this.player);
  }
  tryReport() {
    if (!this.player.alive || this.meeting || this.reportCooldown > 0) return;
    const body = this.findVisibleBodyFor(this.player, 2.6);
    if (!body) {
      showToast('Yakında raporlanacak ceset yok.');
      return;
    }
    this.startMeeting('Sen bir ceset buldun.', body.owner?.name || 'Bilinmeyen');
  }
  tryKill() {
    if (!this.player.alive || this.meeting || this.paused) return;
    if (this.player.role !== 'killer') {
      showToast('Sadece katil öldürebilir.');
      return;
    }
    if (this.killCooldown > 0) {
      showToast(`Bekle: ${this.killCooldown.toFixed(1)} sn`);
      return;
    }
    const victim = this.actors.find(a => a.alive && !a.isPlayer && a.role === 'crew' && dist2D(a.position, this.player.position) < 1.55);
    if (!victim) {
      showToast('Öldürme menzilinde kimse yok.');
      return;
    }
    if (this.anyWitnessCanSee(this.player, victim, 3.8)) {
      showToast('Çok kalabalık, tanık var!');
      return;
    }
    this.killActor(victim, this.player);
    this.killCooldown = 7.5;
    showToast(`${victim.name} etkisiz hale getirildi.`, 2200);
  }
  checkReportOpportunities() {
    const body = this.findVisibleBodyFor(this.player, 2.4);
    const task = this.getNearestTask(this.player.position, 2.1, false);
    if (!this.player.alive) {
      reportBtn.disabled = true;
      taskBtn.disabled = true;
      killBtn.disabled = true;
      centerHint.innerHTML = 'Hayalet durumundasın. Toplantı olursa oy kullanabilirsin.';
      return;
    }
    reportBtn.disabled = !body;
    taskBtn.disabled = !(task && this.player.role === 'crew');
    killBtn.disabled = !(this.player.role === 'killer' && this.killCooldown <= 0 && this.actors.some(a => a.alive && a.role === 'crew' && !a.isPlayer && dist2D(a.position, this.player.position) < 1.55));
    if (body) {
      centerHint.innerHTML = '<b>E</b> ile cesedi reportla';
    } else if (task && this.player.role === 'crew') {
      centerHint.innerHTML = `<b>E</b> ile görev yap: ${task.label}`;
    } else if (this.player.role === 'killer') {
      centerHint.innerHTML = 'Tek yakalanan hedefi kollayıp <b>Q</b> ile öldür.';
    } else {
      centerHint.innerHTML = 'Backrooms içinde ilerle, görevleri bitir ve ceset görürsen reportla.';
    }
  }
  startMeeting(reasonText, bodyName) {
    if (this.meeting) return;
    const body = this.bodies.find(b => !b.reported && (b.owner?.name === bodyName || true));
    if (body) body.reported = true;
    playReportTone();
    this.reportCooldown = 4;
    this.meeting = {
      timeLeft: 30,
      reasonText,
      bodyName,
      votes: new Map(),
      aiTimers: new Map(),
    };
    for (const actor of this.actors) {
      actor.velocity.set(0, 0, 0);
      actor.ai.vote = null;
      if (!actor.isPlayer && actor.alive) this.meeting.aiTimers.set(actor.id, rand(4, 20));
    }
    this.playerVote = null;
    meetingReason.textContent = `${reasonText} Ölen kişi: ${bodyName}.`;
    meetingOverlay.classList.remove('hidden');
    this.renderMeetingOptions();
    document.exitPointerLock?.();
  }
  renderMeetingOptions() {
    suspectGrid.innerHTML = '';
    const suspects = this.actors.filter(a => a.alive);
    for (const actor of suspects) {
      const card = document.createElement('div');
      card.className = 'suspectCard';
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:16px; height:16px; border-radius:50%; background:#${actor.color.toString(16).padStart(6,'0')}"></div>
          <strong>${actor.name}</strong>
        </div>
        <div class="chip">${actor.isPlayer ? 'Sen' : 'Bot'}</div>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.textContent = 'Şüpheli Seç';
      btn.onclick = () => this.castPlayerVote(actor.id);
      card.appendChild(btn);
      suspectGrid.appendChild(card);
    }
  }
  castPlayerVote(targetId) {
    if (!this.meeting) return;
    this.playerVote = targetId;
    this.meeting.votes.set(this.playerId, targetId);
    const target = this.actors.find(a => a.id === targetId);
    meetingInfo.textContent = `${target?.name || 'Bilinmeyen'} için oy verdin.`;
    showToast(`Oy verildi: ${target?.name || 'Bilinmeyen'}`);
  }
  updateMeeting(dt) {
    this.meeting.timeLeft -= dt;
    meetingTimerEl.textContent = String(Math.max(0, Math.ceil(this.meeting.timeLeft)));
    for (const [actorId, t] of [...this.meeting.aiTimers.entries()]) {
      const remain = t - dt;
      if (remain <= 0) {
        const actor = this.actors.find(a => a.id === actorId && a.alive);
        if (actor && !this.meeting.votes.has(actor.id)) {
          const vote = this.chooseAiVote(actor);
          this.meeting.votes.set(actor.id, vote);
        }
        this.meeting.aiTimers.delete(actorId);
      } else {
        this.meeting.aiTimers.set(actorId, remain);
      }
    }
    if (this.meeting.timeLeft <= 0) this.resolveMeeting();
  }
  chooseAiVote(actor) {
    const alive = this.actors.filter(a => a.alive);
    if (alive.length <= 1) return null;
    if (actor.role === 'killer') {
      const crew = alive.filter(a => a.role === 'crew');
      return choice(crew)?.id || null;
    }
    const suspiciousBodies = this.bodies.filter(b => b.reported && b.killer?.alive).map(b => b.killer.id);
    if (suspiciousBodies.length && Math.random() > 0.32) return choice(suspiciousBodies);
    if (this.player.role === 'killer' && this.player.alive && Math.random() > 0.46) return this.player.id;
    return choice(alive)?.id || null;
  }
  resolveMeeting() {
    const tally = new Map();
    for (const vote of this.meeting.votes.values()) {
      if (!vote) continue;
      tally.set(vote, (tally.get(vote) || 0) + 1);
    }
    let eliminatedId = null;
    let max = 0;
    let tie = false;
    for (const [id, n] of tally.entries()) {
      if (n > max) {
        max = n;
        eliminatedId = id;
        tie = false;
      } else if (n === max) {
        tie = true;
      }
    }
    if (tie) eliminatedId = null;
    if (eliminatedId) {
      const actor = this.actors.find(a => a.id === eliminatedId);
      if (actor) {
        actor.alive = false;
        actor.exiled = true;
        actor.mesh.visible = false;
        showToast(`${actor.name} dışarı atıldı. Rolü ${actor.role === 'killer' ? 'Katil' : 'Mürettebat'}.`, 4000);
      }
    } else {
      showToast('Oylama berabere kaldı. Kimse atılmadı.', 3200);
    }
    this.meeting = null;
    meetingOverlay.classList.add('hidden');
    meetingInfo.textContent = 'Henüz oy kullanmadın.';
    this.checkWinConditions(true);
  }
  checkWinConditions(fromMeeting = false) {
    const aliveCrew = this.getAliveCrew();
    const aliveKillers = this.getAliveKillers();
    if (aliveKillers.length === 0) {
      this.endGame('Mürettebat kazandı', 'Bütün katiller tespit edilip oyun dışı bırakıldı.');
      return;
    }
    if (this.tasksCompleted >= this.totalTasks) {
      this.endGame('Mürettebat kazandı', 'Bütün görevler tamamlandı.');
      return;
    }
    if (aliveCrew.length === 0 || aliveKillers.length >= aliveCrew.length) {
      this.endGame('Katiller kazandı', 'Katiller çoğunluğu ele geçirdi ve Backrooms koridorlarını temizledi.');
      return;
    }
    if (fromMeeting) this.updateHud(true);
  }
  endGame(title, text) {
    if (!this.running) return;
    this.running = false;
    this.paused = true;
    document.exitPointerLock?.();
    gameOverTitle.textContent = title;
    gameOverText.textContent = text;
    gameOverOverlay.classList.remove('hidden');
  }
  updateHud(force = false) {
    if (!force && !this.running) return;
    const completed = this.tasksCompleted;
    const total = this.totalTasks;
    const pct = total ? (completed / total) * 100 : 0;
    taskProgressBar.style.width = `${pct}%`;

    const roleText = this.player.role === 'killer'
      ? `Rolün: Katil • Hedef: görevler bitmeden herkesi temizle • Süre: ${formatTime(this.timeLeft)}`
      : `Rolün: Mürettebat • Hedef: görevleri bitir ve katili yakala • Süre: ${formatTime(this.timeLeft)}`;
    roleLine.textContent = roleText;

    const aliveCrew = this.getAliveCrew().length;
    const aliveKillers = this.getAliveKillers().length;
    const playerState = this.player.alive ? 'Hayatta' : 'Ölü';
    statusLine.textContent = `${playerState} • Mürettebat: ${aliveCrew} • Katil: ${aliveKillers} • Kill CD: ${this.killCooldown.toFixed(1)} sn`;

    taskListEl.innerHTML = this.tasks.map(t => `<div class="${t.completed ? 'done' : 'todo'}">${t.completed ? '✓' : '•'} ${t.label}</div>`).join('');
    killBtn.classList.toggle('hidden', this.player.role !== 'killer');
  }
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 300);
}

function startGame() {
  if (game) {
    game.destroy();
    while (scene.children.length) scene.remove(scene.children[0]);
  }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 300);
  game = new Game();
  game.settings.mouse = Number(mouseSensitivityEl.value);
  game.settings.touch = Number(lookSensitivityTouchEl.value);
  lobbyOverlay.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  mobileControls.classList.toggle('hidden', !input.isMobile);
  centerHint.innerHTML = input.isMobile
    ? 'Sol alan hareket, sağ alan bakış. Yakındaki görevleri <b>E</b> ya da düğmelerle yap.'
    : 'Ekrana tıklayıp mouse kilitle. Yakındaki görevleri <b>E</b> ile yap.';
}

function updateLookFromMouse(event) {
  if (!game || !input.pointerLocked || game.paused || game.meeting || !game.player.alive) return;
  const factor = 0.0023 * game.settings.mouse;
  game.player.yaw -= event.movementX * factor;
  game.player.pitch = clamp(game.player.pitch - event.movementY * factor * 0.85, -0.9, 0.9);
}

function bindInput() {
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyW') input.forward = true;
    if (e.code === 'KeyS') input.back = true;
    if (e.code === 'KeyA') input.left = true;
    if (e.code === 'KeyD') input.right = true;
    if (e.code === 'Space') input.jump = true;
    if (e.code === 'KeyE') {
      game?.tryInteractTask();
      game?.tryReport();
    }
    if (e.code === 'KeyQ') game?.tryKill();
    if (e.code === 'Escape' && game) game.toggleSettings(!settingsOverlay.classList.contains('hidden'));
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') input.forward = false;
    if (e.code === 'KeyS') input.back = false;
    if (e.code === 'KeyA') input.left = false;
    if (e.code === 'KeyD') input.right = false;
    if (e.code === 'Space') input.jump = false;
  });
  document.addEventListener('mousemove', updateLookFromMouse);
  canvas.addEventListener('click', () => {
    if (!input.isMobile && game && !game.paused && !game.meeting && game.running) canvas.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });

  let moveOrigin = null;
  const maxStick = 56;
  const setStick = (x, y) => {
    const len = Math.hypot(x, y);
    const clamped = Math.min(len, maxStick);
    const nx = len ? (x / len) * clamped : 0;
    const ny = len ? (y / len) * clamped : 0;
    input.touchMove.x = nx / maxStick;
    input.touchMove.y = ny / maxStick;
    stickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  };
  const resetStick = () => {
    input.touchMove.x = 0;
    input.touchMove.y = 0;
    stickKnob.style.transform = 'translate(-50%, -50%)';
    moveOrigin = null;
  };

  stickArea.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    input.activeMoveTouchId = t.identifier;
    moveOrigin = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  stickArea.addEventListener('touchmove', (e) => {
    const t = [...e.changedTouches].find(t => t.identifier === input.activeMoveTouchId);
    if (!t || !moveOrigin) return;
    e.preventDefault();
    setStick(t.clientX - moveOrigin.x, t.clientY - moveOrigin.y);
  }, { passive: false });
  stickArea.addEventListener('touchend', (e) => {
    const found = [...e.changedTouches].find(t => t.identifier === input.activeMoveTouchId);
    if (found) {
      input.activeMoveTouchId = null;
      resetStick();
    }
  });
  stickArea.addEventListener('touchcancel', resetStick);

  let lastLook = null;
  lookArea.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    input.activeLookTouchId = t.identifier;
    lastLook = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  lookArea.addEventListener('touchmove', (e) => {
    const t = [...e.changedTouches].find(t => t.identifier === input.activeLookTouchId);
    if (!t || !lastLook || !game || game.paused || game.meeting || !game.player.alive) return;
    e.preventDefault();
    const dx = t.clientX - lastLook.x;
    const dy = t.clientY - lastLook.y;
    const factor = 0.0034 * game.settings.touch;
    game.player.yaw -= dx * factor;
    game.player.pitch = clamp(game.player.pitch - dy * factor * 0.85, -0.9, 0.9);
    lastLook = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  lookArea.addEventListener('touchend', (e) => {
    const found = [...e.changedTouches].find(t => t.identifier === input.activeLookTouchId);
    if (found) {
      input.activeLookTouchId = null;
      lastLook = null;
    }
  });
  lookArea.addEventListener('touchcancel', () => { input.activeLookTouchId = null; lastLook = null; });

  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.jump = true; }, { passive: false });
  jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); input.jump = false; }, { passive: false });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  game?.update(dt);
  renderer.render(scene, camera);
}

function bindUiButtons() {
  document.getElementById('startBtn').onclick = () => {
    const total = Number(playerCountEl.value);
    const killers = Number(killerCountEl.value);
    if (killers >= total) {
      showToast('Katil sayısı toplam kişiden az olmalı.');
      return;
    }
    startGame();
  };
  document.getElementById('openSettingsBtn').onclick = () => settingsOverlay.classList.remove('hidden');
  document.getElementById('closeSettingsBtn').onclick = () => {
    saveSettings();
    settingsOverlay.classList.add('hidden');
    if (game) game.paused = false;
  };
  document.getElementById('restartBtn').onclick = () => {
    hud.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    meetingOverlay.classList.add('hidden');
    lobbyOverlay.classList.remove('hidden');
    settingsOverlay.classList.add('hidden');
    document.exitPointerLock?.();
    if (game) {
      game.destroy();
      game = null;
    }
  };
  skipVoteBtn.onclick = () => {
    if (game?.meeting) {
      game.meeting.votes.set(game.playerId, null);
      game.playerVote = null;
      meetingInfo.textContent = 'Oyunu geçtin.';
      showToast('Oyu geçtin.');
    }
  };
  mouseSensitivityEl.addEventListener('input', () => settingMouseEl.value = mouseSensitivityEl.value);
  lookSensitivityTouchEl.addEventListener('input', () => settingTouchEl.value = lookSensitivityTouchEl.value);
  settingMouseEl.addEventListener('input', saveSettings);
  settingTouchEl.addEventListener('input', saveSettings);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
}

syncSettingsUi();
initRenderer();
bindInput();
bindUiButtons();
window.addEventListener('resize', onResize);
animate();
