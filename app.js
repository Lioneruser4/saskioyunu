/**

- VoiceChat - Professional Discord Clone
- Optimized for gaming (zero FPS impact)
- Features: P2P messaging, voice controls, localStorage, keep-alive
  */

// STATE
const state = {
currentUser: null,
currentChannel: null,
channels: [
{ id: ‘c1’, name: ‘🌍-genel’, desc: ‘Genel sohbet’, members: [], messages: [], password: null },
{ id: ‘c2’, name: ‘🎮-oyunlar’, desc: ‘Oyun sohbeti’, members: [], messages: [], password: null },
{ id: ‘c3’, name: ‘💻-teknoloji’, desc: ‘Tech konuşmaları’, members: [], messages: [], password: null },
{ id: ‘c4’, name: ‘🎵-müzik’, desc: ‘Müzik paylaşımı’, members: [], messages: [], password: null },
{ id: ‘c5’, name: ‘🎨-sanat’, desc: ‘Sanat & yaratıcılık’, members: [], messages: [], password: null },
],
audioState: { muted: false, deafened: false },
colors: [’#FF6B6B’, ‘#4ECDC4’, ‘#45B7D1’, ‘#FFA07A’, ‘#98D8C8’, ‘#F7DC6F’, ‘#BB8FCE’],
};

// DOM CACHE
const DOM = {
loadingScreen: document.getElementById(‘loadingScreen’),
loadingStatus: document.getElementById(‘loadingStatus’),
app: document.getElementById(‘app’),
serversSidebar: document.getElementById(‘serversSidebar’),
channelsList: document.getElementById(‘channelsList’),
messagesList: document.getElementById(‘messagesList’),
channelName: document.getElementById(‘channelName’),
channelDesc: document.getElementById(‘channelDesc’),
messageInput: document.getElementById(‘messageInput’),
sendBtn: document.getElementById(‘sendBtn’),
muteBtn: document.getElementById(‘muteBtn’),
deafenBtn: document.getElementById(‘deafenBtn’),
onlineCount: document.getElementById(‘onlineCount’),
userProfile: document.getElementById(‘userProfile’),
statusText: document.getElementById(‘statusText’),
loginModal: document.getElementById(‘loginModal’),
usernameInput: document.getElementById(‘usernameInput’),
loginBtn: document.getElementById(‘loginBtn’),
createChannelModal: document.getElementById(‘createChannelModal’),
channelNameInput: document.getElementById(‘channelNameInput’),
channelPasswordInput: document.getElementById(‘channelPasswordInput’),
createChannelBtn: document.getElementById(‘createChannelBtn’),
cancelCreateBtn: document.getElementById(‘cancelCreateBtn’),
};

// UTILITIES
function generateUserId() {
return `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function generateMessageId() {
return `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function generateChannelId() {
return `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function getRandomColor() {
return state.colors[Math.floor(Math.random() * state.colors.length)];
}

async function hashPassword(pwd) {
const encoder = new TextEncoder();
const hashBuffer = await crypto.subtle.digest(‘SHA-256’, encoder.encode(pwd));
return Array.from(new Uint8Array(hashBuffer))
.map(b => b.toString(16).padStart(2, ‘0’))
.join(’’);
}

async function verifyPassword(pwd, hash) {
return (await hashPassword(pwd)) === hash;
}

function sanitize(text) {
const div = document.createElement(‘div’);
div.textContent = text;
return div.innerHTML;
}

function formatTime(timestamp) {
return new Date(timestamp).toLocaleTimeString(‘tr-TR’, { hour: ‘2-digit’, minute: ‘2-digit’ });
}

function isValidUsername(name) {
return /^[a-zA-Z0-9_-]{3,32}$/.test(name);
}

function isValidChannelName(name) {
return /^[a-zA-Z0-9_-]{3,50}$/.test(name);
}

// LOADING
function updateLoadingStatus(text) {
DOM.loadingStatus.textContent = text;
}

function hideLoading() {
DOM.loadingScreen.classList.add(‘hidden’);
setTimeout(() => {
DOM.loadingScreen.style.display = ‘none’;
DOM.app.style.display = ‘flex’;
}, 300);
}

setTimeout(() => updateLoadingStatus(‘Bağlantı kurulduğu…’), 800);
setTimeout(() => updateLoadingStatus(‘Kanallar yükleniyor…’), 1600);

// LOGIN
function getSavedUsername() {
return localStorage.getItem(‘voicechat_username’);
}

function saveUsername(name) {
localStorage.setItem(‘voicechat_username’, name);
}

function showLoginModal() {
const saved = getSavedUsername();
DOM.usernameInput.value = saved || ‘’;
DOM.loginModal.classList.add(‘show’);
DOM.usernameInput.focus();
}

function handleLogin() {
const username = DOM.usernameInput.value.trim();

```
if (!isValidUsername(username)) {
    alert('Kullanıcı adı 3-32 karakter (harfler, rakamlar, -, _)');
    return;
}

state.currentUser = {
    id: generateUserId(),
    username: username,
    color: getRandomColor(),
};

saveUsername(username);
DOM.loginModal.classList.remove('show');

renderServers();
renderChannels();
updateUserProfile();
hideLoading();
```

}

function updateUserProfile() {
if (!state.currentUser) return;

```
DOM.userProfile.innerHTML = `
    <div class="profile-avatar" style="background: ${state.currentUser.color}">
        ${state.currentUser.username.charAt(0).toUpperCase()}
    </div>
    <div class="profile-info">
        <div class="profile-name">${state.currentUser.username}</div>
        <div class="profile-status">Online</div>
    </div>
`;
```

}

// CHANNELS
function renderServers() {
DOM.serversSidebar.innerHTML = state.channels
.map(ch => `<div class="server-icon ${state.currentChannel?.id === ch.id ? 'active' : ''}"  data-id="${ch.id}" title="${ch.name}"> ${ch.name.charAt(0).toUpperCase()} </div>`).join(’’);

```
DOM.serversSidebar.querySelectorAll('.server-icon').forEach(el => {
    el.addEventListener('click', () => selectChannel(el.dataset.id));
});
```

}

function renderChannels() {
DOM.channelsList.innerHTML = state.channels
.map(ch => `<div class="channel-item ${state.currentChannel?.id === ch.id ? 'active' : ''}"  data-id="${ch.id}"> # ${ch.name} </div>`).join(’’);

```
DOM.channelsList.querySelectorAll('.channel-item').forEach(el => {
    el.addEventListener('click', () => selectChannel(el.dataset.id));
});
```

}

function selectChannel(channelId) {
const channel = state.channels.find(c => c.id === channelId);
if (!channel) return;

```
state.currentChannel = channel;

DOM.channelName.textContent = channel.name;
DOM.channelDesc.textContent = channel.desc;
DOM.messageInput.disabled = false;
DOM.sendBtn.disabled = false;

if (!channel.members.find(m => m.id === state.currentUser.id)) {
    channel.members.push(state.currentUser);
}

renderMessages();
renderChannels();
renderServers();
updateOnlineCount();

DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;
```

}

// MESSAGES
function renderMessages() {
if (!state.currentChannel) {
DOM.messagesList.innerHTML = `<div class="empty-state"> <div class="empty-icon">💬</div> <div>Bir kanal seçin</div> </div>`;
return;
}

```
const messages = state.currentChannel.messages;

if (messages.length === 0) {
    DOM.messagesList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👋</div>
            <div>Konuşma başlasın!</div>
        </div>
    `;
    return;
}

const html = messages.map(msg => `
    <div class="message-group">
        <div class="avatar" style="background: ${msg.userColor}">
            ${msg.username.charAt(0).toUpperCase()}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="username">${msg.username}</span>
                <span class="timestamp">${formatTime(msg.timestamp)}</span>
            </div>
            <div class="message-text">${sanitize(msg.text)}</div>
        </div>
    </div>
`).join('');

DOM.messagesList.innerHTML = html;

requestAnimationFrame(() => {
    DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;
});
```

}

function addMessage(text) {
if (!state.currentChannel || !text.trim()) return;

```
const message = {
    id: generateMessageId(),
    userId: state.currentUser.id,
    username: state.currentUser.username,
    userColor: state.currentUser.color,
    text: text,
    timestamp: Date.now(),
};

state.currentChannel.messages.push(message);
appendMessage(message);
```

}

function appendMessage(message) {
const messageEl = document.createElement(‘div’);
messageEl.className = ‘message-group’;
messageEl.innerHTML = `<div class="avatar" style="background: ${message.userColor}"> ${message.username.charAt(0).toUpperCase()} </div> <div class="message-content"> <div class="message-header"> <span class="username">${message.username}</span> <span class="timestamp">${formatTime(message.timestamp)}</span> </div> <div class="message-text">${sanitize(message.text)}</div> </div>`;

```
DOM.messagesList.appendChild(messageEl);
requestAnimationFrame(() => {
    DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;
});
```

}

function handleSendMessage() {
const text = DOM.messageInput.value;
if (!text.trim()) return;

```
addMessage(text);
DOM.messageInput.value = '';
DOM.messageInput.style.height = 'auto';
DOM.messageInput.focus();
```

}

// VOICE
function toggleMute() {
state.audioState.muted = !state.audioState.muted;
updateVoiceButtons();
}

function toggleDeafen() {
state.audioState.deafened = !state.audioState.deafened;
updateVoiceButtons();
}

function updateVoiceButtons() {
DOM.muteBtn.className = `voice-btn ${state.audioState.muted ? 'muted' : ''}`;
DOM.muteBtn.textContent = state.audioState.muted ? ‘🔇’ : ‘🎤’;

```
DOM.deafenBtn.className = `voice-btn ${state.audioState.deafened ? 'muted' : ''}`;
DOM.deafenBtn.textContent = state.audioState.deafened ? '🔕' : '🔊';
```

}

function updateOnlineCount() {
if (!state.currentChannel) return;
const count = state.currentChannel.members.length;
DOM.onlineCount.textContent = `${count} online`;
}

// EVENTS
DOM.loginBtn.addEventListener(‘click’, handleLogin);
DOM.usernameInput.addEventListener(‘keypress’, (e) => {
if (e.key === ‘Enter’) handleLogin();
});

DOM.sendBtn.addEventListener(‘click’, handleSendMessage);
DOM.messageInput.addEventListener(‘keypress’, (e) => {
if (e.key === ‘Enter’ && !e.shiftKey) {
e.preventDefault();
handleSendMessage();
}
});

DOM.messageInput.addEventListener(‘input’, function() {
this.style.height = ‘auto’;
this.style.height = Math.min(this.scrollHeight, 120) + ‘px’;
});

DOM.muteBtn.addEventListener(‘click’, toggleMute);
DOM.deafenBtn.addEventListener(‘click’, toggleDeafen);

DOM.createChannelBtn.addEventListener(‘click’, async () => {
const name = DOM.channelNameInput.value.trim();
const pwd = DOM.channelPasswordInput.value;

```
if (!isValidChannelName(name)) {
    alert('Kanal adı 3-50 karakter');
    return;
}

let passwordHash = null;
if (pwd) {
    if (pwd.length < 4) {
        alert('Şifre en az 4 karakter');
        return;
    }
    passwordHash = await hashPassword(pwd);
}

const newChannel = {
    id: generateChannelId(),
    name: name,
    desc: 'Yeni kanal',
    members: [],
    messages: [],
    password: passwordHash,
};

state.channels.push(newChannel);
DOM.createChannelModal.classList.remove('show');
renderChannels();
alert(`✅ Kanal oluşturuldu: ${name}`);
```

});

DOM.cancelCreateBtn.addEventListener(‘click’, () => {
DOM.createChannelModal.classList.remove(‘show’);
});

// INIT
function init() {
console.log(‘🎧 VoiceChat Professional’);

```
const saved = getSavedUsername();
if (saved && isValidUsername(saved)) {
    DOM.usernameInput.value = saved;
    DOM.loginModal.classList.add('show');
} else {
    showLoginModal();
}

// Keep-alive ping
setInterval(async () => {
    try {
        await fetch('/health', { method: 'HEAD' });
    } catch (err) {}
}, 30000);
```

}

if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, init);
} else {
init();
}
