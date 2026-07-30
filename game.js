// Oyun mekanikleri ve ek özellikler
class GameManager {
    constructor() {
        this.players = [];
        this.tasks = [];
        this.deadBodies = [];
        this.gameTime = 0;
        this.maxGameTime = 300;
        this.votingInProgress = false;
    }
    
    // Katil öldürme mekaniği
    static killTarget(killer, target) {
        if (!target.alive) return false;
        
        // Öldürme animasyonu
        target.alive = false;
        target.deathPosition = target.position.clone();
        target.deathTime = Date.now();
        
        // Kan partikülleri
        for (let i = 0; i < 20; i++) {
            const particle = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            particle.position.copy(target.position);
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            );
            scene.add(particle);
            
            // Partikül animasyonu
            const animate = () => {
                if (particle.position.y < 0) {
                    scene.remove(particle);
                    return;
                }
                particle.position.add(particle.velocity);
                particle.velocity.y -= 0.01;
                requestAnimationFrame(animate);
            };
            animate();
        }
        
        // Ses efekti
        playSound('kill');
        
        // Kill cooldown
        killer.lastKill = Date.now();
        
        return true;
    }
    
    // Oylama sistemi
    static startVoting() {
        if (this.votingInProgress) return;
        this.votingInProgress = true;
        
        document.getElementById('voting-screen').style.display = 'block';
        
        let votes = new Map();
        let timeLeft = 30;
        
        const timer = setInterval(() => {
            timeLeft--;
            document.getElementById('vote-timer').textContent = `⏱️ ${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(timer);
                this.endVoting(votes);
            }
        }, 1000);
        
        // Bot oyları simülasyonu
        setTimeout(() => {
            players.forEach(bot => {
                if (bot.alive && !bot.isImpostor) {
                    const randomTarget = Math.floor(Math.random() * players.length);
                    votes.set(randomTarget, (votes.get(randomTarget) || 0) + 1);
                }
            });
        }, 5000);
    }
    
    static endVoting(votes) {
        this.votingInProgress = false;
        document.getElementById('voting-screen').style.display = 'none';
        
        // En çok oy alanı bul
        let maxVotes = 0;
        let ejectedPlayer = null;
        
        votes.forEach((count, playerIndex) => {
            if (count > maxVotes) {
                maxVotes = count;
                ejectedPlayer = playerIndex;
            }
        });
        
        if (ejectedPlayer !== null && maxVotes > players.length / 2) {
            const bot = players[ejectedPlayer];
            if (bot && bot.alive) {
                bot.alive = false;
                scene.remove(bot.mesh);
                showNotification(`Oyuncu ${ejectedPlayer + 1} atıldı! ${bot.isImpostor ? 'Katildi!' : 'Masumdu!'}`);
            }
        } else {
            showNotification('Kimse atılmadı - Eşitlik veya yetersiz oy');
        }
    }
    
    // Görev sistemi
    static completeTask(taskIndex) {
        if (taskIndex >= 0 && taskIndex < tasks.length) {
            const task = tasks[taskIndex];
            if (!task.completed) {
                task.completed = true;
                playSound('task');
                
                // Görev ilerlemesi kontrol
                const completedTasks = tasks.filter(t => t.completed).length;
                const totalTasks = tasks.length;
                
                showNotification(`✅ Görev tamamlandı! (${completedTasks}/${totalTasks})`);
                
                if (completedTasks >= totalTasks) {
                    gameOver = true;
                    showNotification('🎉 TÜM GÖREVLER TAMAMLANDI!');
                }
            }
        }
    }
}

// Global fonksiyonlar
window.startGame = startGame;
window.reportBody = reportBody;
window.castVote = castVote;

// Kill button event
document.getElementById('kill-button').addEventListener('click', () => {
    if (!isImpostor || !gameStarted || gameOver) return;
    
    // En yakın oyuncuyu bul
    let closestPlayer = null;
    let minDistance = 2; // Öldürme mesafesi
    
    players.forEach(bot => {
        if (bot.alive && !bot.isImpostor) {
            const dist = player.position.distanceTo(bot.mesh.position);
            if (dist < minDistance) {
                minDistance = dist;
                closestPlayer = bot;
            }
        }
    });
    
    if (closestPlayer) {
        GameManager.killTarget({ lastKill: 0 }, closestPlayer);
        killBot(closestPlayer, null);
    }
});

console.log('🎮 Backrooms: Among Us - Oyun Motoru Hazır!');
console.log('📋 Özellikler:');
console.log('  - 3D FPS Backrooms ortamı');
console.log('  - Among Us mekanikleri (görevler, katil modu)');
console.log('  - Mobil ve PC uyumlu kontroller');
console.log('  - Akıllı bot AI sistemi');
console.log('  - Oylama ve report sistemi');
console.log('  - Ölüm animasyonları ve partikül efektleri');
console.log('  - Mini harita');
console.log('  - Ayarlanabilir oyun parametreleri');
