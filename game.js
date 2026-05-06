// BACKROOMS OFFLINE - 1:1 Multiplayer Simülasyonu (Local)
// Oda sistemi, yapay zeka / canavar seçimi, PUBG hareket, duvar geçilmez

(function(){
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // ------------------- AYARLAR -------------------
    let fullscreen = false;
    let currentScreen = 'menu'; // menu, game
    let activeRoom = null;      // şu an bulunduğumuz oda objesi
    let localPlayer = null;      // { id, x, y, name, isAlive, hasKey }
    
    // Tüm odalar (offline ama oda listesi tutulur -> yeni odalar eklenir)
    let allRooms = [];
    let nextRoomId = 1;
    
    // Giriş: Telegram WebView'den isim alma (demo: prompt)
    let myUserName = localStorage.getItem('backrooms_user');
    if(!myUserName){
        myUserName = prompt("Telegram kullanıcı adınız (veya takma ad):", "Oyuncu"+Math.floor(Math.random()*1000));
        if(!myUserName) myUserName = "Gizemli"+Math.floor(Math.random()*100);
        localStorage.setItem('backrooms_user', myUserName);
    }
    document.getElementById('playerNameDisplay').innerText = `👤 ${myUserName}`;

    // ------------------- Oda Yapısı -------------------
    class GameRoom {
        constructor(id, creatorName, isAIHunter, maxPlayers=10){
            this.id = id;
            this.creator = creatorName;
            this.isAIHunter = isAIHunter;   // true=AI kovalar, false=random bir oyuncu canavar olur
            this.players = [];               // { id, name, x, y, isHunter, hasKey, isAlive }
            this.maxPlayers = maxPlayers;
            this.hunterAI = isAIHunter ? new AIHunter(this) : null;
            this.keyPosition = null;         // {x, y}
            this.exitPosition = null;         // anahtar alındıktan sonra çıkış
            this.status = 'waiting';          // waiting, playing, ended
            this.walls = this.generateWalls(); // Backrooms duvar labirenti
            this.spawnPoints = this.generateSpawnPoints();
            this.generateKeyAndExit();
        }
        
        generateWalls(){
            // basit bir labirent: 50x28 grid (canvas 1280/720 -> hücre 25.6px ama grid 50x28)
            let walls = [];
            for(let i=0;i<50;i++){
                walls[i]=[];
                for(let j=0;j<28;j++){
                    // kenarlar duvar
                    if(i===0 || i===49 || j===0 || j===27) walls[i][j]=true;
                    else walls[i][j]=false;
                }
            }
            // rastgele blok duvarlar (backrooms hissi)
            for(let w=0;w<180;w++){
                let x = 2+Math.floor(Math.random()*46);
                let y = 2+Math.floor(Math.random()*24);
                walls[x][y]=true;
            }
            // koridorları açık tut
            for(let i=1;i<49;i++){
                if(!walls[i][14]) walls[i][14]=false;
                if(!walls[i][13]) walls[i][13]=false;
            }
            return walls;
        }
        
        generateSpawnPoints(){
            let points=[];
            for(let i=0;i<20;i++){
                let found=false;
                while(!found){
                    let x=5+Math.random()*40;
                    let y=4+Math.random()*20;
                    let ix=Math.floor(x), iy=Math.floor(y);
                    if(!this.walls[ix]?.[iy]){
                        points.push({x:ix+0.5, y:iy+0.5});
                        found=true;
                    }
                }
            }
            return points;
        }
        
        generateKeyAndExit(){
            // anahtar random uzak bir noktada, çıkış ise anahtarın ters tarafında
            let valid=[];
            for(let i=1;i<49;i++)
                for(let j=1;j<27;j++)
                    if(!this.walls[i][j]) valid.push({x:i+0.5, y:j+0.5});
            if(valid.length<2) return;
            let keyIdx=Math.floor(Math.random()*valid.length);
            this.keyPosition=valid[keyIdx];
            let farIdx;
            do{
                farIdx=Math.floor(Math.random()*valid.length);
            }while(Math.hypot(valid[farIdx].x-this.keyPosition.x, valid[farIdx].y-this.keyPosition.y)<12 && farIdx!==keyIdx);
            this.exitPosition=valid[farIdx];
        }
        
        addPlayer(playerId, playerName){
            if(this.players.length>=this.maxPlayers) return false;
            let spawn = this.spawnPoints[this.players.length % this.spawnPoints.length];
            let isHunter = false;
            if(!this.isAIHunter && this.players.length===0 && this.status==='waiting'){
                // ilk oyuncu random canavar seçilir? hayır, oda kurulurken canavar seçimi yapıldı. eğer isAIHunter false -> rastgele bir oyuncu canavar olacak.
                // canavar belirleme sonradan "oyun başlat"la yapılacak.
            }
            let newP = {
                id: playerId,
                name: playerName,
                x: spawn.x,
                y: spawn.y,
                isHunter: false,
                hasKey: false,
                isAlive: true,
                velocity: {x:0,y:0}
            };
            this.players.push(newP);
            if(!this.isAIHunter && this.players.length===this.maxPlayers){
                this.assignRandomHunter();
                this.startGame();
            }
            return true;
        }
        
        assignRandomHunter(){
            if(this.players.length===0) return;
            let idx = Math.floor(Math.random()*this.players.length);
            this.players[idx].isHunter = true;
        }
        
        startGame(){
            if(this.status !== 'waiting') return;
            this.status = 'playing';
            if(this.isAIHunter && this.hunterAI){
                this.hunterAI.activate();
            } else if(!this.isAIHunter && this.players.some(p=>p.isHunter===false)){
                let hunters = this.players.filter(p=>p.isHunter===true);
                if(hunters.length===0) this.assignRandomHunter();
            }
        }
        
        updateAI(deltaTime){
            if(this.isAIHunter && this.hunterAI && this.status==='playing'){
                this.hunterAI.update(deltaTime, this);
            }
        }
        
        checkCollision(px,py, playerObj){
            let gridX = Math.floor(px);
            let gridY = Math.floor(py);
            if(this.walls[gridX]?.[gridY]) return true;
            // diğer oyuncularla çarpışma (yumuşak)
            for(let p of this.players){
                if(p !== playerObj && Math.hypot(px-p.x, py-p.y) < 0.8){
                    return true;
                }
            }
            return false;
        }
        
        movePlayer(player, dx, dy, speed){
            let newX = player.x + dx*speed;
            let newY = player.y + dy*speed;
            if(!this.checkCollision(newX, player.y, player)){
                player.x = newX;
            }
            if(!this.checkCollision(player.x, newY, player)){
                player.y = newY;
            }
            // Anahtar alma
            if(this.keyPosition && Math.hypot(player.x-this.keyPosition.x, player.y-this.keyPosition.y)<0.5 && !player.hasKey && !player.isHunter){
                player.hasKey=true;
                this.keyPosition=null;
            }
            // Çıkış kontrolü
            if(this.exitPosition && player.hasKey && Math.hypot(player.x-this.exitPosition.x, player.y-this.exitPosition.y)<0.6){
                alert(`${player.name} anahtarla kaçtı! OYUNCU KAZANDI!`);
                this.status='ended';
                return true;
            }
            // Yakalanma (eğer hunter ile temas)
            for(let other of this.players){
                if(other.isHunter && other!==player && Math.hypot(player.x-other.x, player.y-other.y)<0.7){
                    if(!player.isHunter){
                        player.isAlive=false;
                        alert(`${player.name} yakalandı!`);
                        return true;
                    }
                }
                if(this.hunterAI && this.hunterAI.aiPos && !player.isHunter && Math.hypot(player.x-this.hunterAI.aiPos.x, player.y-this.hunterAI.aiPos.y)<0.7){
                    player.isAlive=false;
                    alert(`${player.name} AI tarafından yakalandı!`);
                    return true;
                }
            }
            return false;
        }
        
        draw(ctx, localPlayerId){
            // Backrooms duvar çizimi
            for(let i=0;i<50;i++){
                for(let j=0;j<28;j++){
                    if(this.walls[i][j]){
                        ctx.fillStyle = "#4a3b2c";
                        ctx.fillRect(i*25.6, j*25.6, 25.8, 25.8);
                        ctx.fillStyle = "#836e49";
                        ctx.fillRect(i*25.6+2, j*25.6+2, 21.8, 21.8);
                    } else {
                        ctx.fillStyle = "#d9c8a9";
                        ctx.fillRect(i*25.6, j*25.6, 25.8, 25.8);
                        ctx.fillStyle = "#f7e5c2";
                        ctx.fillRect(i*25.6+1, j*25.6+1, 23.8, 23.8);
                    }
                }
            }
            // Anahtar
            if(this.keyPosition){
                ctx.fillStyle="gold";
                ctx.shadowBlur=12;
                ctx.beginPath();
                ctx.arc(this.keyPosition.x*25.6, this.keyPosition.y*25.6, 12,0,Math.PI*2);
                ctx.fill();
                ctx.fillStyle="black";
                ctx.font="bold 20px monospace";
                ctx.fillText("🔑", this.keyPosition.x*25.6-10, this.keyPosition.y*25.6+8);
            }
            // Çıkış
            if(this.exitPosition){
                ctx.fillStyle="#44ff44";
                ctx.beginPath();
                ctx.rect(this.exitPosition.x*25.6-12, this.exitPosition.y*25.6-12, 24,24);
                ctx.fill();
                ctx.fillStyle="black";
                ctx.fillText("🚪", this.exitPosition.x*25.6-8, this.exitPosition.y*25.6+8);
            }
            // Oyuncular
            for(let p of this.players){
                if(!p.isAlive) continue;
                ctx.shadowBlur=0;
                ctx.fillStyle = p.isHunter ? "#ff4444" : "#44aaff";
                ctx.beginPath();
                ctx.arc(p.x*25.6, p.y*25.6, 12,0,Math.PI*2);
                ctx.fill();
                ctx.fillStyle="white";
                ctx.font="bold 14px monospace";
                ctx.fillText(p.name, p.x*25.6-20, p.y*25.6-12);
                if(p.hasKey) ctx.fillText("🔑", p.x*25.6+8, p.y*25.6-6);
            }
            // AI Hunter varsa
            if(this.hunterAI && this.hunterAI.aiPos){
                ctx.fillStyle = "#aa0000";
                ctx.beginPath();
                ctx.arc(this.hunterAI.aiPos.x*25.6, this.hunterAI.aiPos.y*25.6, 14,0,Math.PI*2);
                ctx.fill();
                ctx.fillStyle="white";
                ctx.fillText("👾 AI HUNTER", this.hunterAI.aiPos.x*25.6-25, this.hunterAI.aiPos.y*25.6-15);
            }
        }
    }
    
    class AIHunter {
        constructor(room){
            this.room=room;
            this.aiPos = null;
            this.active=false;
            this.speed=2.8;
        }
        activate(){
            this.active=true;
            let valid=[];
            for(let i=1;i<49;i++) for(let j=1;j<27;j++) if(!this.room.walls[i][j]) valid.push({x:i+0.5,y:j+0.5});
            if(valid.length) this.aiPos = valid[Math.floor(Math.random()*valid.length)];
        }
        update(delta, room){
            if(!this.active || !this.aiPos) return;
            let target = null;
            for(let p of room.players){
                if(!p.isHunter && p.isAlive){
                    target = p;
                    break;
                }
            }
            if(target){
                let dx=target.x-this.aiPos.x;
                let dy=target.y-this.aiPos.y;
                let len=Math.hypot(dx,dy);
                if(len>0.01){
                    dx/=len; dy/=len;
                    let newX=this.aiPos.x+dx*this.speed*delta;
                    let newY=this.aiPos.y+dy*this.speed*delta;
                    if(!room.checkCollision(newX, this.aiPos.y, null)) this.aiPos.x=newX;
                    if(!room.checkCollision(this.aiPos.x, newY, null)) this.aiPos.y=newY;
                }
            }
        }
    }
    
    // ------------------- Oda Yönetimi (Offline) -------------------
    function createRoom(isAI){
        let newRoom = new GameRoom(nextRoomId++, myUserName, isAI, 10);
        newRoom.addPlayer("local_"+myUserName, myUserName);
        allRooms.push(newRoom);
        activeRoom = newRoom;
        localPlayer = newRoom.players.find(p=>p.id==="local_"+myUserName);
        currentScreen = 'game';
        if(!isAI && newRoom.players.length===1) {
            // eğer canavar oyuncu ise, oyun başlatma 10 kişi olunca veya manuel start
        }
        document.getElementById('roomStatus').innerText = `🏠 Oda #${newRoom.id} (${isAI?"🤖 AI":"👤 Canavar Oyuncu"})`;
        newRoom.startGame(); // AI varsa startta hunter aktif olur
        return newRoom;
    }
    
    function joinRoom(roomId){
        let room = allRooms.find(r=>r.id===roomId);
        if(!room || room.players.length>=room.maxPlayers) return false;
        if(room.status==='ended') return false;
        room.addPlayer("local_"+myUserName, myUserName);
        activeRoom = room;
        localPlayer = room.players.find(p=>p.id==="local_"+myUserName);
        currentScreen = 'game';
        document.getElementById('roomStatus').innerText = `🏠 Oda #${room.id} (${room.isAIHunter?"🤖 AI":"🎭 PvP"})`;
        if(room.status==='waiting' && room.players.length===room.maxPlayers) room.startGame();
        if(room.isAIHunter && room.status==='waiting') room.startGame();
        return true;
    }
    
    function renderRoomsList(){
        let container = document.getElementById('roomsContainer');
        container.innerHTML='';
        for(let r of allRooms){
            let card=document.createElement('div');
            card.className='room-card';
            let hunterType = r.isAIHunter ? "🤖 Yapay Zeka" : "👤 Rastgele Canavar";
            card.innerHTML=`<div><b>📌 ${r.creator}</b><br>${hunterType} | ${r.players.length}/${r.maxPlayers}</div><div style="color:gold;">🔗 Katıl</div>`;
            card.onclick=()=>{
                if(joinRoom(r.id)){
                    document.getElementById('roomListPanel').style.display='none';
                }else alert("Oda dolu veya geçersiz");
            };
            container.appendChild(card);
        }
    }
    
    // UI Olayları
    document.getElementById('joinGameBtn').onclick=()=>{
        if(allRooms.length>0){
            joinRoom(allRooms[0].id);
        } else {
            alert("Hiç oda yok, lütfen yeni oda kurun!");
        }
    };
    document.getElementById('createRoomBtn').onclick=()=>{
        let type = confirm("🤖 Yapay Zeka kovalasın mı? (Tamam=AI, İptal=Rastgele Oyuncu Canavar)");
        createRoom(type);
    };
    document.getElementById('listRoomsBtn').onclick=()=>{
        renderRoomsList();
        document.getElementById('roomListPanel').style.display='flex';
    };
    document.getElementById('closeRoomPanel').onclick=()=>{
        document.getElementById('roomListPanel').style.display='none';
    };
    document.getElementById('fullscreenBtn').onclick=()=>{
        if(!document.fullscreenElement){
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };
    
    // ----- Hareket (PUBG mobile WASD + mobil joystick yok ama mobil dokunmatik için touch olayları)
    let keys={ArrowUp:false,ArrowDown:false,ArrowLeft:false,ArrowRight:false,w:false,s:false,a:false,d:false};
    window.addEventListener('keydown',(e)=>{
        if(keys.hasOwnProperty(e.key)) keys[e.key]=true;
    });
    window.addEventListener('keyup',(e)=>{
        if(keys.hasOwnProperty(e.key)) keys[e.key]=false;
    });
    // mobile için basit tuşlar (canvas üzerinde yön bölgesi)
    let moveVec={x:0,y:0};
    let touchActive=false;
    canvas.addEventListener('touchmove',(e)=>{
        e.preventDefault();
        let rect=canvas.getBoundingClientRect();
        let touch=e.touches[0];
        let rx=(touch.clientX-rect.left)/rect.width;
        let ry=(touch.clientY-rect.top)/rect.height;
        if(rx<0.3) moveVec.x=-1; else if(rx>0.7) moveVec.x=1; else moveVec.x=0;
        if(ry<0.3) moveVec.y=-1; else if(ry>0.7) moveVec.y=1; else moveVec.y=0;
        touchActive=true;
    });
    canvas.addEventListener('touchend',()=>{moveVec={x:0,y:0}; touchActive=false;});
    
    let lastTimestamp=0;
    function gameLoop(now){
        let delta=Math.min(0.033, (now-lastTimestamp)/1000);
        lastTimestamp=now;
        if(currentScreen==='game' && activeRoom && localPlayer && localPlayer.isAlive){
            let dx=0,dy=0;
            if(keys.ArrowUp||keys.w) dy=-1;
            if(keys.ArrowDown||keys.s) dy=1;
            if(keys.ArrowLeft||keys.a) dx=-1;
            if(keys.ArrowRight||keys.d) dx=1;
            if(touchActive){ dx=moveVec.x; dy=moveVec.y;}
            if(dx!==0 || dy!==0){
                let len=Math.hypot(dx,dy);
                dx/=len; dy/=len;
                let speed=5.0;
                let caught = activeRoom.movePlayer(localPlayer, dx, dy, speed*delta);
                if(caught){
                    currentScreen='menu';
                    activeRoom=null;
                    alert("Oyun bitti, ana menü");
                }
            }
            activeRoom.updateAI(delta);
        }
        drawAll();
        requestAnimationFrame(gameLoop);
    }
    
    function drawAll(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if(currentScreen==='game' && activeRoom){
            activeRoom.draw(ctx, localPlayer?.id);
            ctx.fillStyle="white";
            ctx.font="18px monospace";
            ctx.shadowBlur=0;
            ctx.fillText(`🔹 Hedef: Anahtarı bul (${activeRoom.keyPosition?"🏆":"🔓Kaçış kapısı"})`,20,50);
        } else {
            ctx.fillStyle="#111";
            ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle="gold";
            ctx.font="bold 36px monospace";
            ctx.fillText("BACKROOMS", canvas.width/2-130,150);
            ctx.font="20px monospace";
            ctx.fillStyle="#aaa";
            ctx.fillText("Oluştur veya oyuna katıl", canvas.width/2-140, canvas.height-100);
        }
    }
    
    // oda otomatik dolu ise yeni oda (oda kurulduğunda eklendi, ayrıca dolu ise yeni oda mekanizması)
    function autoCreateIfNeeded(){
        if(allRooms.length===0) createRoom(true);
    }
    autoCreateIfNeeded();
    
    requestAnimationFrame((t)=>{lastTimestamp=t; gameLoop(t);});
})();
