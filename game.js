// WebSocket bağlantısı
let ws = null;
let playerId = null;
let currentRoom = null;
let myCards = [];
let gameState = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Telegram WebApp kontrolü
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.enableClosingConfirmation();
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    login();
});

function connectWebSocket() {
    const wsUrl = `wss://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket bağlantısı kuruldu');
        reconnectAttempts = 0;
        if (playerId) {
            reconnect();
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };

    ws.onclose = () => {
        console.log('WebSocket bağlantısı koptu');
        showToast('Bağlantı koptu, yeniden bağlanılıyor...', 3000);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
                reconnectAttempts++;
                connectWebSocket();
            }, 2000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket hatası:', error);
    };
}

function login() {
    let userData = {
        name: 'Guest',
        telegramId: null,
        avatar: null
    };

    if (tg && tg.initDataUnsafe?.user) {
        const tgUser = tg.initDataUnsafe.user;
        userData = {
            name: tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : ''),
            telegramId: tgUser.id.toString(),
            avatar: tgUser.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tgUser.first_name)}&background=random`
        };
        
        document.getElementById('playerName').textContent = userData.name;
        document.getElementById('playerAvatar').src = userData.avatar;
        document.getElementById('myName').textContent = userData.name;
        document.getElementById('myAvatar').src = userData.avatar;
    }

    sendMessage({
        type: 'login',
        ...userData
    });
}

function reconnect() {
    sendMessage({
        type: 'reconnect',
        playerId: playerId
    });
}

function sendMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function handleServerMessage(data) {
    console.log('Sunucudan mesaj:', data);
    
    switch(data.type) {
        case 'loginSuccess':
            playerId = data.playerId;
            showToast(`Hoş geldin, ${data.player.name}!`, 2000);
            break;
            
        case 'roomsList':
            updateRoomsList(data.rooms);
            break;
            
        case 'roomCreated':
            currentRoom = data.room;
            showMainMenu();
            showToast('Oda oluşturuldu!', 2000);
            break;
            
        case 'gameStarted':
            currentRoom = data.room;
            gameState = data.gameState;
            showGameScreen();
            updateGameBoard(data);
            showToast('Oyun başladı!', 2000);
            break;
            
        case 'cardPlayed':
            updateGameBoard(data);
            break;
            
        case 'reconnected':
            currentRoom = data.room;
            gameState = data.gameState;
            myCards = data.myCards;
            showGameScreen();
            updateGameBoard(data);
            showToast('Yeniden bağlandınız!', 2000);
            break;
            
        case 'gameOver':
            showGameOver(data.winner, data.reason);
            break;
            
        case 'error':
            showToast(data.message, 3000);
            break;
    }
}

function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function findMatch() {
    showToast('Rakip aranıyor...', 2000);
    // Otomatik eşleşme mantığı
    listRooms();
}

function showCreateRoom() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('createRoomScreen').classList.add('active');
}

function createRoom() {
    const roomName = document.getElementById('roomNameInput').value || 'Yeni Oda';
    sendMessage({
        type: 'createRoom',
        roomName: roomName
    });
}

function showLobby() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('lobbyScreen').classList.add('active');
    listRooms();
}

function listRooms() {
    sendMessage({ type: 'listRooms' });
}

function updateRoomsList(rooms) {
    const container = document.getElementById('roomsList');
    
    if (rooms.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 30px;">Açık oda yok</div>';
        return;
    }
    
    let html = '';
    rooms.forEach(room => {
        html += `
            <div class="room-item">
                <div class="room-info">
                    <span class="room-name">${room.name}</span>
                    <span class="room-creator">${room.creator} • ${room.players}/2</span>
                </div>
                <button class="join-btn" onclick="joinRoom('${room.id}')">Katıl</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function joinRoom(roomId) {
    sendMessage({
        type: 'joinRoom',
        roomId: roomId
    });
}

function playWithBot() {
    sendMessage({
        type: 'playWithBot'
    });
}

function playCard(card) {
    sendMessage({
        type: 'playCard',
        card: card
    });
}

function showGameScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameScreen').classList.add('active');
}

function showMainMenu() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('mainMenu').classList.add('active');
}

function updateGameBoard(data) {
    if (!currentRoom || !gameState) return;
    
    // Rakip kartları
    const opponentCardsDiv = document.getElementById('opponentCards');
    const opponent = currentRoom.players?.find(p => p.id !== playerId);
    
    if (opponent) {
        document.getElementById('opponentName').textContent = opponent.name || 'Bot';
        document.getElementById('opponentAvatar').src = opponent.avatar || '';
        
        // Rakibin kart sayısı kadar kart göster
        let opponentCardsHtml = '';
        const cardCount = opponent.cards?.length || (opponent.isBot ? 6 : 0);
        for (let i = 0; i < cardCount; i++) {
            opponentCardsHtml += '<div class="card face-down small"></div>';
        }
        opponentCardsDiv.innerHTML = opponentCardsHtml;
    }
    
    // Benim kartlarım
    const myCardsDiv = document.getElementById('myCards');
    if (myCards) {
        let myCardsHtml = '';
        myCards.forEach(card => {
            myCardsHtml += `
                <div class="card ${card.isRed ? 'red' : ''}" onclick="playCard(${JSON.stringify(card).replace(/"/g, '&quot;')})">
                    ${card.value}${card.suit}
                </div>
            `;
        });
        myCardsDiv.innerHTML = myCardsHtml;
    }
    
    // Koz kartı
    if (gameState.trump) {
        document.getElementById('trumpCard').innerHTML = `${gameState.trump.value}${gameState.trump.suit}`;
        document.getElementById('trumpCard').className = `trump-card ${gameState.trump.isRed ? 'red' : ''}`;
    }
    
    // Masadaki kartlar
    const tablePile = document.getElementById('tablePile');
    if (gameState.table && gameState.table.length > 0) {
        const lastCard = gameState.table[gameState.table.length - 1];
        tablePile.innerHTML = `${lastCard.card.value}${lastCard.card.suit}`;
        tablePile.className = `pile ${lastCard.card.isRed ? 'red' : ''}`;
    } else {
        tablePile.innerHTML = '🎴';
    }
}

function showGameOver(winnerId, reason) {
    const isWinner = winnerId === playerId;
    const message = isWinner ? 'Tebrikler! Kazandınız! 🎉' : 'Maalesef kaybettiniz! 😢';
    
    showToast(message, 3000);
    
    setTimeout(() => {
        showMainMenu();
    }, 3000);
}

// Dil fonksiyonları
function setLanguage(lang) {
    if (window.setLanguage) {
        window.setLanguage(lang);
    }
}
