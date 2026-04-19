const socket = io();
let currentRoomId = null;
let currentUser = { name: '', avatar: '' };
let playersList = [];
let myId = null;
let isAdmin = false;
let voteTimerInterval = null;
let phaseTimeout = null;
let muted = false;
let audioCtx = null;

// Telegram WebView bilgileri al
async function initTelegramUser() {
    if (window.Telegram && Telegram.WebApp) {
        const webapp = Telegram.WebApp;
        webapp.ready();
        webapp.expand();
        const user = webapp.initDataUnsafe?.user;
        if (user) {
            currentUser.name = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            currentUser.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
        } else {
            currentUser.name = localStorage.getItem('mafiaName') || 'Hayran' + Math.floor(Math.random()*1000);
            currentUser.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.name}`;
        }
    } else {
        currentUser.name = localStorage.getItem('mafiaName') || 'GeceYolcusu';
        currentUser.avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.name}`;
    }
    document.getElementById('userName').innerText = currentUser.name;
    document.getElementById('userAvatar').src = currentUser.avatar;
    socket.emit('userInfo', currentUser);
}
initTelegramUser();

// UI elementler
const lobbyDiv = document.getElementById('lobbyScreen');
const gameDiv = document.getElementById('gameScreen');
const roomsListDiv = document.getElementById('roomsList');
const createBtn = document.getElementById('createRoomBtn');
const joinBtn = document.getElementById('joinRoomBtn');
const leaveBtn = document.getElementById('leaveRoomBtn');
const roomCodeSpan = document.getElementById('roomCodeDisplay');

createBtn.onclick = () => {
    let roomName = document.getElementById('roomNameInput').value || 'MafiaRoom';
    let pwd = document.getElementById('roomPassword').value;
    socket.emit('createRoom', { roomName, password: pwd }, (res) => {
        if(res.success) {
            currentRoomId = res.roomId;
            roomCodeSpan.innerText = currentRoomId;
            lobbyDiv.classList.add('hidden');
            gameDiv.classList.remove('hidden');
        } else alert('Hata');
    });
};
joinBtn.onclick = () => {
    let roomId = document.getElementById('roomNameInput').value.toUpperCase();
    let pwd = document.getElementById('roomPassword').value;
    socket.emit('joinRoom', { roomId, password: pwd }, (res) => {
        if(res.success){
            currentRoomId = roomId;
            roomCodeSpan.innerText = currentRoomId;
            lobbyDiv.classList.add('hidden');
            gameDiv.classList.remove('hidden');
        } else alert(res.error);
    });
};
leaveBtn.onclick = () => {
    socket.emit('leaveRoom');
    lobbyDiv.classList.remove('hidden');
    gameDiv.classList.add('hidden');
    currentRoomId = null;
};

// Oda güncellemesi
socket.on('roomUpdate', (data) => {
    playersList = data.players;
    myId = socket.id;
    const me = playersList.find(p=>p.id===myId);
    if(me) isAdmin = me.isAdmin;
    renderPlayers(playersList);
    if(isAdmin && data.settings) document.getElementById('actionArea').innerHTML = `<button id="startGameBtn" class="primary-btn">▶ Oyuna Başla (Admin)</button><br><label>Oy verme süresi: <input id="voteTimeInput" type="number" value="${data.settings.voteTime}" step="5"></label><button id="applyTimeBtn">Uygula</button>`;
    else document.getElementById('actionArea').innerHTML = '<span>Oyuncu listesi</span>';
    if(isAdmin){
        document.getElementById('startGameBtn')?.addEventListener('click',()=>socket.emit('startGame'));
        document.getElementById('applyTimeBtn')?.addEventListener('click',()=>{
            let val = document.getElementById('voteTimeInput').value;
            socket.emit('setVoteTime', parseInt(val));
        });
    }
});
function renderPlayers(players){
    const container = document.getElementById('playersContainer');
    container.innerHTML = players.map(p => `
        <div class="player-card ${p.alive===false ? 'dead' : ''}" data-id="${p.id}">
            <img src="${p.avatar}" width="50" style="border-radius:50%">
            <div>${p.name}</div>
            <div class="role-icon">${p.isAdmin ? '👑' : (p.role==='mafia'? '🐺':'🌾')}</div>
            ${p.alive===false ? '💀' : ''}
        </div>
    `).join('');
    if(document.querySelector('.vote-btn')) return;
    if(players.find(p=>p.id===myId)?.alive!==false) document.querySelectorAll('.player-card').forEach(card=>{
        card.onclick = ()=>{
            let targetId = card.dataset.id;
            if(targetId !== myId) socket.emit('vote', targetId);
            showAnimation('🗳️ Oy verildi!', 800);
        };
    });
}

socket.on('gameStarted', ({playersRoles}) => {
    const myRole = playersRoles.find(r=>r.id===socket.id)?.role;
    showAnimation(`🎭 Rolün: ${myRole==='mafia'? 'Mafya 🐺': myRole==='doctor'? 'Doktor 🩺': myRole==='police'? 'Polis 👮': 'Köylü 🌾'}`, 3000);
});
socket.on('phaseChange', ({phase, duration}) => {
    clearTimeout(phaseTimeout);
    document.getElementById('phaseTitle').innerText = phase === 'mafia_night' ? '🌙 Mafya Gecesi' : '☀️ Oylama Günü';
    let timeLeft = duration;
    const timerSpan = document.getElementById('timerSpan');
    const interval = setInterval(()=>{ if(timeLeft<=0) clearInterval(interval); timerSpan.innerText = `${timeLeft--}s`; }, 1000);
    showAnimation(phase === 'mafia_night' ? '🔪 Mafya uyan!' : '🗣️ Oylama başlıyor!', 1500);
});
socket.on('playerDied', ({name}) => {
    showAnimation(`💀 ${name} ÖLDÜ! 💀`, 2500);
    document.querySelectorAll('.player-card').forEach(c=>{ if(c.innerText.includes(name)) c.classList.add('dead'); });
});
socket.on('gameEnd', (msg) => { alert(msg); lobbyDiv.classList.remove('hidden'); gameDiv.classList.add('hidden'); });
socket.on('newChat', ({name, msg}) => {
    const chatDiv = document.getElementById('chatMessages');
    chatDiv.innerHTML += `<div class="message"><b>${name}:</b> ${msg}</div>`;
    chatDiv.scrollTop = chatDiv.scrollHeight;
});
document.getElementById('sendChatBtn').onclick = () => {
    let input = document.getElementById('chatInput');
    if(input.value) socket.emit('chatMessage', input.value);
    input.value='';
};
function showAnimation(text, ms){
    const overlay = document.getElementById('animationOverlay');
    const animDiv = document.getElementById('animContent');
    animDiv.innerHTML = `<div style="text-align:center"><div class="${text.includes('ÖLDÜ') ? 'death-skull' : 'waiting-spinner'}">${text.includes('ÖLDÜ')?'💀':''}</div><h2>${text}</h2></div>`;
    overlay.classList.remove('hidden');
    setTimeout(()=> overlay.classList.add('hidden'), ms);
}
// Ses kapatma simülasyonu
document.getElementById('muteAllBtn').onclick = ()=>{ muted=true; alert('Sesler kapatıldı (sim)'); };
document.getElementById('unmuteAllBtn').onclick = ()=>{ muted=false; alert('Sesler açıldı'); };
// Ping keepalive
setInterval(()=>{ socket.emit('ping'); }, 30000);
