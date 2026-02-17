// ==================== GAME.JS ====================
let socket;
let currentUser = null;
let currentRoom = null;
let gameCanvas;
let ctx;
let gameLoop;
let characters = [];
let items = [];
let animationFrame;

// Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    gameCanvas = document.getElementById('game-canvas');
    ctx = gameCanvas.getContext('2d');
    
    // Telegram'dan giriş yap
    await loginWithTelegram();
    
    // Canvas boyutunu ayarla
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Loading ekranını kapat
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
        }, 500);
    }, 1000);
});

// Telegram ile giriş
async function loginWithTelegram() {
    try {
        let telegramId, username, avatar;
        
        if (tg && tg.initDataUnsafe?.user) {
            const user = tg.initDataUnsafe.user;
            telegramId = user.id.toString();
            username = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            avatar = `https://t.me/i/userpic/320/${user.username}.jpg` || '';
        } else {
            // Test için
            telegramId = 'test' + Math.floor(Math.random() * 1000);
            username = 'Test Kullanıcı';
            avatar = '';
        }
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId, username, avatar })
        });
        
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            updateUserInfo();
            startBonusTimer();
        }
    } catch (error) {
        console.error('Giriş hatası:', error);
    }
}

// Kullanıcı bilgilerini güncelle
function updateUserInfo() {
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-balance').textContent = currentUser.balance;
        document.getElementById('user-avatar').src = currentUser.avatar || 'https://via.placeholder.com/40';
    }
}

// Bonus zamanlayıcı
function startBonusTimer() {
    updateBonusTimer();
    setInterval(updateBonusTimer, 60000); // Her dakika güncelle
}

async function updateBonusTimer() {
    if (!currentUser) return;
    
    const response = await fetch('/api/claim-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    
    const data = await response.json();
    
    if (!data.success && data.remainingMinutes) {
        document.getElementById('bonus-timer').textContent = `⏰ ${data.remainingMinutes} dk`;
    } else {
        document.getElementById('bonus-timer').textContent = '✅ Bonus hazır';
    }
}

// Bonus al
async function claimBonus() {
    if (!currentUser) return;
    
    const response = await fetch('/api/claim-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    
    const data = await response.json();
    
    if (data.success) {
        currentUser.balance = data.newBalance;
        updateUserInfo();
        showToast('10$ kazandın! 🎉');
    } else if (data.remainingMinutes) {
        showToast(`${data.remainingMinutes} dakika sonra tekrar dene`);
    }
}

// Toast mesajı
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Rastgele odaya katıl
function joinRandomRoom() {
    // Test için örnek oda
    joinRoom('room1', 'Genel Sohbet');
}

// Oda kur
function showCreateRoom() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('create-room-screen').style.display = 'block';
}

async function createRoom() {
    const name = document.getElementById('room-name').value;
    const password = document.getElementById('room-password').value;
    
    if (!name) {
        showToast('Oda adı gerekli');
        return;
    }
    
    const roomId = 'room' + Date.now();
    joinRoom(roomId, name, true);
}

// Oda listesini göster
async function showRoomList() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('room-list-screen').style.display = 'block';
    
    // Test için örnek odalar
    const rooms = [
        { id: 'room1', name: 'Genel Sohbet', users: 5 },
        { id: 'room2', name: 'Oyun Odası', users: 3 },
        { id: 'room3', name: 'Sohbet', users: 2 }
    ];
    
    const container = document.getElementById('rooms-container');
    container.innerHTML = '';
    
    rooms.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-card';
        card.onclick = () => joinRoom(room.id, room.name);
        card.innerHTML = `
            <div class="room-name">${room.name}</div>
            <div class="room-info">
                <span>👥 ${room.users} kişi</span>
                <span>🔓 Herkese açık</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// Odaya katıl
function joinRoom(roomId, roomName, isOwner = false) {
    currentRoom = { id: roomId, name: roomName, isOwner };
    
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('room-list-screen').style.display = 'none';
    document.getElementById('create-room-screen').style.display = 'none';
    document.getElementById('room-screen').style.display = 'flex';
    
    document.getElementById('current-room-name').textContent = roomName;
    
    // Socket bağlantısı
    connectSocket();
    
    // Oyun döngüsünü başlat
    startGameLoop();
}

// Socket bağlantısı
function connectSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket bağlandı');
        
        socket.emit('join-room', {
            roomId: currentRoom.id,
            user: {
                userId: currentUser.telegramId,
                username: currentUser.username,
                avatar: currentUser.avatar
            }
        });
    });
    
    socket.on('room-users', (users) => {
        characters = users;
        updateUserCount();
    });
    
    socket.on('user-joined', (user) => {
        characters.push(user);
        updateUserCount();
    });
    
    socket.on('user-left', (userId) => {
        characters = characters.filter(c => c.userId !== userId);
        updateUserCount();
    });
    
    socket.on('character-moved', (data) => {
        const char = characters.find(c => c.userId === data.userId);
        if (char) {
            char.x = data.x;
            char.y = data.y;
        }
    });
    
    socket.on('character-pushed', (data) => {
        const char = characters.find(c => c.userId === data.targetId);
        if (char) {
            char.x = data.newX;
            char.y = data.newY;
        }
    });
    
    socket.on('new-message', (msg) => {
        addMessage(msg);
    });
    
    socket.on('private-message', (data) => {
        showToast(`📩 ${data.from}: ${data.message}`);
    });
    
    socket.on('banned', () => {
        showToast('🚫 Banlandınız!');
        leaveRoom();
    });
}

// Oda sayısını güncelle
function updateUserCount() {
    document.getElementById('room-user-count').textContent = `👥 ${characters.length}`;
}

// Mesaj ekle
function addMessage(msg) {
    const chat = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <span class="username">${msg.username}:</span>
        <span class="text">${msg.message}</span>
        <span class="time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// Mesaj gönder
function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (message && socket) {
        socket.emit('send-message', {
            roomId: currentRoom.id,
            message
        });
        input.value = '';
    }
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// Odadan çık
function leaveRoom() {
    if (socket) {
        socket.emit('leave-room', currentRoom.id);
        socket.disconnect();
    }
    
    document.getElementById('room-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
}

// Lobiye dön
function showLobby() {
    document.getElementById('room-list-screen').style.display = 'none';
    document.getElementById('create-room-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
}

// Canvas boyutlandır
function resizeCanvas() {
    if (gameCanvas) {
        const container = document.querySelector('.game-area');
        gameCanvas.width = container.clientWidth;
        gameCanvas.height = container.clientHeight;
    }
}

// Oyun döngüsü
function startGameLoop() {
    let isDragging = false;
    let selectedChar = null;
    let dragOffset = { x: 0, y: 0 };
    
    gameCanvas.addEventListener('mousedown', (e) => {
        const rect = gameCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Karakter seç
        for (let char of characters) {
            const dx = x - char.x;
            const dy = y - char.y;
            if (Math.sqrt(dx*dx + dy*dy) < 25) {
                isDragging = true;
                selectedChar = char;
                dragOffset.x = char.x - x;
                dragOffset.y = char.y - y;
                
                // Özel mesaj menüsü
                if (char.userId !== currentUser.telegramId) {
                    showUserMenu(char);
                }
                break;
            }
        }
    });
    
    gameCanvas.addEventListener('mousemove', (e) => {
        if (isDragging && selectedChar) {
            const rect = gameCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            selectedChar.x = x + dragOffset.x;
            selectedChar.y = y + dragOffset.y;
            
            // Hareketi yayınla
            if (socket) {
                socket.emit('character-move', {
                    roomId: currentRoom.id,
                    x: selectedChar.x,
                    y: selectedChar.y
                });
            }
        }
    });
    
    gameCanvas.addEventListener('mouseup', () => {
        if (isDragging && selectedChar) {
            // İtme kontrolü
            for (let char of characters) {
                if (char !== selectedChar) {
                    const dx = char.x - selectedChar.x;
                    const dy = char.y - selectedChar.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist < 50) {
                        // İtme
                        const angle = Math.atan2(dy, dx);
                        char.x += Math.cos(angle) * 10;
                        char.y += Math.sin(angle) * 10;
                        
                        if (socket) {
                            socket.emit('character-push', {
                                roomId: currentRoom.id,
                                targetId: char.userId,
                                newX: char.x,
                                newY: char.y
                            });
                        }
                    }
                }
            }
        }
        
        isDragging = false;
        selectedChar = null;
    });
    
    function draw() {
        if (!ctx || !gameCanvas) return;
        
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        
        // Grid çiz
        ctx.strokeStyle = '#0f3460';
        ctx.lineWidth = 1;
        for (let i = 0; i < gameCanvas.width; i += 50) {
            ctx.beginPath();
            ctx.strokeStyle = '#0f3460';
            ctx.lineWidth = 0.5;
            ctx.moveTo(i, 0);
            ctx.lineTo(i, gameCanvas.height);
            ctx.stroke();
        }
        for (let i = 0; i < gameCanvas.height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(gameCanvas.width, i);
            ctx.stroke();
        }
        
        // Karakterleri çiz
        characters.forEach(char => {
            drawCharacter(char);
        });
        
        animationFrame = requestAnimationFrame(draw);
    }
    
    draw();
}

// Karakter çiz
function drawCharacter(char) {
    const size = 50;
    const x = char.x || 100;
    const y = char.y || 100;
    
    // Ayakkabılar
    if (char.equipped?.shoes) {
        ctx.fillStyle = char.equipped.shoes.color;
        ctx.fillRect(x + 10, y + 40, 10, 10);
        ctx.fillRect(x + 30, y + 40, 10, 10);
    } else {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x + 10, y + 40, 10, 10);
        ctx.fillRect(x + 30, y + 40, 10, 10);
    }
    
    // Pantolon
    if (char.equipped?.pants) {
        ctx.fillStyle = char.equipped.pants.color;
    } else {
        ctx.fillStyle = '#0000FF';
    }
    ctx.fillRect(x + 10, y + 25, 30, 20);
    
    // Gövde
    if (char.equipped?.shirt) {
        ctx.fillStyle = char.equipped.shirt.color;
    } else {
        ctx.fillStyle = '#FF0000';
    }
    ctx.fillRect(x + 10, y + 10, 30, 20);
    
    // Kollar
    ctx.fillStyle = '#FFDBAD';
    ctx.fillRect(x, y + 15, 10, 15);
    ctx.fillRect(x + 40, y + 15, 10, 15);
    
    // Kafa
    if (char.avatar) {
        let img = new Image();
        img.src = char.avatar;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + 25, y + 5, 12, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x + 13, y - 7, 24, 24);
        ctx.restore();
    } else {
        ctx.fillStyle = '#FFDBAD';
        ctx.beginPath();
        ctx.arc(x + 25, y + 5, 12, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Şapka
    if (char.equipped?.hat) {
        ctx.fillStyle = char.equipped.hat.color;
        ctx.fillRect(x + 15, y - 5, 20, 8);
    }
    
    // Aksesuar
    if (char.equipped?.accessory) {
        ctx.fillStyle = char.equipped.accessory.color;
        ctx.fillRect(x + 20, y + 15, 10, 5);
    }
    
    // Admin ışığı
    if (char.userId === currentRoom?.ownerId) {
        ctx.shadowColor = 'gold';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(x + 25, y + 25, 35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // İsim
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px Arial';
    ctx.fillText(char.username, x, y - 10);
    
    // Ben ise işaret
    if (char.userId === currentUser?.telegramId) {
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(x + 40, y - 5, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Kullanıcı menüsü
function showUserMenu(char) {
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.top = '50%';
    menu.style.left = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    menu.style.background = 'white';
    menu.style.padding = '20px';
    menu.style.borderRadius = '10px';
    menu.style.boxShadow = '0 10px 40px rgba(0,0,0,0.2)';
    menu.style.zIndex = '1000';
    
    menu.innerHTML = `
        <h3>${char.username}</h3>
        <button onclick="sendPrivateMessage('${char.userId}')">💬 Sohbet Et</button>
        <button onclick="this.parentElement.remove()">Kapat</button>
    `;
    
    document.body.appendChild(menu);
}

// Özel mesaj gönder
function sendPrivateMessage(targetId) {
    const message = prompt('Mesajınız:');
    if (message && socket) {
        socket.emit('send-private-message', {
            targetId,
            message
        });
        showToast('Mesaj gönderildi');
    }
}

// Market
async function openMarket() {
    document.getElementById('market-modal').style.display = 'flex';
    await loadMarketItems();
    loadInventory();
}

function closeMarket() {
    document.getElementById('market-modal').style.display = 'none';
}

async function loadMarketItems() {
    const response = await fetch('/api/market/items');
    const data = await response.json();
    
    if (data.success) {
        items = data.items;
        filterMarket('all');
    }
}

function filterMarket(category) {
    // Kategori butonlarını güncelle
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    const filtered = category === 'all' 
        ? items 
        : items.filter(item => item.category === category);
    
    displayItems(filtered);
}

function displayItems(itemsToShow) {
    const container = document.getElementById('market-items');
    container.innerHTML = '';
    
    itemsToShow.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        
        let colorsHtml = '';
        item.colors.forEach(color => {
            colorsHtml += `<div class="item-color" style="background-color: ${color}" onclick="buyItem('${item.itemId}', '${color}')"></div>`;
        });
        
        card.innerHTML = `
            <h4>${item.name}</h4>
            ${colorsHtml}
            <div class="item-price">💰 ${item.price}$</div>
        `;
        
        container.appendChild(card);
    });
}

async function buyItem(itemId, color) {
    if (!currentUser) return;
    
    const response = await fetch('/api/market/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            telegramId: currentUser.telegramId,
            itemId,
            color
        })
    });
    
    const data = await response.json();
    
    if (data.success) {
        currentUser.balance = data.newBalance;
        updateUserInfo();
        showToast('Satın alındı!');
        loadInventory();
    } else {
        showToast(data.error);
    }
}

async function loadInventory() {
    // Inventory API'si lazım
}

function equipItem(itemId, color, category) {
    // Equip API'si lazım
}
