class GameManager {
constructor(gameCanvas) {
this.canvas = gameCanvas;
this.ctx = gameCanvas.getContext(‘2d’);
this.width = gameCanvas.width;
this.height = gameCanvas.height;

```
this.currentRoomId = null;
this.players = new Map();
this.walls = [];
this.keyPosition = null;
this.keyCollected = false;
this.localPlayerId = null;

this.monster = null;
this.isAIMonster = true;

this.cameraX = 0;
this.cameraY = 0;

this.gameRunning = false;
this.gameOver = false;
this.escapedPlayers = [];

this.keys = {};
this.setupControls();

this.particleEffects = [];

this.gameState = 'menu'; // menu, playing, ended
```

}

setupControls() {
const onKey = (e, pressed) => {
this.keys[e.key.toLowerCase()] = pressed;
if (pressed && [‘w’, ‘a’, ‘s’, ‘d’, ’ ’].includes(e.key.toLowerCase())) {
e.preventDefault();
}
};

```
window.addEventListener('keydown', (e) => onKey(e, true));
window.addEventListener('keyup', (e) => onKey(e, false));

// Mobil kontroller
this.setupMobileControls();
```

}

setupMobileControls() {
const controlpad = document.getElementById(‘mobile-controls’);
if (!controlpad) return;

```
const createButton = (id, label) => {
  const btn = document.createElement('div');
  btn.id = id;
  btn.className = 'control-btn';
  btn.innerHTML = label;
  
  btn.addEventListener('touchstart', () => {
    this.keys[id] = true;
  });
  btn.addEventListener('touchend', () => {
    this.keys[id] = false;
  });
  
  controlpad.appendChild(btn);
};

createButton('w', '↑');
createButton('a', '←');
createButton('s', '↓');
createButton('d', '→');
createButton('space', 'Jump');
```

}

initializeGame(roomId, roomData, players, localPlayerId, isAIMonster) {
this.currentRoomId = roomId;
this.localPlayerId = localPlayerId;
this.walls = roomData.layout;
this.keyPosition = { …roomData.keyPosition };
this.gameRunning = true;
this.gameOver = false;
this.escapedPlayers = [];
this.isAIMonster = isAIMonster;

```
// Oyuncuları başlat
players.forEach(playerData => {
  this.players.set(playerData.id, {
    id: playerData.id,
    username: playerData.username,
    avatar: playerData.avatar || '👤',
    x: playerData.x,
    y: playerData.y,
    vx: 0,
    vy: 0,
    alive: true,
    isMonster: false,
    animation: 'idle',
    animationFrame: 0,
    canJump: false,
    hasKey: false
  });
});

// Canavar
if (this.isAIMonster) {
  this.monster = {
    x: this.keyPosition.x - 500,
    y: this.keyPosition.y - 500,
    vx: 0,
    vy: 0,
    targetX: this.keyPosition.x,
    targetY: this.keyPosition.y,
    speed: 2.5,
    touchedPlayerId: null,
    touchStartTime: 0,
    animation: 'idle',
    animationFrame: 0
  };
}

this.gameState = 'playing';
this.animate();
```

}

update() {
if (!this.gameRunning || this.gameOver) return;

```
const localPlayer = this.players.get(this.localPlayerId);
if (!localPlayer || !localPlayer.alive) return;

// Kontrolleri işle
const moveVector = { x: 0, y: 0 };
const gravity = 0.5;
const moveSpeed = 3;
const jumpPower = 12;

// Keyboard kontrolleri
if (this.keys['w']) moveVector.y -= moveSpeed;
if (this.keys['s']) moveVector.y += moveSpeed;
if (this.keys['a']) moveVector.x -= moveSpeed;
if (this.keys['d']) moveVector.x += moveSpeed;

// Joystick kontrolleri (Mobil)
if (this.keys['joystick_x'] !== undefined && this.keys['joystick_x'] !== 0) {
  moveVector.x += this.keys['joystick_x'] * moveSpeed;
}
if (this.keys['joystick_y'] !== undefined && this.keys['joystick_y'] !== 0) {
  moveVector.y += this.keys['joystick_y'] * moveSpeed;
}

// Sıçrama
if (this.keys['space'] && localPlayer.canJump) {
  localPlayer.vy = -jumpPower;
  localPlayer.canJump = false;
}

// Hız uygula
localPlayer.vx = moveVector.x;
localPlayer.vy += gravity;
localPlayer.vy = Math.max(-jumpPower, Math.min(jumpPower, localPlayer.vy));

// Konum güncelle
localPlayer.x += localPlayer.vx;
localPlayer.y += localPlayer.vy;

// Duvar çarpışması
localPlayer.canJump = false;
this.walls.forEach(wall => {
  if (this.checkCollision(localPlayer, wall)) {
    // Yukarıdan
    if (localPlayer.vy > 0 && localPlayer.y - 20 < wall.y) {
      localPlayer.y = wall.y - 20;
      localPlayer.vy = 0;
      localPlayer.canJump = true;
    }
    // Aşağıdan
    else if (localPlayer.vy < 0 && localPlayer.y + 20 > wall.y + wall.height) {
      localPlayer.y = wall.y + wall.height + 20;
      localPlayer.vy = 0;
    }
    // Sağdan
    else if (localPlayer.vx < 0 && localPlayer.x + 20 > wall.x + wall.width) {
      localPlayer.x = wall.x + wall.width + 20;
      localPlayer.vx = 0;
    }
    // Soldan
    else if (localPlayer.vx > 0 && localPlayer.x - 20 < wall.x) {
      localPlayer.x = wall.x - 20;
      localPlayer.vx = 0;
    }
  }
});

// Animasyon
if (Math.abs(moveVector.x) > 0 || Math.abs(moveVector.y) > 0) {
  localPlayer.animation = 'walking';
} else {
  localPlayer.animation = 'idle';
}

if (localPlayer.vy !== 0) {
  localPlayer.animation = 'jumping';
}

// Anahtar kontrolü
if (!this.keyCollected && this.isNear(localPlayer, this.keyPosition, 30)) {
  this.keyCollected = true;
  localPlayer.hasKey = true;
  window.gameSocket.send(JSON.stringify({
    type: 'KEY_COLLECTED',
    roomId: this.currentRoomId
  }));
}

// Kaçış
if (localPlayer.hasKey && this.isNear(localPlayer, { x: 50, y: 50 }, 100)) {
  this.playerEscaped();
}

// Canavar AI
if (this.isAIMonster && this.monster) {
  this.updateMonsterAI(localPlayer);
}

// Kamera takip
this.cameraX = localPlayer.x - this.width / 2;
this.cameraY = localPlayer.y - this.height / 2;

// Harita sınırları
this.cameraX = Math.max(0, Math.min(this.cameraX, 3000 - this.width));
this.cameraY = Math.max(0, Math.min(this.cameraY, 3000 - this.height));

// Sunucuya gönder
window.gameSocket.send(JSON.stringify({
  type: 'PLAYER_MOVE',
  roomId: this.currentRoomId,
  x: localPlayer.x,
  y: localPlayer.y,
  vx: localPlayer.vx,
  vy: localPlayer.vy,
  animation: localPlayer.animation
}));
```

}

updateMonsterAI(targetPlayer) {
const monster = this.monster;
const dist = Math.hypot(
targetPlayer.x - monster.x,
targetPlayer.y - monster.y
);

```
// En yakın canlı oyuncuyu bul
let nearestPlayer = targetPlayer;
let nearestDist = dist;

this.players.forEach(player => {
  if (player.alive && player.id !== this.localPlayerId) {
    const d = Math.hypot(player.x - monster.x, player.y - monster.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPlayer = player;
    }
  }
});

// Hedefe doğru hareket et
const dx = nearestPlayer.x - monster.x;
const dy = nearestPlayer.y - monster.y;
const angle = Math.atan2(dy, dx);

monster.vx = Math.cos(angle) * monster.speed;
monster.vy = Math.sin(angle) * monster.speed;

// Sıçrama hareketi
if (Math.random() < 0.02) {
  monster.vy = -8;
}

// Yerçekimi
monster.vy += 0.3;

// Pozisyon güncelle
monster.x += monster.vx;
monster.y += monster.vy;

// Duvar çarpışması
this.walls.forEach(wall => {
  if (this.checkCollision(monster, wall)) {
    if (monster.vy > 0) {
      monster.y = wall.y - 20;
      monster.vy = 0;
    } else if (monster.vy < 0) {
      monster.y = wall.y + wall.height + 20;
      monster.vy = 0;
    }
    if (monster.vx < 0) {
      monster.x = wall.x + wall.width + 20;
    } else {
      monster.x = wall.x - 20;
    }
  }
});

// Oyuncu dokunması kontrolü
this.players.forEach(player => {
  if (player.alive && player.id !== this.localPlayerId) {
    if (Math.hypot(player.x - monster.x, player.y - monster.y) < 40) {
      if (!monster.touchedPlayerId || monster.touchedPlayerId !== player.id) {
        monster.touchedPlayerId = player.id;
        monster.touchStartTime = Date.now();
      } else {
        const touchDuration = Date.now() - monster.touchStartTime;
        if (touchDuration > 2000) {
          window.gameSocket.send(JSON.stringify({
            type: 'PLAYER_CAUGHT',
            roomId: this.currentRoomId,
            targetId: player.id
          }));
          player.alive = false;
          monster.touchedPlayerId = null;
        }
      }
    } else {
      if (monster.touchedPlayerId === player.id) {
        monster.touchedPlayerId = null;
      }
    }
  }
});

// Animasyon
monster.animationFrame = (monster.animationFrame + 1) % 10;
monster.animation = dist < 200 ? 'chasing' : 'searching';

window.gameSocket.send(JSON.stringify({
  type: 'MONSTER_MOVE',
  roomId: this.currentRoomId,
  x: monster.x,
  y: monster.y,
  animation: monster.animation
}));
```

}

checkCollision(obj, wall) {
return (
obj.x + 20 > wall.x &&
obj.x - 20 < wall.x + wall.width &&
obj.y + 20 > wall.y &&
obj.y - 20 < wall.y + wall.height
);
}

isNear(obj1, obj2, distance) {
return Math.hypot(obj1.x - obj2.x, obj1.y - obj2.y) < distance;
}

playerEscaped() {
const localPlayer = this.players.get(this.localPlayerId);
this.escapedPlayers.push({
id: localPlayer.id,
username: localPlayer.username
});

```
window.gameSocket.send(JSON.stringify({
  type: 'GAME_WON',
  roomId: this.currentRoomId,
  players: this.escapedPlayers
}));

this.gameRunning = false;
this.gameState = 'ended';
```

}

handleGameOver(survivors) {
this.gameRunning = false;
this.gameOver = true;
this.gameState = ‘ended’;
this.showGameOverScreen(survivors);
}

showGameOverScreen(survivors) {
const gameOverDiv = document.createElement(‘div’);
gameOverDiv.id = ‘game-over-screen’;
gameOverDiv.innerHTML = `<div class="game-over-content"> <h1>OYUN BİTTİ</h1> <p>Kurtulmuş oyuncular: ${survivors.length}</p> <ul> ${survivors.map(s =>`<li>${s.username}</li>`).join('')} </ul> <button onclick="location.reload()">Ana Menüye Dön</button> </div> `;
document.body.appendChild(gameOverDiv);
}

draw() {
// Arka plan (backrooms efekti)
this.ctx.fillStyle = ‘#D4A574’;
this.ctx.fillRect(0, 0, this.width, this.height);

```
// Duvarlar
this.ctx.fillStyle = '#8B7355';
this.walls.forEach(wall => {
  this.drawRect(wall.x, wall.y, wall.width, wall.height);
});

// Grid efekti
this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
this.ctx.lineWidth = 1;
for (let i = 0; i < this.width; i += 200) {
  this.ctx.beginPath();
  this.ctx.moveTo(i - this.cameraX, -this.cameraY);
  this.ctx.lineTo(i - this.cameraX, this.height - this.cameraY);
  this.ctx.stroke();
}
for (let i = 0; i < this.height; i += 200) {
  this.ctx.beginPath();
  this.ctx.moveTo(-this.cameraX, i - this.cameraY);
  this.ctx.lineTo(this.width - this.cameraX, i - this.cameraY);
  this.ctx.stroke();
}

// Anahtar
if (!this.keyCollected) {
  this.drawKey(this.keyPosition.x, this.keyPosition.y);
}

// Oyuncular
this.players.forEach(player => {
  if (player.alive) {
    this.drawPlayer(player);
  }
});

// Canavar
if (this.isAIMonster && this.monster) {
  this.drawMonster(this.monster);
}

// HUD
this.drawHUD();

// Particle efektleri
this.particleEffects = this.particleEffects.filter(p => {
  p.life -= 1;
  this.ctx.globalAlpha = p.life / p.maxLife;
  this.ctx.fillStyle = p.color;
  this.ctx.fillRect(p.x - this.cameraX, p.y - this.cameraY, 4, 4);
  return p.life > 0;
});
this.ctx.globalAlpha = 1;
```

}

drawPlayer(player) {
const screenX = player.x - this.cameraX;
const screenY = player.y - this.cameraY;

```
// Gölge
this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
this.ctx.beginPath();
this.ctx.ellipse(screenX, screenY + 25, 20, 8, 0, 0, Math.PI * 2);
this.ctx.fill();

// Oyuncu gövdesi
this.ctx.fillStyle = player.id === this.localPlayerId ? '#FF6B6B' : '#4ECDC4';
this.ctx.beginPath();
this.ctx.arc(screenX, screenY, 15, 0, Math.PI * 2);
this.ctx.fill();

// Anahtar göstergesi
if (player.hasKey) {
  this.ctx.fillStyle = '#FFD700';
  this.ctx.font = 'bold 20px Arial';
  this.ctx.textAlign = 'center';
  this.ctx.fillText('🔑', screenX, screenY - 25);
}

// İsim
this.ctx.fillStyle = '#000';
this.ctx.font = 'bold 12px Arial';
this.ctx.textAlign = 'center';
this.ctx.fillText(player.username, screenX, screenY + 35);
```

}

drawMonster(monster) {
const screenX = monster.x - this.cameraX;
const screenY = monster.y - this.cameraY;

```
// Canavar gövdesi
this.ctx.fillStyle = '#8B0000';
this.ctx.beginPath();

// Sıçrama animasyonu
const bounce = Math.sin(monster.animationFrame / 5) * 5;
this.ctx.arc(screenX, screenY + bounce, 20, 0, Math.PI * 2);
this.ctx.fill();

// Gözler
this.ctx.fillStyle = '#FFD700';
this.ctx.beginPath();
this.ctx.arc(screenX - 8, screenY - 5, 4, 0, Math.PI * 2);
this.ctx.fill();
this.ctx.beginPath();
this.ctx.arc(screenX + 8, screenY - 5, 4, 0, Math.PI * 2);
this.ctx.fill();

// Ağız
this.ctx.strokeStyle = '#FFD700';
this.ctx.lineWidth = 2;
this.ctx.beginPath();
this.ctx.arc(screenX, screenY + 5, 8, 0, Math.PI);
this.ctx.stroke();
```

}

drawKey(x, y) {
const screenX = x - this.cameraX;
const screenY = y - this.cameraY;

```
// Pulsing efekti
const scale = 1 + Math.sin(Date.now() / 500) * 0.2;

this.ctx.save();
this.ctx.translate(screenX, screenY);
this.ctx.scale(scale, scale);

this.ctx.fillStyle = '#FFD700';
this.ctx.font = 'bold 40px Arial';
this.ctx.textAlign = 'center';
this.ctx.textBaseline = 'middle';
this.ctx.fillText('🔑', 0, 0);

// Glow
this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
this.ctx.lineWidth = 3;
this.ctx.beginPath();
this.ctx.arc(0, 0, 30, 0, Math.PI * 2);
this.ctx.stroke();

this.ctx.restore();
```

}

drawRect(x, y, width, height) {
const screenX = x - this.cameraX;
const screenY = y - this.cameraY;
this.ctx.fillRect(screenX, screenY, width, height);
}

drawHUD() {
const localPlayer = this.players.get(this.localPlayerId);
if (!localPlayer) return;

```
// Arka plan
this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
this.ctx.fillRect(10, 10, 300, 100);

// Text
this.ctx.fillStyle = '#FFF';
this.ctx.font = 'bold 16px Arial';
this.ctx.textAlign = 'left';
this.ctx.fillText(`📍 ${localPlayer.username}`, 20, 35);
this.ctx.fillText(`🔑 Anahtar: ${this.keyCollected ? '✓ Toplandı' : '✗ Bulunmadı'}`, 20, 60);
this.ctx.fillText(`👥 Oyuncular: ${Array.from(this.players.values()).filter(p => p.alive).length}`, 20, 85);

// Anahtar bulma mesafesi
if (!this.keyCollected) {
  const dist = Math.hypot(
    localPlayer.x - this.keyPosition.x,
    localPlayer.y - this.keyPosition.y
  );
  this.ctx.fillStyle = dist < 100 ? '#FFD700' : '#FFF';
  this.ctx.font = 'bold 14px Arial';
  this.ctx.fillText(`Mesafe: ${Math.round(dist)}px`, 20, 110);
}
```

}

animate() {
if (!this.gameRunning) {
requestAnimationFrame(() => this.animate());
return;
}

```
this.update();
this.draw();
requestAnimationFrame(() => this.animate());
```

}
}
