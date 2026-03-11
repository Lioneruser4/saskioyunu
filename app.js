// Ana uygulama
const App = {
    data: {
        groups: [
            { id: '1', name: '🎮 Oyun Odası', users: 0, hasPassword: false, icon: '🎮' },
            { id: '2', name: '🎵 Müzik', users: 0, hasPassword: true, icon: '🎵' },
            { id: '3', name: '💬 Genel', users: 0, hasPassword: false, icon: '💬' },
            { id: '4', name: '🎥 Film', users: 0, hasPassword: true, icon: '🎥' }
        ],
        currentGroup: null,
        messages: [],
        users: [],
        newMessage: '',
        password: '',
        showPassword: false,
        connectionStatus: 'disconnected',
        isMuted: false,
        isDeafened: false,
        theme: 'dark',
        showGroups: false,
        myId: 'user-' + Math.random().toString(36).substr(2, 6)
    },

    socket: null,
    localStream: null,
    peers: {},

    init() {
        this.render();
        this.initSocket();
        this.initEvents();
        this.loadTheme();
    },

    initSocket() {
        this.socket = io('https://saskioyunu-1-2d6i.onrender.com');
        
        this.socket.on('connect', () => {
            console.log('Sunucuya bağlandı');
        });

        this.socket.on('user-joined', ({ userId }) => {
            this.createPeer(userId, false);
        });

        this.socket.on('room-users', ({ users }) => {
            this.data.users = users.filter(u => u !== this.data.myId);
            users.forEach(userId => {
                if (userId !== this.data.myId) {
                    this.createPeer(userId, true);
                }
            });
            this.render();
        });

        this.socket.on('user-left', ({ userId }) => {
            if (this.peers[userId]) {
                this.peers[userId].destroy();
                delete this.peers[userId];
            }
            this.data.users = this.data.users.filter(id => id !== userId);
            this.render();
        });

        this.socket.on('signal', ({ from, signal }) => {
            if (!this.peers[from]) {
                this.createPeer(from, false);
                setTimeout(() => {
                    if (this.peers[from]) {
                        this.peers[from].signal(signal);
                    }
                }, 100);
            } else {
                this.peers[from].signal(signal);
            }
        });
    },

    createPeer(targetId, initiator) {
        if (this.peers[targetId]) return;

        const peer = new SimplePeer({
            initiator,
            trickle: false,
            stream: this.localStream ? new MediaStream([this.localStream]) : null
        });

        peer.on('signal', (signal) => {
            this.socket.emit('signal', {
                to: targetId,
                from: this.data.myId,
                signal
            });
        });

        peer.on('data', (data) => {
            const msg = JSON.parse(data);
            this.data.messages.push({
                text: msg.text,
                user: targetId.substring(0, 5) + '...',
                time: new Date().toLocaleTimeString().substring(0, 5)
            });
            this.renderMessages();
        });

        peer.on('stream', (stream) => {
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play().catch(e => console.log('Ses çalınamadı'));
        });

        peer.on('connect', () => {
            this.data.connectionStatus = 'connected';
            this.render();
        });

        peer.on('close', () => {
            delete this.peers[targetId];
        });

        this.peers[targetId] = peer;
    },

    async joinGroup(group) {
        if (group.hasPassword) {
            this.data.currentGroup = group;
            this.data.showPassword = true;
            this.render();
            return;
        }
        await this.joinVoice(group);
    },

    async joinVoice(group) {
        try {
            this.data.connectionStatus = 'connecting';
            this.render();

            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true } 
            }).then(stream => stream.getAudioTracks()[0]);

            this.socket.emit('join-room', {
                roomId: group.id,
                userId: this.data.myId
            });

            this.data.currentGroup = group;
            this.data.showPassword = false;
            this.data.password = '';
            this.render();

        } catch (err) {
            this.data.connectionStatus = 'disconnected';
            this.render();
            alert('Mikrofona erişilemedi!');
        }
    },

    leaveGroup() {
        if (this.data.currentGroup) {
            this.socket.emit('leave-room', {
                roomId: this.data.currentGroup.id,
                userId: this.data.myId
            });

            Object.values(this.peers).forEach(peer => peer.destroy());
            this.peers = {};
            
            if (this.localStream) {
                this.localStream.stop();
                this.localStream = null;
            }

            this.data.currentGroup = null;
            this.data.users = [];
            this.data.messages = [];
            this.data.connectionStatus = 'disconnected';
            this.render();
        }
    },

    sendMessage(e) {
        e.preventDefault();
        if (!this.data.newMessage.trim() || !this.data.currentGroup) return;

        const message = {
            text: this.data.newMessage,
            user: 'Ben',
            time: new Date().toLocaleTimeString().substring(0, 5)
        };

        this.data.messages.push(message);
        
        // Diğer kullanıcılara gönder
        Object.values(this.peers).forEach(peer => {
            if (peer.connected) {
                peer.send(JSON.stringify({ text: this.data.newMessage }));
            }
        });

        this.data.newMessage = '';
        this.renderMessages();
    },

    toggleMute() {
        this.data.isMuted = !this.data.isMuted;
        if (this.localStream) {
            this.localStream.enabled = !this.data.isMuted;
        }
        this.render();
    },

    toggleTheme() {
        this.data.theme = this.data.theme === 'dark' ? 'light' : 'dark';
        document.body.className = this.data.theme;
        localStorage.setItem('theme', this.data.theme);
        this.render();
    },

    loadTheme() {
        const saved = localStorage.getItem('theme');
        if (saved) {
            this.data.theme = saved;
            document.body.className = saved;
        }
    },

    initEvents() {
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.data.showGroups = false;
            }
        });
    },

    render() {
        const app = document.getElementById('app');
        app.className = this.data.theme;
        
        app.innerHTML = `
            <div class="groups ${this.data.showGroups ? 'show' : ''}">
                <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="color: white;">SUNUCULAR</h3>
                    <button class="theme-btn" onclick="app.toggleTheme()">
                        ${this.data.theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
                ${this.data.groups.map(group => `
                    <div class="group-item ${this.data.currentGroup?.id === group.id ? 'active' : ''}" 
                         onclick="app.joinGroup(${JSON.stringify(group).replace(/"/g, '&quot;')})">
                        <span class="group-icon">${group.icon}</span>
                        <span>${group.name}</span>
                        ${group.hasPassword ? '<span class="lock-icon">🔒</span>' : ''}
                    </div>
                `).join('')}
            </div>

            <div class="main">
                ${this.data.currentGroup ? `
                    <div class="chat-header">
                        <div class="chat-info">
                            <h2>${this.data.currentGroup.icon} ${this.data.currentGroup.name}</h2>
                            <div class="user-count">
                                ${this.data.users.length + 1} kişi
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div class="users-list">
                                ${this.data.users.map(u => `
                                    <div class="user-badge" title="${u.substring(0, 8)}...">
                                        ${u.substring(0, 2).toUpperCase()}
                                    </div>
                                `).join('')}
                            </div>
                            <div class="status">
                                <span class="status-dot ${this.data.connectionStatus}"></span>
                                <span style="color: white; font-size: 13px;">
                                    ${this.data.connectionStatus === 'connected' ? 'Bağlı' : 
                                      this.data.connectionStatus === 'connecting' ? 'Bağlanıyor...' : 'Bağlantı Yok'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="messages" id="messages">
                        ${this.data.messages.map(msg => `
                            <div class="message">
                                <div class="message-avatar">${msg.user.substring(0, 2)}</div>
                                <div class="message-content">
                                    <div class="message-header">
                                        <span class="message-author">${msg.user}</span>
                                        <span class="message-time">${msg.time}</span>
                                    </div>
                                    <div class="message-text">${msg.text}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <form onsubmit="app.sendMessage(event)">
                        <div class="message-input">
                            <div class="input-wrapper">
                                <input type="text" 
                                       placeholder="Mesaj yaz..." 
                                       value="${this.data.newMessage}"
                                       oninput="app.data.newMessage = this.value">
                                <button type="submit" class="send-btn">Gönder</button>
                            </div>
                        </div>
                    </form>

                    <div class="voice-controls">
                        <button class="control-btn ${this.data.isMuted ? 'active' : ''}" 
                                onclick="app.toggleMute()">
                            ${this.data.isMuted ? '🔇' : '🎤'}
                        </button>
                        <button class="control-btn ${this.data.isDeafened ? 'active' : ''}" 
                                onclick="app.data.isDeafened = !app.data.isDeafened; app.render()">
                            ${this.data.isDeafened ? '🔇' : '🔊'}
                        </button>
                        <button class="join-btn leave-btn" onclick="app.leaveGroup()">
                            Ayrıl
                        </button>
                    </div>
                ` : `
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #949ba4;">
                        <div style="text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                            <h3 style="color: white; margin-bottom: 8px;">Bir gruba katıl</h3>
                            <p style="font-size: 14px;">Sohbet etmek için sol menüden bir grup seç</p>
                        </div>
                    </div>
                `}
            </div>

            ${this.data.showPassword ? `
                <div class="modal">
                    <div class="modal-content">
                        <h3>${this.data.currentGroup.icon} ${this.data.currentGroup.name}</h3>
                        <input type="password" 
                               placeholder="Grup şifresi"
                               value="${this.data.password}"
                               oninput="app.data.password = this.value">
                        <div class="modal-buttons">
                            <button class="modal-btn secondary" onclick="app.data.showPassword = false; app.render()">İptal</button>
                            <button class="modal-btn primary" onclick="app.joinVoice(app.data.currentGroup)">Katıl</button>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;

        if (this.data.currentGroup) {
            this.renderMessages();
        }
    },

    renderMessages() {
        setTimeout(() => {
            const msgs = document.getElementById('messages');
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }, 0);
    }
};

// Uygulamayı başlat
const app = Object.create(App);
app.init();
window.app = app; // Butonlar için global
