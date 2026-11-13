// kelimeler.js
// DİKKAT: Tüm kelimeler tam olarak 5 harflidir.

const KELIMELER = {
    tr: [
        "KALEM", "KİTAP", "BULUT", "DENİZ", "GÜNEŞ", "ÇİÇEK", "ARABA", "UÇAK", "TREN", "GEMİ",
        "ELMA", "ARMUT", "KİRAZ", "ÜZÜM", "LİMON", "MUZ", "KAVUN", "SOĞAN", "SARMISAK", "FASULYE",
        "OKUL", "SINIF", "SIRA", "TAHTA", "DEFTER", "SİLGİ", "ÇANTA", "KALEM", "BİLGİ", "BİLİM",
        "SANAT", "MÜZİK", "RESİM", "ŞİİR", "ROMAN", "HİKAYE", "TİYATRO", "SİNEMA", "DÜNYA", "ÜLKE",
        "ŞEHİR", "KÖY", "SOKAK", "CADDE", "MEYDAN", "PARK", "BAHÇE", "ORMAN", "DAĞ", "TEPE",
        "OVA", "YAYLA", "NEHİR", "GÖL", "OKYANUS", "ADA", "KIYI", "PLAJ", "HAVA", "YAĞMUR",
        "KAR", "DOLU", "SİS", "RÜZGAR", "FIRTINA", "GÖK", "YILDIZ", "GÜNEŞ", "AY", "GEZEGEN",
        "EVREN", "UZAY", "DÜNYA", "MARS", "VENÜS", "JÜPİTER", "SATÜRN", "URANÜS", "BAHAR", "YAZ",
        "GÜZ", "KIŞ", "SABA", "AKŞAM", "GECE", "BUGÜN", "YARIN", "DÜN", "HAFTA", "AY",
        "YIL", "ZAMAN", "SAAT", "DAKİKA", "SANİYE", "ASIR", "ÇAĞ", "TARİH", "GELECEK", "GEÇMİŞ"
    ],
    az: [
        "KİTAB", "QƏLƏM", "BULUD", "DƏNİZ", "GÜNƏŞ", "ÇİÇƏK", "MAŞIN", "QATAR", "GƏMİ", "ALMA",
        "ARMUD", "QARPUZ", "ÇİYƏLƏK", "ALBALI", "ÜZÜM", "LİMON", "BANAN", "QOVUN", "SOĞAN", "SARMISQ",
        "MƏKTƏB", "SİNİF", "ŞAGİRD", "MÜƏLLİM", "PART", "DAŞ", "DƏFTƏR", "POZAN", "ÇANTA", "BİLİK",
        "ELM", "SƏNƏT", "MUSİQİ", "RƏSM", "ŞEİR", "ROMAN", "HECAYƏ", "TEATR", "KİNO", "DÜNYA",
        "ÖLKƏ", "ŞƏHƏR", "KƏND", "KÜÇƏ", "MEYDAN", "PARK", "BAĞ", "MEŞƏ", "DAĞ", "TƏPƏ",
        "DÜZ", "YAYLAQ", "ÇAY", "GÖL", "OKEAN", "ADA", "SAHİL", "ÇİMƏR", "HAVA", "YAĞIŞ",
        "QAR", "DOLU", "DUMAN", "KÜLƏK", "SƏMA", "ULDUZ", "GÜNƏŞ", "AY", "PLANET", "KOSMOS",
        "FƏZA", "DÜNYA", "MARS", "VENERA", "YUPİTER", "SATURN", "URAN", "YAZ", "QİŞ", "PAYIZ",
        "BAHAR", "SƏHƏR", "AXŞAM", "GECƏ", "BUGÜN", "SABAH", "DÜNƏN", "HƏFTƏ", "AY", "İL",
        "ZAMAN", "SAAT", "DƏQİQƏ", "SANİYƏ", "ƏSR", "DÖVR", "TARİX", "GƏLƏCƏK", "KEÇMİŞ", "BURDA"
    ],
    ru: [
        "КНИГА", "РУЧКА", "ОБЛАК", "МОРЕ", "СОЛНЦЕ", "ЦВЕТОК", "МАШИНА", "ПОЕЗД", "КОРАБЛЬ", "ЯБЛОКО",
        "ГРУША", "АРБУЗ", "ВИШНЯ", "ВИНОГРАД", "ЛИМОН", "БАНАН", "ДЫНЯ", "ЛУК", "ЧЕСНОК", "ФАСОЛЬ",
        "ШКОЛА", "КЛАСС", "ПАРТА", "ДОСКА", "ТЕТРАДЬ", "ЛАСТИК", "СУМКА", "ЗНАНИЕ", "НАУКА", "МУЗЫКА",
        "РИСУНОК", "СТИХИ", "РОМАН", "РАССКАЗ", "ТЕАТР", "КИНО", "МИР", "СТРАНА", "ГОРОД", "ДЕРЕВНЯ",
        "УЛИЦА", "ПЛОЩАДЬ", "ПАРК", "САД", "ЛЕС", "ГОРА", "ХОЛМ", "РАВНИНА", "РЕКА", "ОЗЕРО",
        "ОКЕАН", "ОСТРОВ", "БЕРЕГ", "ПЛЯЖ", "ПОГОДА", "ДОЖДЬ", "СНЕГ", "ГРАД", "ТУМАН", "ВЕТЕР",
        "ШТОРМ", "НЕБО", "ЗВЕЗДА", "СОЛНЦЕ", "ЛУНА", "ПЛАНЕТА", "КОСМОС", "ЗЕМЛЯ", "МАРС", "ВЕНЕРА",
        "ЮПИТЕР", "САТУРН", "УРАН", "ВЕСНА", "ЛЕТО", "ОСЕНЬ", "ЗИМА", "УТРО", "ВЕЧЕР", "НОЧЬ",
        "СЕГОДНЯ", "ЗАВТРА", "ВЧЕРА", "НЕДЕЛЯ", "МЕСЯЦ", "ГОД", "ВРЕМЯ", "ЧАСЫ", "МИНУТА", "СЕКУНДА",
        "ВЕК", "ЭПОХА", "ИСТОРИЯ", "БУДУЩЕЕ", "ПРОШЛОЕ", "ЖИЗНЬ", "СМЕРТЬ", "ЛЮБОВЬ", "ДРУЖБА", "СЧАСТЬЕ"
    ],
    en: [
        "APPLE", "GRAPE", "PEACH", "BERRY", "LEMON", "MANGO", "MELON", "PLUM", "KIWI", "FIG",
        "HOUSE", "TABLE", "CHAIR", "CLOCK", "PHONE", "LIGHT", "WATER", "FIRE", "EARTH", "WIND",
        "BEACH", "OCEAN", "RIVER", "MOUNT", "HILL", "GRASS", "TREE", "FLOWER", "PLANT", "STONE",
        "HAPPY", "SMILE", "LAUGH", "ANGRY", "SAD", "BRAVE", "SMART", "KIND", "CALM", "MUSIC",
        "PIANO", "GUITAR", "DRUM", "SONG", "DANCE", "MOVIE", "BOOK", "STORY", "POEM", "NIGHT",
        "MORNING", "EVENING", "TODAY", "TOMORROW", "YESTERDAY", "WEEK", "MONTH", "YEAR", "TIME", "SPACE",
        "STARS", "MOON", "SUN", "EARTH", "MARS", "VENUS", "PLUTO", "COMET", "ORBIT", "TRAIN",
        "PLANE", "SHIP", "CAR", "TRUCK", "BIKE", "BOAT", "HELLO", "WORLD", "PEACE", "DREAM"
    ]
};
