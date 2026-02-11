import os
import json
import asyncio
import yt_dlp
from flask import Flask, request, jsonify
from flask_cors import CORS
from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeAudio
import logging

# === LOGLAMA ===
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === TELEGRAM BOT ===
API_ID = 9501538
API_HASH = "adb8864f52095ff4ca53e847a9250dac"
BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE"

# === FLASK ===
app = Flask(__name__)
CORS(app)  # GitHub Pages erişimi için

# === TELEGRAM İSTEMCİSİ ===
bot = TelegramClient('music_bot_session', API_ID, API_HASH).start(bot_token=BOT_TOKEN)

# === DOWNLOAD KLASÖRÜ ===
DOWNLOAD_DIR = 'downloads'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.route('/search', methods=['GET'])
def search_youtube():
    """YouTube'da ara ve ilk sonucu döndür"""
    query = request.args.get('q')
    limit = int(request.args.get('limit', 1))
    
    if not query:
        return jsonify({'error': 'Arama kelimesi gerekli'}), 400
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'force_generic_extractor': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # YouTube linki kontrol
            if 'youtube.com' in query or 'youtu.be' in query:
                info = ydl.extract_info(query, download=False)
                return jsonify([{
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'url': query,
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', '')
                }])
            else:
                # Arama yap
                search_query = f"ytsearch{limit}:{query}"
                info = ydl.extract_info(search_query, download=False)
                
                results = []
                for entry in info.get('entries', []):
                    results.append({
                        'id': entry.get('id'),
                        'title': entry.get('title'),
                        'url': f"https://youtube.com/watch?v={entry.get('id')}",
                        'duration': entry.get('duration', 0),
                        'thumbnail': entry.get('thumbnail', '')
                    })
                
                return jsonify(results)
                
    except Exception as e:
        logger.error(f"Arama hatası: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
def download_music():
    """MP3 indir ve Telegram'a gönder"""
    data = request.json
    url = data.get('url')
    user_id = data.get('user_id')
    user_name = data.get('user_name', 'Kullanıcı')
    username = data.get('username', '')
    
    if not url or not user_id:
        return jsonify({'error': 'URL ve User ID gerekli'}), 400
    
    try:
        # MP3 indirme ayarları
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': f'{DOWNLOAD_DIR}/%(title)s.%(ext)s',
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Bilgileri al ve indir
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            mp3_file = filename.replace('.webm', '.mp3').replace('.m4a', '.mp3')
            
            # DOSYA VAR MI KONTROL ET
            if not os.path.exists(mp3_file):
                mp3_file = mp3_file.replace('.mp3', '') + '.mp3'
            
            # Telegram'a gönder
            asyncio.run_coroutine_threadsafe(
                send_mp3_to_user(user_id, mp3_file, info['title'], user_name),
                bot.loop
            )
            
            logger.info(f"İndirme başarılı: {info['title']} -> User: {user_id}")
            
            return jsonify({
                'success': True,
                'title': info['title'],
                'duration': info.get('duration', 0)
            })
            
    except Exception as e:
        logger.error(f"İndirme hatası: {e}")
        return jsonify({'error': str(e)}), 500

async def send_mp3_to_user(user_id, file_path, title, user_name):
    """MP3 dosyasını kullanıcıya gönder"""
    try:
        # Ses dosyası olarak gönder
        await bot.send_file(
            int(user_id),
            file_path,
            caption=f"🎵 **{title}**\n\n"
                   f"✅ Merhaba {user_name}! Müziğin hazır.\n"
                   f"📥 YouTube'dan indirildi.\n\n"
                   f"🎧 Keyifli dinlemeler!",
            attributes=[
                DocumentAttributeAudio(
                    duration=0,
                    title=title,
                    performer="YouTube Music",
                    waveform=None
                )
            ]
        )
        
        logger.info(f"MP3 gönderildi: {user_id}")
        
        # Dosyayı sil
        try:
            os.remove(file_path)
            logger.info(f"Dosya silindi: {file_path}")
        except Exception as e:
            logger.warning(f"Dosya silinemedi: {e}")
            
    except Exception as e:
        logger.error(f"Gönderme hatası: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Sunucu sağlık kontrolü"""
    return jsonify({
        'status': 'active',
        'service': 'Music Downloader API',
        'version': '1.0'
    })

if __name__ == '__main__':
    # Bot event loop'unu başlat
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.create_task(bot.start())
    
    # Flask'i başlat
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
