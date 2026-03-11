/**

- VoiceChat - Improved Version
- Features: Group creation, Username memory, Better UI
- File: app.js
  */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
currentUser: null,
currentGroup: null,
groups: [
{ id: ‘g1’, name: ‘🌍 Genel’, desc: ‘Genel sohbet’, members: [], messages: [], password: null },
{ id: ‘g2’, name: ‘🎮 Gaming’, desc: ‘Oyun sohbeti’, members: [], messages: [], password: null },
{ id: ‘g3’, name: ‘💻 Teknoloji’, desc: ‘Tech talk’, members: [], messages: [], password: null },
{ id: ‘g4’, name: ‘🎵 Müzik’, desc: ‘Müzik paylaşımı’, members: [], messages: [], password: null },
{ id: ‘g5’, name: ‘🎨 Sanat’, desc: ‘Sanat & yaratıcılık’, members: [], messages: [], password: null },
],
audioState: { muted: false, deafened: false },
connectionState: ‘disconnected’,
colors: [’#E74C3C’, ‘#3498DB’, ‘#2ECC71’, ‘#F39C12’, ‘#9B59B6’, ‘#1ABC9C’, ‘#E91E63’],
};

// ============================================================================
// LOCALSTORAGE - İSİM HAFIZASI
// ============================================================================

function saveUsername(username) {
localStorage.setItem(‘voicechat_username’, username);
}

function getSavedUsername() {
return localStorage.getItem(‘voicechat_username’);
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateUserId() {
return `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateMessageId() {
return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateGroupId() {
return `g_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getRandomColor() {
return state.colors[Math.floor(Math.random() * state.colors.length)];
}

async function hashPassword(pwd) {
const encoder = new TextEncoder();
const data = encoder.encode(pwd);
const hashBuffer = await crypto.subtle.digest(‘SHA-256’, data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
return hashArray.map(b => b.toString(16).padStart(2, ‘0’)).join(’’);
}

async function verifyPassword(pwd, hash) {
const computed = await hashPassword(pwd);
return computed === hash;
}

function sanitizeText(text) {
const div = document.createElement(‘div’);
div.textContent = text;
return div.innerHTML;
}

function formatTime(timestamp) {
const date = new Date(timestamp);
return date.toLocaleTimeString(‘tr-TR’, { hour: ‘2-digit’, minute: ‘2-digit’ });
}

function isValidUsername(username) {
return username.length >= 3 && username.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(username);
}

function isValidGroupName(name) {
return name.length >= 3 && name.length <= 50;
}

// ============================================================================
// UI ELEMENTS
// ============================================================================

const ui = {
sidebar: document.getElementById(‘sidebar’),
messagesList: document.getElementById(‘messagesList’),
messageInput: document.getElementById(‘messageInput’),
sendBtn: document.getElementById(‘sendBtn’),
groupsList: document.getElementById(‘groupsList’),
groupTitle: document.getElementById(‘groupTitle’),
groupDesc: document.getElementById(‘groupDesc’),
userAvatar: document.getElementById(‘userAvatar’),
userName: document.getElementById(‘userName’),
membersList: document.getElementById(‘membersList’),
muteBtn: document.getElementById(‘muteBtn’),
speakerBtn: document.getElementById(‘speakerBtn’),
statusDot: document.getElementById(‘statusDot’),
statusText: document.getElementById(‘statusText’),

```
// Modals
loginModal: document.getElementById('loginModal'),
passwordModal: document.getElementById('passwordModal'),
settingsModal: document.getElementById('settingsModal'),
createGroupModal: document.getElementById('createGroupModal'),
usernameInput: document.getElementById('usernameInput'),
loginBtn: document.getElementById('loginBtn'),
passwordInput: document.getElementById('passwordInput'),
passwordBtn: document.getElementById('passwordBtn'),
passwordCancel: document.getElementById('passwordCancel'),
settingsBtn: document.getElementById('settingsBtn'),
createGroupBtn: document.getElementById('createGroupBtn'),
saveSettings: document.getElementById('saveSettings'),
closeSettings: document.getElementById('closeSettings'),
settingsUsername: document.getElementById('settingsUsername'),
passwordTitle: document.getElementById('passwordTitle'),
newGroupName: document.getElementById('newGroupName'),
newGroupDesc: document.getElementById('newGroupDesc'),
newGroupPassword: document.getElementById('newGroupPassword'),
createGroupBtn2: document.getElementById('createGroupBtn2'),
closeCreateGroup: document.getElementById('closeCreateGroup'),
logoutBtn: document.getElementById('logoutBtn'),
```

};

// ============================================================================
// LOGIN & USER MANAGEMENT
// ============================================================================

function showLoginModal() {
const saved = getSavedUsername();

```
ui.loginModal.classList.add('show');
ui.usernameInput.focus();

if (saved) {
    ui.usernameInput.value = saved;
} else {
    ui.usernameInput.value = '';
}
```

}

function handleLogin() {
const username = ui.usernameInput.value.trim();

```
if (!isValidUsername(username)) {
    alert('Kullanıcı adı 3-32 karakter olmalı (a-z, 0-9, _, -)');
    return;
}

state.currentUser = {
    id: generateUserId(),
    username: username,
    color: getRandomColor(),
    status: 'online',
};

saveUsername(username);

ui.loginModal.classList.remove('show');
ui.userAvatar.style.background = state.currentUser.color;
ui.userAvatar.textContent = username.charAt(0).toUpperCase();
ui.userName.textContent = username;

setConnectionStatus('connected');
renderGroups();
```

}

function handleChangeUsername() {
const newUsername = ui.settingsUsername.value.trim();

```
if (!isValidUsername(newUsername)) {
    alert('Geçersiz kullanıcı adı');
    return;
}

state.currentUser.username = newUsername;
saveUsername(newUsername);

ui.userAvatar.textContent = newUsername.charAt(0).toUpperCase();
ui.userName.textContent = newUsername;

ui.settingsModal.classList.remove('show');

alert('✅ İsim güncellendi!');
```

}

function handleLogout() {
if (confirm(‘Çıkmak istediğinize emin misiniz?’)) {
state.currentUser = null;
state.currentGroup = null;
state.groups.forEach(g => g.messages = []);
showLoginModal();
}
}

// ============================================================================
// GROUPS
// ============================================================================

function renderGroups() {
ui.groupsList.innerHTML = state.groups
.map(group => `<button class="group-item ${state.currentGroup?.id === group.id ? 'active' : ''}" data-id="${group.id}"> ${group.name} </button>`).join(’’);

```
ui.groupsList.querySelectorAll('.group-item').forEach(btn => {
    btn.addEventListener('click', () => selectGroup(btn.dataset.id));
});
```

}

async function selectGroup(groupId) {
const group = state.groups.find(g => g.id === groupId);
if (!group) return;

```
if (group.password) {
    showPasswordModal(group);
    return;
}

enterGroup(group);
```

}

function showPasswordModal(group) {
ui.passwordTitle.textContent = `${group.name} - Şifre`;
ui.passwordInput.value = ‘’;
ui.passwordInput.focus();
ui.passwordModal.classList.add(‘show’);

```
ui.passwordBtn.onclick = async () => {
    const pwd = ui.passwordInput.value;
    const isValid = await verifyPassword(pwd, group.password);
    
    if (isValid) {
        ui.passwordModal.classList.remove('show');
        enterGroup(group);
    } else {
        alert('❌ Yanlış şifre!');
        ui.passwordInput.value = '';
        ui.passwordInput.focus();
    }
};

ui.passwordCancel.onclick = () => {
    ui.passwordModal.classList.remove('show');
};
```

}

function enterGroup(group) {
state.currentGroup = group;

```
ui.groupTitle.textContent = group.name;
ui.groupDesc.textContent = group.desc;
ui.messageInput.disabled = false;
ui.sendBtn.disabled = false;

if (!group.members.find(m => m.id === state.currentUser.id)) {
    group.members.push(state.currentUser);
}

renderMessages();
renderMembers();
renderGroups();

setTimeout(() => {
    ui.messagesList.scrollTop = ui.messagesList.scrollHeight;
}, 100);
```

}

// ============================================================================
// CREATE GROUP
// ============================================================================

function openCreateGroupModal() {
ui.createGroupModal.classList.add(‘show’);
ui.newGroupName.value = ‘’;
ui.newGroupDesc.value = ‘’;
ui.newGroupPassword.value = ‘’;
ui.newGroupName.focus();
}

async function handleCreateGroup() {
const name = ui.newGroupName.value.trim();
const desc = ui.newGroupDesc.value.trim();
const password = ui.newGroupPassword.value;

```
if (!isValidGroupName(name)) {
    alert('Grup adı en az 3 karakter olmalı');
    return;
}

let passwordHash = null;
if (password) {
    if (password.length < 4) {
        alert('Şifre en az 4 karakter olmalı');
        return;
    }
    passwordHash = await hashPassword(password);
}

const newGroup = {
    id: generateGroupId(),
    name: '✨ ' + name,
    desc: desc || 'Yeni grup',
    members: [],
    messages: [],
    password: passwordHash,
};

state.groups.push(newGroup);
ui.createGroupModal.classList.remove('show');
renderGroups();

alert(`✅ "${newGroup.name}" grubu oluşturuldu!`);
```

}

// ============================================================================
// MESSAGES
// ============================================================================

function renderMessages() {
if (!state.currentGroup) {
ui.messagesList.innerHTML = `<div class="empty-state"> <div class="empty-icon">💬</div> <div>Bir grup seçerek başlayın</div> </div>`;
return;
}

```
const messages = state.currentGroup.messages;

if (messages.length === 0) {
    ui.messagesList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👋</div>
            <div>Sohbet başlasın!</div>
            <div style="font-size: 12px; color: var(--muted);">
                💡 Konuşmaları sayfa yenilenince silinir
            </div>
        </div>
    `;
    return;
}

ui.messagesList.innerHTML = messages
    .map(msg => `
        <div class="message">
            <div class="message-avatar" style="background: ${msg.userColor}">
                ${msg.username.charAt(0).toUpperCase()}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${msg.username}</span>
                    <span class="message-time">${formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-text">${sanitizeText(msg.text)}</div>
            </div>
        </div>
    `).join('');

ui.messagesList.scrollTop = ui.messagesList.scrollHeight;
```

}

function addMessage(text) {
if (!state.currentGroup || !text.trim()) return;

```
const message = {
    id: generateMessageId(),
    userId: state.currentUser.id,
    username: state.currentUser.username,
    userColor: state.currentUser.color,
    text: text,
    timestamp: Date.now(),
};

state.currentGroup.messages.push(message);
renderMessages();
```

}

function handleSendMessage() {
const text = ui.messageInput.value;
if (!text.trim()) return;

```
addMessage(text);
ui.messageInput.value = '';
ui.messageInput.focus();
```

}

// ============================================================================
// VOICE & MEMBERS
// ============================================================================

function renderMembers() {
if (!state.currentGroup || state.currentGroup.members.length === 0) {
ui.membersList.innerHTML = `<div style="color: var(--muted); font-size: 12px; text-align: center; padding: 20px;"> Henüz kimse yok </div>`;
return;
}

```
ui.membersList.innerHTML = state.currentGroup.members
    .map(member => `
        <div class="member-item">
            <div class="member-avatar" style="background: ${member.color}">
                ${member.username.charAt(0).toUpperCase()}
            </div>
            <span class="member-name">${member.username}</span>
            ${state.audioState.muted ? '🔇' : '🎤'}
        </div>
    `).join('');
```

}

function toggleMute() {
state.audioState.muted = !state.audioState.muted;
updateVoiceButtons();
renderMembers();
}

function toggleSpeaker() {
state.audioState.deafened = !state.audioState.deafened;
updateVoiceButtons();
}

function updateVoiceButtons() {
ui.muteBtn.className = `btn-voice ${state.audioState.muted ? 'muted' : 'unmuted'}`;
ui.muteBtn.innerHTML = state.audioState.muted ? ‘🔇 <span>Mic</span>’ : ‘🎤 <span>Mic</span>’;

```
ui.speakerBtn.className = `btn-voice ${state.audioState.deafened ? 'muted' : 'unmuted'}`;
ui.speakerBtn.innerHTML = state.audioState.deafened ? '🔕 <span>Ses</span>' : '🔊 <span>Ses</span>';
```

}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

function setConnectionStatus(status) {
state.connectionState = status;

```
ui.statusDot.className = `status-dot ${status}`;

const statusText = {
    'connecting': 'Bağlanıyor...',
    'connected': 'Bağlı',
    'disconnected': 'Bağlı Değil',
};

ui.statusText.textContent = statusText[status] || status;
```

}

setInterval(() => {
if (state.currentUser && Math.random() > 0.95) {
const statuses = [‘connected’, ‘connecting’, ‘connected’];
const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
setConnectionStatus(randomStatus);

```
    setTimeout(() => setConnectionStatus('connected'), 2000);
}
```

}, 5000);

// ============================================================================
// SETTINGS
// ============================================================================

function openSettings() {
ui.settingsUsername.value = state.currentUser.username;
ui.settingsModal.classList.add(‘show’);
ui.settingsUsername.focus();
}

function closeSettings() {
ui.settingsModal.classList.remove(‘show’);
}

async function initAudioDevices() {
try {
const devices = await navigator.mediaDevices.enumerateDevices();
const audioInputs = devices.filter(d => d.kind === ‘audioinput’);
const audioOutputs = devices.filter(d => d.kind === ‘audiooutput’);

```
    console.log('Audio devices found:', audioInputs.length, audioOutputs.length);
} catch (err) {
    console.log('Audio device enumeration:', err.message);
}
```

}

// ============================================================================
// RESPONSIVE
// ============================================================================

function setupResponsive() {
const header = document.querySelector(’.header’);
const hamburger = document.createElement(‘button’);
hamburger.className = ‘hamburger’;
hamburger.innerHTML = ‘☰’;
hamburger.onclick = () => {
ui.sidebar.classList.toggle(‘show’);
};
header.insertBefore(hamburger, header.firstChild);

```
if (window.innerWidth < 768) {
    ui.groupsList.addEventListener('click', () => {
        setTimeout(() => ui.sidebar.classList.remove('show'), 200);
    });
}
```

}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

ui.loginBtn.addEventListener(‘click’, handleLogin);
ui.usernameInput.addEventListener(‘keypress’, (e) => {
if (e.key === ‘Enter’) handleLogin();
});

ui.messageInput.addEventListener(‘keypress’, (e) => {
if (e.key === ‘Enter’) handleSendMessage();
});
ui.sendBtn.addEventListener(‘click’, handleSendMessage);

ui.muteBtn.addEventListener(‘click’, toggleMute);
ui.speakerBtn.addEventListener(‘click’, toggleSpeaker);

ui.settingsBtn.addEventListener(‘click’, openSettings);
ui.saveSettings.addEventListener(‘click’, handleChangeUsername);
ui.closeSettings.addEventListener(‘click’, closeSettings);

ui.createGroupBtn.addEventListener(‘click’, openCreateGroupModal);
ui.createGroupBtn2.addEventListener(‘click’, handleCreateGroup);
ui.closeCreateGroup.addEventListener(‘click’, () => {
ui.createGroupModal.classList.remove(‘show’);
});

ui.newGroupName.addEventListener(‘keypress’, (e) => {
if (e.key === ‘Enter’) handleCreateGroup();
});

ui.logoutBtn.addEventListener(‘click’, handleLogout);

ui.settingsModal.addEventListener(‘click’, (e) => {
if (e.target === ui.settingsModal) {
closeSettings();
}
});

ui.createGroupModal.addEventListener(‘click’, (e) => {
if (e.target === ui.createGroupModal) {
ui.createGroupModal.classList.remove(‘show’);
}
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
console.log(‘🎧 VoiceChat v2.0 - Improved’);
initAudioDevices();
setupResponsive();

```
const saved = getSavedUsername();
if (saved && isValidUsername(saved)) {
    ui.usernameInput.value = saved;
    ui.loginModal.classList.add('show');
} else {
    showLoginModal();
}
```

}

if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, init);
} else {
init();
}

// ============================================================================
// KEEP-ALIVE PING (For Server)
// ============================================================================

const SIGNALING_SERVER = ‘https://your-server.onrender.com’; // Update this!

function startServerKeepAlive() {
// Only if server URL is configured
if (!SIGNALING_SERVER || SIGNALING_SERVER === ‘https://your-server.onrender.com’) {
console.log(‘ℹ️ Server keep-alive disabled (not configured)’);
return;
}

```
let pingCount = 0;

setInterval(async () => {
    try {
        const response = await fetch(`${SIGNALING_SERVER}/health`, {
            method: 'GET',
            headers: { 'User-Agent': 'VoiceChat-Client' }
        });
        
        if (response.ok) {
            const data = await response.json();
            pingCount++;
            console.log(`✅ Server ping [${pingCount}]: ${data.peers} peers online`);
        }
    } catch (err) {
        console.log(`⚠️ Server ping failed: ${err.message}`);
    }
}, 30000); // Every 30 seconds

console.log('🔄 Client-side server keep-alive started (every 30 seconds)');
```

}
