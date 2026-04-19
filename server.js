const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingInterval: 25000, pingTimeout: 60000 });

app.use(express.static(path.join(__dirname)));

// Oyun yapıları
const rooms = new Map(); // roomId -> { players, settings, gameState, adminId, password, roles, etc }

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Roller
const ROLES = {
    MAFIA: 'mafia',
    VILLAGER: 'villager',
    DOCTOR: 'doctor',
    POLICE: 'police'
};

class GameInstance {
    constructor(roomId, adminId, password = '') {
        this.roomId = roomId;
        this.adminId = adminId;
        this.password = password;
        this.players = new Map(); // socketId -> { id, name, avatar, role, alive, voteTarget, isAdmin }
        this.gameState = 'waiting'; // waiting, night, day, vote
        this.currentPhase = null;
        this.timer = null;
        this.votes = new Map();
        this.nightActions = { mafiaKill: null, doctorSave: null, policeCheck: null };
        this.chatHistory = [];
        this.settings = { voteTime: 30, nightTime: 35, dayTime: 45 };
        this.roleDistribution = [];
    }

    addPlayer(socket, userData) {
        if (this.players.size >= 12) return false;
        const isAdmin = this.players.size === 0;
        this.players.set(socket.id, {
            id: socket.id,
            name: userData.name,
            avatar: userData.avatar,
            role: null,
            alive: true,
            voteTarget: null,
            isAdmin: isAdmin,
            socketId: socket.id
        });
        if (isAdmin) this.adminId = socket.id;
        return true;
    }

    removePlayer(socketId) {
        const wasAdmin = this.players.get(socketId)?.isAdmin;
        this.players.delete(socketId);
        if (wasAdmin && this.players.size > 0) {
            const newAdmin = this.players.values().next().value;
            newAdmin.isAdmin = true;
            this.adminId = newAdmin.id;
            return newAdmin.id;
        }
        return null;
    }

    assignRoles() {
        const playerList = Array.from(this.players.values());
        const count = playerList.length;
        let mafiaCount = Math.max(1, Math.floor(count / 3));
        let doctorCount = 1;
        let policeCount = 1;
        let villagerCount = count - (mafiaCount + doctorCount + policeCount);
        let rolesArray = [];
        for (let i=0;i<mafiaCount;i++) rolesArray.push(ROLES.MAFIA);
        for (let i=0;i<doctorCount;i++) rolesArray.push(ROLES.DOCTOR);
        for (let i=0;i<policeCount;i++) rolesArray.push(ROLES.POLICE);
        for (let i=0;i<villagerCount;i++) rolesArray.push(ROLES.VILLAGER);
        for (let i = rolesArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rolesArray[i], rolesArray[j]] = [rolesArray[j], rolesArray[i]];
        }
        playerList.forEach((p, idx) => { p.role = rolesArray[idx]; });
    }

    startGame() {
        if (this.players.size < 4) return false;
        this.assignRoles();
        this.gameState = 'night';
        this.currentPhase = 'mafiaNight';
        this.nightActions = { mafiaKill: null, doctorSave: null, policeCheck: null };
        return true;
    }
}

// SERVER SOCKET
io.on('connection', (socket) => {
    console.log('Bağlandı:', socket.id);
    let currentRoom = null;

    socket.on('userInfo', async (data) => {
        socket.userData = { name: data.name || 'Oyuncu', avatar: data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${socket.id}` };
        socket.emit('infoConfirmed');
    });

    socket.on('createRoom', ({ roomName, password }, callback) => {
        let roomId = generateRoomId();
        while (rooms.has(roomId)) roomId = generateRoomId();
        const newGame = new GameInstance(roomId, socket.id, password);
        rooms.set(roomId, newGame);
        socket.join(roomId);
        currentRoom = roomId;
        newGame.addPlayer(socket, socket.userData);
        io.to(roomId).emit('roomUpdate', { players: Array.from(newGame.players.values()).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, isAdmin: p.isAdmin, role: p.role })), adminId: newGame.adminId, roomId, settings: newGame.settings });
        callback({ success: true, roomId });
    });

    socket.on('joinRoom', ({ roomId, password }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ success: false, error: 'Oda yok' });
        if (room.password && room.password !== password) return callback({ success: false, error: 'Şifre yanlış' });
        if (room.gameState !== 'waiting') return callback({ success: false, error: 'Oyun devam ediyor' });
        socket.join(roomId);
        currentRoom = roomId;
        room.addPlayer(socket, socket.userData);
        io.to(roomId).emit('roomUpdate', { players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, isAdmin: p.isAdmin, role: p.role })), adminId: room.adminId, roomId, settings: room.settings });
        callback({ success: true });
    });

    socket.on('leaveRoom', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            const newAdmin = room.removePlayer(socket.id);
            if (room.players.size === 0) rooms.delete(currentRoom);
            else {
                io.to(currentRoom).emit('roomUpdate', { players: Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, isAdmin: p.isAdmin, role: p.role })), adminId: room.adminId });
                if (newAdmin) io.to(currentRoom).emit('adminChanged', newAdmin);
            }
            socket.leave(currentRoom);
        }
        currentRoom = null;
        socket.emit('leftRoom');
    });

    socket.on('startGame', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room && room.players.get(socket.id)?.isAdmin && room.gameState === 'waiting') {
            if (room.startGame()) {
                io.to(currentRoom).emit('gameStarted', { playersRoles: Array.from(room.players.values()).map(p => ({ id: p.id, role: p.role })) });
                runGameLoop(room);
            } else socket.emit('errorMsg', 'En az 4 oyuncu gerekli');
        }
    });

    socket.on('chatMessage', (msg) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room) {
            const player = room.players.get(socket.id);
            if (player) io.to(currentRoom).emit('newChat', { name: player.name, msg, timestamp: Date.now() });
        }
    });

    socket.on('vote', (targetId) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room && room.gameState === 'vote') {
            room.votes.set(socket.id, targetId);
            io.to(currentRoom).emit('voteUpdate', Array.from(room.votes.entries()));
        }
    });

    // Admin ayar
    socket.on('setVoteTime', (seconds) => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (room?.players.get(socket.id)?.isAdmin) room.settings.voteTime = Math.min(60, Math.max(10, seconds));
    });

    async function runGameLoop(room) {
        // Gece mafya
        room.gameState = 'night';
        room.currentPhase = 'mafia';
        io.to(room.roomId).emit('phaseChange', { phase: 'mafia_night', duration: room.settings.nightTime });
        await sleep(room.settings.nightTime * 1000);
        if (!rooms.has(room.roomId)) return;
        // Gündüz oylama
        room.gameState = 'vote';
        room.votes.clear();
        io.to(room.roomId).emit('phaseChange', { phase: 'day_vote', duration: room.settings.voteTime });
        await sleep(room.settings.voteTime * 1000);
        resolveVote(room);
        // ölüm kontrolü oyun bitmediyse tekrar gece
        if (checkGameOver(room)) return;
        runGameLoop(room);
    }

    function resolveVote(room) {
        let voteCount = new Map();
        for (let target of room.votes.values()) voteCount.set(target, (voteCount.get(target)||0)+1);
        let max = 0, eliminated = null;
        for(let [id,count] of voteCount.entries()) if(count>max){max=count;eliminated=id;}
        if(eliminated && room.players.has(eliminated)){
            room.players.get(eliminated).alive = false;
            io.to(room.roomId).emit('playerDied', { id: eliminated, name: room.players.get(eliminated).name });
        }
    }

    function checkGameOver(room){
        let aliveMafia = 0, aliveVillagers = 0;
        for(let p of room.players.values()) if(p.alive){
            if(p.role===ROLES.MAFIA) aliveMafia++;
            else aliveVillagers++;
        }
        if(aliveMafia===0) { io.to(room.roomId).emit('gameEnd', 'Köylüler kazandı!'); rooms.delete(room.roomId); return true;}
        if(aliveMafia >= aliveVillagers) { io.to(room.roomId).emit('gameEnd', 'Mafya kazandı!'); rooms.delete(room.roomId); return true;}
        return false;
    }
    function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Server ${PORT}`));
