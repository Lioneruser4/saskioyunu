const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playersList = document.getElementById('players');
const playerCountSpan = document.getElementById('player-count');
const joystickStatus = document.getElementById('joystick-status');

// Joystick elementleri
const joystickBase = document.getElementById('joystick-base');
const joystickThumb = document.getElementById('joystick-thumb');

// Socket bağlantısı (Render.com adresiniz)
const socket = io('https://saskioyunu-1-2d6i.onrender.com');

// Oyun değişkenleri
let players = {};
let myId = null;
let myPosition = { x: 400, y: 300 };
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };
let moveSpeed = 5;

// Harita elementleri (Among Us benzeri)
const mapWalls = [
    { x: 100, y: 100, w: 50, h: 150 },  // Sol üst oda
    { x: 600, y: 100, w: 50, h: 150 },  // Sağ üst oda
    { x: 100, y: 400, w: 50, h: 150 },  // Sol alt oda
    { x: 600, y: 400, w: 50, h: 150 },  // Sağ alt oda
    { x: 300, y: 250, w: 200, h: 20 }   // Koridor
];

// Socket olayları
socket.on('currentPlayers', (data) => {
    myId = data.myId;
    players = data.players;
    if (players[myId]) {
        myPosition.x = players[myId].x;
        myPosition.y = players[myId].y;
    }
    updatePlayersList();
});

socket.on('newPlayer', (newPlayer) => {
    players[newPlayer.id] = newPlayer;
    updatePlayersList();
});

socket.on('playerMoved', (playerData) => {
    if (players[playerData.id]) {
        players[playerData.id].x = playerData.x;
        players[playerData.id].y = playerData.y;
    }
});

socket.on('playerDisconnected', (playerId) => {
    delete players[playerId];
    updatePlayersList();
});

// Joystick olayları (Mouse için)
joystickThumb.addEventListener('mousedown', startJoystick);
window.addEventListener('mousemove', moveJoystick);
window.addEventListener('mouseup', endJoystick);

// Joystick olayları (Touch/Mobil için)
joystickThumb.addEventListener('touchstart', startJoystick);
window.addEventListener('touchmove', moveJoystick);
window.addEventListener('touchend', endJoystick);

function startJoystick(e) {
    e.preventDefault();
    joystickActive = true;
    updateJoystick(e);
}

function moveJoystick(e) {
    if (!joystickActive) return;
    e.preventDefault();
    updateJoystick(e);
}

function updateJoystick(e) {
    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX, clientY;
    
    if (e.type === 'touchmove' || e.type === 'touchstart') {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;
    
    // Joystick'i sınırla
    const maxDist = 45;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > maxDist) {
        deltaX = (deltaX / distance) * maxDist;
        deltaY = (deltaY / distance) * maxDist;
    }
    
    joystickThumb.style.left = (45 + deltaX) + 'px';
    joystickThumb.style.top = (45 + deltaY) + 'px';
    
    // Vektörü normalize et
    joystickVector.x = deltaX / maxDist;
    joystickVector.y = deltaY / maxDist;
    
    joystickStatus.innerText = `Durum: Hareket (X:${joystickVector.x.toFixed(2)}, Y:${joystickVector.y.toFixed(2)})`;
}

function endJoystick() {
    joystickActive = false;
    joystickThumb.style.top = '45px';
    joystickThumb.style.left = '45px';
    joystickVector = { x: 0, y: 0 };
    joystickStatus.innerText = 'Durum: Bekliyor...';
}

// Hareket güncelleme
function updateMovement() {
    if (joystickActive && myId && players[myId]) {
        // Yeni pozisyonu hesapla
        let newX = players[myId].x + (joystickVector.x * moveSpeed);
        let newY = players[myId].y + (joystickVector.y * moveSpeed);
        
        // Harita sınırları (duvarlara çarpma)
        newX = Math.max(20, Math.min(780, newX));
        newY = Math.max(20, Math.min(580, newY));
        
        // Basit duvar çarpışması
        for (let wall of mapWalls) {
            if (newX > wall.x - 15 && newX < wall.x + wall.w + 15 &&
                newY > wall.y - 15 && newY < wall.y + wall.h + 15) {
                // Çarpışma varsa hareket etme
                return;
            }
        }
        
        // Pozisyonu güncelle
        players[myId].x = newX;
        players[myId].y = newY;
        myPosition.x = newX;
        myPosition.y = newY;
        
        // Sunucuya gönder
        socket.emit('playerMovement', { x: newX, y: newY });
    }
}

// Haritayı çiz
function drawMap() {
    // Zemin
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 800, 600);
    
    // Izgara deseni
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < 800; i += 50) {
        ctx.beginPath();
        ctx.strokeStyle = '#3a3a3a';
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 600);
        ctx.stroke();
    }
    for (let i = 0; i < 600; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(800, i);
        ctx.stroke();
    }
    
    // Duvarlar (odalar)
    ctx.fillStyle = '#4a4a4a';
    for (let wall of mapWalls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        // Gölge efekti
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(wall.x + 5, wall.y + 5, wall.w, wall.h);
        ctx.fillStyle = '#4a4a4a';
    }
    
    // Görev noktaları (Among Us'taki görev yerleri)
    ctx.fillStyle = '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(150, 150, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(650, 150, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(150, 450, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(650, 450, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

// Oyuncuları çiz
function drawPlayers() {
    for (let id in players) {
        const player = players[id];
        
        // Oyuncu gövdesi
        ctx.fillStyle = player.color;
        ctx.shadowColor = player.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Vizör (Among Us'taki cam)
        ctx.fillStyle = '#87CEEB';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.ellipse(player.x + 8, player.y - 5, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // İsim
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name || `Oyuncu ${id.slice(0, 4)}`, player.x, player.y - 25);
        
        // Ben ise etiket
        if (id === myId) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// Oyuncu listesini güncelle
function updatePlayersList() {
    const playerCount = Object.keys(players).length;
    playerCountSpan.innerText = playerCount;
    
    playersList.innerHTML = '';
    for (let id in players) {
        const li = document.createElement('li');
        li.innerHTML = `<span style="color: ${players[id].color};">●</span> ${players[id].name || `Oyuncu ${id.slice(0, 4)}`} ${id === myId ? '(Sen)' : ''}`;
        playersList.appendChild(li);
    }
}

// Animasyon döngüsü
function gameLoop() {
    // Hareketi güncelle
    updateMovement();
    
    // Canvas'ı temizle
    ctx.clearRect(0, 0, 800, 600);
    
    // Haritayı çiz
    drawMap();
    
    // Oyuncuları çiz
    drawPlayers();
    
    requestAnimationFrame(gameLoop);
}

// Oyunu başlat
gameLoop();
