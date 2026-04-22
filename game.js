‘use strict’;

// ─── AUDIO CONTEXT ───────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
return audioCtx;
}

// Load audio from file path
function loadAudio(url, cb) {
const ctx = getAudioCtx();
fetch(url)
.then(r => r.arrayBuffer())
.then(buf => ctx.decodeAudioData(buf, cb))
.catch(() => cb(null));
}

// Procedural fallback sounds
function makeFootstepBuffer() {
const ctx = getAudioCtx();
const dur = 0.08, sr = ctx.sampleRate;
const buf = ctx.createBuffer(1, sr * dur, sr);
const d = buf.getChannelData(0);
for (let i = 0; i < d.length; i++) {
d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
}
return buf;
}

function makeMonsterBuffer() {
const ctx = getAudioCtx();
const dur = 1.5, sr = ctx.sampleRate;
const buf = ctx.createBuffer(1, sr * dur, sr);
const d = buf.getChannelData(0);
for (let i = 0; i < d.length; i++) {
const t = i / sr;
d[i] = Math.sin(2 * Math.PI * 60 * t) * Math.sin(2 * Math.PI * 3 * t)
* (Math.random() * 0.3 + 0.7) * Math.pow(1 - t / dur, 0.3) * 0.8;
}
return buf;
}

function playBuffer(buf, volume = 1, loop = false) {
if (!buf) return null;
const ctx = getAudioCtx();
const src = ctx.createBufferSource();
const gain = ctx.createGain();
src.buffer = buf;
src.loop = loop;
gain.gain.value = volume;
src.connect(gain);
gain.connect(ctx.destination);
src.start();
return { src, gain };
}

// ─── GAME STATE ──────────────────────────────────────────────────
const state = {
started: false,
dead: false,
keys: {},
mouse: { dx: 0, dy: 0, locked: false },
mobile: { joyX: 0, joyY: 0, lookDX: 0, lookDY: 0, jump: false },
jumpVel: 0,
onGround: true,
footTimer: 0,
monsterDist: 999,
monsterVolume: null,
monsterSrc: null,
footBuf: null,
monsterBuf: null,
};

// ─── RENDERER ────────────────────────────────────────────────────
const canvas = document.getElementById(‘canvas’);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputEncoding = THREE.LinearEncoding;

// ─── SCENE ───────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1600);
scene.fog = new THREE.Fog(0x1a1600, 5, 28);

// ─── CAMERA ──────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(2, 1.65, 2); // human eye height ~1.65m

// ─── LOOK PITCH ──────────────────────────────────────────────────
const yawObj = new THREE.Object3D();
const pitchObj = new THREE.Object3D();
yawObj.add(pitchObj);
pitchObj.add(camera);
scene.add(yawObj);
yawObj.position.copy(camera.position);
camera.position.set(0, 0, 0);

// ─── LIGHTING — flickery yellow fluorescent ──────────────────────
const ambientLight = new THREE.AmbientLight(0x8b7a20, 0.6);
scene.add(ambientLight);

const lights = [];
function addLight(x, y, z) {
const l = new THREE.PointLight(0xd4b840, 1.2, 12);
l.position.set(x, y, z);
scene.add(l);
lights.push({ light: l, baseIntensity: 1.2, phase: Math.random() * Math.PI * 2 });
}

// ─── MAZE LAYOUT ─────────────────────────────────────────────────
// 1 = wall, 0 = corridor
const CELL = 4; // metres per cell
const MAP = [
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
[1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],
[1,0,1,0,1,0,1,1,0,1,1,0,1,1,0,1],
[1,0,1,0,0,0,0,1,0,0,0,0,0,1,0,1],
[1,0,1,1,1,1,0,1,1,1,0,1,0,1,0,1],
[1,0,0,0,0,1,0,0,0,1,0,1,0,0,0,1],
[1,1,1,0,0,0,0,1,0,1,0,1,1,1,0,1],
[1,0,0,0,1,1,0,1,0,0,0,0,0,1,0,1],
[1,0,1,1,1,0,0,0,0,1,1,1,0,0,0,1],
[1,0,0,0,0,0,1,1,0,0,0,1,0,1,0,1],
[1,1,0,1,1,0,0,0,0,1,0,0,0,1,0,1],
[1,0,0,0,1,0,1,1,1,1,0,1,0,0,0,1],
[1,0,1,0,0,0,0,0,0,1,0,0,0,1,0,1],
[1,0,1,1,1,1,0,1,0,0,0,1,0,1,0,1],
[1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const ROWS = MAP.length, COLS = MAP[0].length;

// ─── TEXTURES ─────────────────────────────────────────────────────
function makeCanvas2D(w, h, fn) {
const c = document.createElement(‘canvas’);
c.width = w; c.height = h;
fn(c.getContext(‘2d’), w, h);
return new THREE.CanvasTexture(c);
}

const wallTex = makeCanvas2D(256, 256, (ctx, w, h) => {
ctx.fillStyle = ‘#c8b870’;
ctx.fillRect(0, 0, w, h);
// wallpaper pattern
ctx.strokeStyle = ‘rgba(180,160,60,0.4)’;
ctx.lineWidth = 1;
for (let x = 0; x < w; x += 16) {
ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
}
for (let y = 0; y < h; y += 24) {
ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
}
// noise overlay
for (let i = 0; i < 4000; i++) {
const px = Math.random() * w, py = Math.random() * h;
const v = Math.random();
ctx.fillStyle = `rgba(${v > 0.5 ? 200 : 100},${v > 0.5 ? 180 : 100},${v > 0.5 ? 40 : 30},${Math.random() * 0.3})`;
ctx.fillRect(px, py, 2, 2);
}
// stains
for (let i = 0; i < 12; i++) {
const gx = Math.random() * w, gy = Math.random() * h;
const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 20 + Math.random() * 30);
g.addColorStop(0, ‘rgba(80,70,10,0.3)’);
g.addColorStop(1, ‘rgba(80,70,10,0)’);
ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(1, 1);

const floorTex = makeCanvas2D(256, 256, (ctx, w, h) => {
ctx.fillStyle = ‘#a09030’;
ctx.fillRect(0, 0, w, h);
// carpet tiles
const sz = 32;
for (let gx = 0; gx < w; gx += sz) {
for (let gy = 0; gy < h; gy += sz) {
const shade = Math.random() * 20 - 10;
ctx.fillStyle = `rgba(${140+shade},${115+shade},${20+shade},0.5)`;
ctx.fillRect(gx, gy, sz - 1, sz - 1);
}
}
for (let i = 0; i < 6000; i++) {
ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
}
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(4, 4);

const ceilTex = makeCanvas2D(256, 256, (ctx, w, h) => {
ctx.fillStyle = ‘#d4c878’;
ctx.fillRect(0, 0, w, h);
for (let i = 0; i < 3000; i++) {
ctx.fillStyle = `rgba(150,130,40,${Math.random() * 0.2})`;
ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
}
// grid lines
ctx.strokeStyle = ‘rgba(160,140,40,0.5)’; ctx.lineWidth = 1;
for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
});
ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
ceilTex.repeat.set(4, 4);

// ─── WALL / FLOOR / CEILING MATERIALS ────────────────────────────
const wallMat  = new THREE.MeshLambertMaterial({ map: wallTex });
const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
const ceilMat  = new THREE.MeshLambertMaterial({ map: ceilTex });

// ─── BUILD MAZE ───────────────────────────────────────────────────
const FLOOR_H = 0;
const CEIL_H  = 3.2;
const WALL_H  = CEIL_H;

// Merge geometries for performance
const wallGeos = [], floorGeos = [], ceilGeos = [];

for (let row = 0; row < ROWS; row++) {
for (let col = 0; col < COLS; col++) {
const wx = col * CELL, wz = row * CELL;
if (MAP[row][col] === 1) {
// Wall block
const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
geo.translate(wx + CELL / 2, WALL_H / 2, wz + CELL / 2);
wallGeos.push(geo);
} else {
// Floor tile
const fgeo = new THREE.PlaneGeometry(CELL, CELL);
fgeo.rotateX(-Math.PI / 2);
fgeo.translate(wx + CELL / 2, FLOOR_H, wz + CELL / 2);
floorGeos.push(fgeo);
// Ceiling tile
const cgeo = new THREE.PlaneGeometry(CELL, CELL);
cgeo.rotateX(Math.PI / 2);
cgeo.translate(wx + CELL / 2, CEIL_H, wz + CELL / 2);
ceilGeos.push(cgeo);
// Lights above corridors (every ~3 cells)
if (Math.random() < 0.28) {
addLight(wx + CELL / 2, CEIL_H - 0.3, wz + CELL / 2);
}
}
}
}

function mergeAndAdd(geos, mat) {
if (!geos.length) return;
let merged = geos[0].clone();
const positions = [merged.attributes.position.array];
const normals   = [merged.attributes.normal.array];
const uvs       = [merged.attributes.uv.array];
let indexOffset = merged.attributes.position.count;
const indices   = merged.index ? [merged.index.array.slice()] : [];

for (let i = 1; i < geos.length; i++) {
const g = geos[i];
positions.push(g.attributes.position.array);
normals.push(g.attributes.normal.array);
uvs.push(g.attributes.uv.array);
if (g.index) {
const idx = g.index.array.map(v => v + indexOffset);
indices.push(idx);
indexOffset += g.attributes.position.count;
}
}

const totalPos = positions.reduce((a, b) => a + b.length, 0);
const mergedPos = new Float32Array(totalPos);
const mergedNrm = new Float32Array(totalPos);
const mergedUV  = new Float32Array(totalPos / 3 * 2);
let pp = 0, np = 0, up = 0;
for (let i = 0; i < positions.length; i++) {
mergedPos.set(positions[i], pp); pp += positions[i].length;
mergedNrm.set(normals[i], np);   np += normals[i].length;
mergedUV.set(uvs[i], up);        up += uvs[i].length;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute(‘position’, new THREE.BufferAttribute(mergedPos, 3));
geo.setAttribute(‘normal’,   new THREE.BufferAttribute(mergedNrm, 3));
geo.setAttribute(‘uv’,       new THREE.BufferAttribute(mergedUV, 2));
if (indices.length) {
const totalIdx = indices.reduce((a, b) => a + b.length, 0);
const mergedIdx = new Uint32Array(totalIdx);
let ip = 0;
for (const idx of indices) { mergedIdx.set(idx, ip); ip += idx.length; }
geo.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
}

scene.add(new THREE.Mesh(geo, mat));
geos.forEach(g => g.dispose());
}

mergeAndAdd(wallGeos, wallMat);
mergeAndAdd(floorGeos, floorMat);
mergeAndAdd(ceilGeos, ceilMat);

// ─── FLUORESCENT LIGHT STRIPS (visual) ───────────────────────────
lights.forEach(({ light }) => {
const geo = new THREE.BoxGeometry(1.2, 0.06, 0.18);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
const mesh = new THREE.Mesh(geo, mat);
mesh.position.copy(light.position);
scene.add(mesh);
});

// ─── MONSTER ─────────────────────────────────────────────────────
function buildMonster() {
const group = new THREE.Group();

// Body
const bodyGeo = new THREE.BoxGeometry(0.55, 1.0, 0.3);
const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a0a0a });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.5;
group.add(body);

// Head
const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
const headMat = new THREE.MeshLambertMaterial({ color: 0x0d0505 });
const head = new THREE.Mesh(headGeo, headMat);
head.position.y = 1.25;
group.add(head);

// Eyes (glowing red)
const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
eyeL.position.set(-0.1, 1.28, 0.22);
group.add(eyeL);
const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
eyeR.position.set(0.1, 1.28, 0.22);
group.add(eyeR);

// Arms
const armGeo = new THREE.BoxGeometry(0.15, 0.85, 0.15);
const armMat = new THREE.MeshLambertMaterial({ color: 0x160808 });
const armL = new THREE.Mesh(armGeo, armMat);
armL.position.set(-0.37, 0.55, 0);
group.add(armL);
const armR = new THREE.Mesh(armGeo, armMat);
armR.position.set(0.37, 0.55, 0);
group.add(armR);

// Legs
const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
const legMat = new THREE.MeshLambertMaterial({ color: 0x120606 });
const legL = new THREE.Mesh(legGeo, legMat);
legL.position.set(-0.18, -0.38, 0);
group.add(legL);
const legR = new THREE.Mesh(legGeo, legMat);
legR.position.set(0.18, -0.38, 0);
group.add(legR);

// Point light on monster (red glow)
const redLight = new THREE.PointLight(0xff0000, 0.8, 4);
redLight.position.set(0, 1.3, 0);
group.add(redLight);

return { group, eyeL, eyeR, armL, armR, legL, legR, redLight };
}

const monster = buildMonster();
// Place monster on a random open cell far from player start
const monsterStart = findOpenCell(10, 10);
monster.group.position.set(monsterStart.x * CELL + CELL / 2, 0, monsterStart.z * CELL + CELL / 2);
scene.add(monster.group);

function findOpenCell(minRow, minCol) {
const open = [];
for (let r = 0; r < ROWS; r++) {
for (let c = 0; c < COLS; c++) {
if (MAP[r][c] === 0 && (r > minRow || c > minCol)) {
open.push({ x: c, z: r });
}
}
}
return open[Math.floor(Math.random() * open.length)];
}

// ─── COLLISION HELPERS ────────────────────────────────────────────
function isSolid(worldX, worldZ) {
const col = Math.floor(worldX / CELL);
const row = Math.floor(worldZ / CELL);
if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
return MAP[row][col] === 1;
}

function tryMove(pos, dx, dz) {
const R = 0.3; // player radius
const nx = pos.x + dx;
const nz = pos.z + dz;

const testX = isSolid(nx + R, pos.z) || isSolid(nx - R, pos.z)
|| isSolid(nx, pos.z + R) || isSolid(nx, pos.z - R);
const testZ = isSolid(pos.x + R, nz) || isSolid(pos.x - R, nz)
|| isSolid(pos.x, nz + R) || isSolid(pos.x, nz - R);

if (!testX) pos.x = nx;
if (!testZ) pos.z = nz;
}

// ─── PLAYER POSITION ─────────────────────────────────────────────
const player = yawObj.position;
let playerYaw = 0, playerPitch = 0;
// Place player on cell (1,1)
player.set(1 * CELL + CELL / 2, 1.65, 1 * CELL + CELL / 2);

// ─── MONSTER AI ───────────────────────────────────────────────────
const monsterPos = monster.group.position;
const MONSTER_SPEED = 2.0;
let monsterWalkPhase = 0;

function updateMonster(dt) {
const dx = player.x - monsterPos.x;
const dz = player.z - monsterPos.z;
const dist = Math.sqrt(dx * dx + dz * dz);
state.monsterDist = dist;

// Move toward player
if (dist > 0.1) {
const speed = MONSTER_SPEED * (dist < 8 ? 1.5 : 1.0);
const mx = (dx / dist) * speed * dt;
const mz = (dz / dist) * speed * dt;
tryMove(monsterPos, mx, mz);
monster.group.rotation.y = Math.atan2(dx, dz);
}

// Animate legs walking
monsterWalkPhase += dt * 6;
monster.legL.rotation.x =  Math.sin(monsterWalkPhase) * 0.5;
monster.legR.rotation.x = -Math.sin(monsterWalkPhase) * 0.5;
monster.armL.rotation.x = -Math.sin(monsterWalkPhase) * 0.4;
monster.armR.rotation.x =  Math.sin(monsterWalkPhase) * 0.4;

// Kill player if too close
if (dist < 0.9 && state.started && !state.dead) {
triggerDeath();
}

// Adjust monster sound volume
const vol = Math.max(0, Math.min(1, 1 - dist / 20));
if (state.monsterVolume) {
state.monsterVolume.gain.value = vol * 0.8;
}

// Danger vignette
const dangerEl = document.getElementById(‘danger’);
dangerEl.style.opacity = Math.max(0, (15 - dist) / 15 * 0.9);
}

// ─── DEATH ────────────────────────────────────────────────────────
function triggerDeath() {
state.dead = true;
document.exitPointerLock();
document.getElementById(‘gameOver’).style.display = ‘flex’;
if (state.monsterSrc) { try { state.monsterSrc.stop(); } catch(e){} }
}

// ─── RESIZE ───────────────────────────────────────────────────────
window.addEventListener(‘resize’, () => {
renderer.setSize(window.innerWidth, window.innerHeight);
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
});

// ─── KEYBOARD ─────────────────────────────────────────────────────
window.addEventListener(‘keydown’, e => { state.keys[e.code] = true; });
window.addEventListener(‘keyup’,   e => { state.keys[e.code] = false; });

// ─── POINTER LOCK ─────────────────────────────────────────────────
canvas.addEventListener(‘click’, () => {
if (state.started && !state.dead) canvas.requestPointerLock();
});
document.addEventListener(‘pointerlockchange’, () => {
state.mouse.locked = !!document.pointerLockElement;
});
document.addEventListener(‘mousemove’, e => {
if (!state.mouse.locked) return;
state.mouse.dx += e.movementX;
state.mouse.dy += e.movementY;
});

// ─── MOBILE DETECTION ─────────────────────────────────────────────
function isMobile() {
return /Mobi|Android|iPhone|iPad|Touch/i.test(navigator.userAgent)
|| window.matchMedia(’(pointer: coarse)’).matches;
}

// ─── MOBILE CONTROLS ─────────────────────────────────────────────
if (isMobile()) {
document.getElementById(‘mobileControls’).style.display = ‘block’;
setupJoystick();
setupLookPad();
setupJumpBtn();
}

function setupJoystick() {
const base  = document.getElementById(‘joystickBase’);
const thumb = document.getElementById(‘joystickThumb’);
const rect  = () => base.getBoundingClientRect();
let touching = false, touchId = null;

const MAX_R = 40;
function onMove(cx, cy) {
const r = rect();
const ox = cx - (r.left + r.width / 2);
const oy = cy - (r.top  + r.height / 2);
const len = Math.sqrt(ox*ox + oy*oy);
const clamped = Math.min(len, MAX_R);
const nx = len > 0 ? ox / len * clamped : 0;
const ny = len > 0 ? oy / len * clamped : 0;
thumb.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
state.mobile.joyX = nx / MAX_R;
state.mobile.joyY = ny / MAX_R;
}

base.addEventListener(‘touchstart’, e => {
e.preventDefault(); touching = true;
touchId = e.changedTouches[0].identifier;
onMove(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
}, { passive: false });
base.addEventListener(‘touchmove’, e => {
e.preventDefault();
for (const t of e.changedTouches) {
if (t.identifier === touchId) onMove(t.clientX, t.clientY);
}
}, { passive: false });
base.addEventListener(‘touchend’, e => {
touching = false; touchId = null;
thumb.style.transform = ‘translate(-50%,-50%)’;
state.mobile.joyX = 0; state.mobile.joyY = 0;
}, { passive: false });
}

function setupLookPad() {
const pad = document.getElementById(‘lookPad’);
let last = null, touchId = null;

pad.addEventListener(‘touchstart’, e => {
e.preventDefault();
const t = e.changedTouches[0];
touchId = t.identifier;
last = { x: t.clientX, y: t.clientY };
}, { passive: false });
pad.addEventListener(‘touchmove’, e => {
e.preventDefault();
for (const t of e.changedTouches) {
if (t.identifier === touchId && last) {
state.mobile.lookDX += (t.clientX - last.x) * 0.6;
state.mobile.lookDY += (t.clientY - last.y) * 0.6;
last = { x: t.clientX, y: t.clientY };
}
}
}, { passive: false });
pad.addEventListener(‘touchend’, () => { last = null; touchId = null; }, { passive: false });
}

function setupJumpBtn() {
const btn = document.getElementById(‘jumpBtn’);
btn.addEventListener(‘touchstart’, e => { e.preventDefault(); state.mobile.jump = true; }, { passive: false });
btn.addEventListener(‘touchend’,   e => { e.preventDefault(); state.mobile.jump = false; }, { passive: false });
}

// ─── START SCREEN ─────────────────────────────────────────────────
document.getElementById(‘startBtn’).addEventListener(‘click’, () => {
getAudioCtx(); // unlock audio
document.getElementById(‘startScreen’).style.display = ‘none’;
state.started = true;

// Load sounds
loadAudio(‘ayaq.mp3’, buf => {
state.footBuf = buf || makeFootstepBuffer();
});
loadAudio(‘canavar.mp3’, buf => {
state.monsterBuf = buf || makeMonsterBuffer();
if (state.monsterBuf) {
const res = playBuffer(state.monsterBuf, 0, true);
if (res) { state.monsterSrc = res.src; state.monsterVolume = res.gain; }
}
});

if (!isMobile()) {
canvas.requestPointerLock();
}
});

document.getElementById(‘retryBtn’).addEventListener(‘click’, () => {
location.reload();
});

// ─── GAME LOOP ────────────────────────────────────────────────────
const GRAVITY   = -14;
const JUMP_VEL  = 6;
const SPEED     = 4.5;
const SPRINT    = 7.0;
const SENS_DESK = 0.002;
const SENS_MOB  = 1.5;

let lastTime = performance.now();

// Bob effect
let bobPhase = 0, bobY = 0;

function loop(now) {
requestAnimationFrame(loop);
const dt = Math.min((now - lastTime) / 1000, 0.05);
lastTime = now;

if (!state.started || state.dead) {
renderer.render(scene, camera);
return;
}

// ── LOOK ────────────────────────────────────────────────────────
// Desktop
if (state.mouse.locked) {
playerYaw   -= state.mouse.dx * SENS_DESK;
playerPitch -= state.mouse.dy * SENS_DESK;
state.mouse.dx = 0; state.mouse.dy = 0;
}
// Mobile look
if (state.mobile.lookDX || state.mobile.lookDY) {
playerYaw   -= state.mobile.lookDX * SENS_MOB * dt;
playerPitch -= state.mobile.lookDY * SENS_MOB * dt;
state.mobile.lookDX = 0;
state.mobile.lookDY = 0;
}
playerPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, playerPitch));
yawObj.rotation.y   = playerYaw;
pitchObj.rotation.x = playerPitch;

// ── MOVE ────────────────────────────────────────────────────────
const sprint = state.keys[‘ShiftLeft’] || state.keys[‘ShiftRight’];
const spd = sprint ? SPRINT : SPEED;

const fw = state.keys[‘KeyW’] || state.keys[‘ArrowUp’];
const bk = state.keys[‘KeyS’] || state.keys[‘ArrowDown’];
const lt = state.keys[‘KeyA’] || state.keys[‘ArrowLeft’];
const rt = state.keys[‘KeyD’] || state.keys[‘ArrowRight’];

// Mobile joystick
const jy = state.mobile.joyY; // -1=forward, 1=back
const jx = state.mobile.joyX; // -1=left, 1=right

const sinY = Math.sin(playerYaw);
const cosY = Math.cos(playerYaw);

let moveX = 0, moveZ = 0;
if (fw || jy < -0.1) { moveX -= sinY; moveZ -= cosY; }
if (bk || jy >  0.1) { moveX += sinY; moveZ += cosY; }
if (lt || jx < -0.1) { moveX -= cosY; moveZ += sinY; }
if (rt || jx >  0.1) { moveX += cosY; moveZ -= sinY; }

// Mobile blending
if (Math.abs(jy) > 0.1) { moveX += -sinY * (-jy); moveZ += -cosY * (-jy); }
if (Math.abs(jx) > 0.1) { moveX +=  cosY * jx;    moveZ += -sinY * jx; }

const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
if (len > 0.001) {
const s = spd * dt / Math.max(len, 1);
tryMove(player, moveX * s, moveZ * s);
}

// ── JUMP & GRAVITY ──────────────────────────────────────────────
const jumpKey = state.keys[‘Space’] || state.keys[‘KeyE’] || state.mobile.jump;
if (jumpKey && state.onGround) {
state.jumpVel = JUMP_VEL;
state.onGround = false;
state.mobile.jump = false;
}

state.jumpVel += GRAVITY * dt;
player.y += state.jumpVel * dt;
if (player.y <= 1.65) {
player.y = 1.65;
state.jumpVel = 0;
state.onGround = true;
}

// ── BOB ─────────────────────────────────────────────────────────
const moving = len > 0.001;
if (moving && state.onGround) {
bobPhase += dt * (sprint ? 14 : 9);
bobY = Math.sin(bobPhase) * 0.04;
// Footstep sound
state.footTimer -= dt;
if (state.footTimer <= 0) {
state.footTimer = sprint ? 0.28 : 0.42;
if (state.footBuf) playBuffer(state.footBuf, 0.6 + Math.random() * 0.4);
else playBuffer(makeFootstepBuffer(), 0.5);
}
} else {
bobY *= 0.85;
}
camera.position.y = bobY;

// ── LIGHT FLICKER ───────────────────────────────────────────────
for (const lobj of lights) {
lobj.phase += dt * (1.5 + Math.random() * 0.5);
const flicker = Math.sin(lobj.phase * 7) * 0.08 + Math.sin(lobj.phase * 13) * 0.05;
lobj.light.intensity = lobj.baseIntensity + flicker;
// Random full off flicker
if (Math.random() < 0.002) {
lobj.light.intensity = 0;
}
}

// ── MONSTER ─────────────────────────────────────────────────────
updateMonster(dt);

renderer.render(scene, camera);
}

requestAnimationFrame(loop);
