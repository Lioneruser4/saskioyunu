const translations = {
    az: {
        'menu.find': 'Eşleşme bul',
        'menu.create': 'Oda kur',
        'menu.join': 'Odaya bağlan',
        'menu.bot': 'Bot ilə məşq',
        'game.playing': 'Oynanır',
        'game.waiting': 'Gözlənir',
        'game.won': 'Qazandın!',
        'game.lost': 'Uduzdun!',
        'game.turn': 'Sıra səndə',
        'game.afk': '20 saniyə gözlənilir...',
        'error.room_full': 'Oda dolu',
        'error.disconnect': 'Bağlantı kəsildi, yeniden bağlanır...'
    },
    ru: {
        'menu.find': 'Найти игру',
        'menu.create': 'Создать комнату',
        'menu.join': 'Подключиться',
        'menu.bot': 'Тренировка с ботом',
        'game.playing': 'Игра',
        'game.waiting': 'Ожидание',
        'game.won': 'Ты выиграл!',
        'game.lost': 'Ты проиграл!',
        'game.turn': 'Твой ход',
        'game.afk': 'Ожидание 20 секунд...',
        'error.room_full': 'Комната заполнена',
        'error.disconnect': 'Соединение потеряно, переподключение...'
    },
    en: {
        'menu.find': 'Find match',
        'menu.create': 'Create room',
        'menu.join': 'Join room',
        'menu.bot': 'Practice with bot',
        'game.playing': 'Playing',
        'game.waiting': 'Waiting',
        'game.won': 'You won!',
        'game.lost': 'You lost!',
        'game.turn': 'Your turn',
        'game.afk': 'Waiting 20 seconds...',
        'error.room_full': 'Room is full',
        'error.disconnect': 'Connection lost, reconnecting...'
    },
    tr: {
        'menu.find': 'Eşleşme bul',
        'menu.create': 'Oda kur',
        'menu.join': 'Odaya bağlan',
        'menu.bot': 'Bot ile alıştırma',
        'game.playing': 'Oynanıyor',
        'game.waiting': 'Bekleniyor',
        'game.won': 'Kazandın!',
        'game.lost': 'Kaybettin!',
        'game.turn': 'Sıra sende',
        'game.afk': '20 saniye bekleniyor...',
        'error.room_full': 'Oda dolu',
        'error.disconnect': 'Bağlantı koptu, yeniden bağlanıyor...'
    }
};

let currentLang = 'az';

function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });
        
        // Dil butonlarını güncelle
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
        
        localStorage.setItem('preferredLang', lang);
    }
}

// Sayfa yüklenince dili ayarla
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('preferredLang') || 'az';
    setLanguage(savedLang);
});
