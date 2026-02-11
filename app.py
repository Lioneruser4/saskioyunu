import os
import json
import asyncio
import yt_dlp
from flask import Flask, request, jsonify
from flask_cors import CORS
from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeAudio

app = Flask(__name__)
CORS(app)  # GitHub Pages'den erişim için

# === TELEGRAM BOT BİLGİLERİ ===
API_ID = 9501538
API_HASH = "adb8864f52095ff4ca53e847a9250dac"
BOT_TOKEN = "5246489165:AAGhMleCadeh3bhtje1EBPY95yn2rDKH7KE"

# === TELEGRAM İSTEMCİSİ ===
bot = TelegramClient('music_bot', API_ID, API_HASH).start(bot_token=BOT_TOKEN)

# === DOWNLOAD KLASÖRÜ ===
DOWNLOAD_DIR = 'downloads'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.route('/search', methods=['GET'])
def search():
    """YouTube'da ara veya video bilgisi getir"""
    query = request.args.get('q', '')
    
    if not query:
        return jsonify({'error': 'Arama kelimesi gerekli'}), 400
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # YouTube linki mi kontrol et
            if 'youtube.com' in query or 'youtu.be' in query:
                info = ydl.extract_info(query, download=False)
                return jsonify({
                    'title': info.get('title', ''),
                    'url': query,
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', '')
                })
            else:
                # Normal arama
                results = ydl.extract_info(f"ytsearch5:{query}", download=False)
                songs = []
                for entry in results['entries']:
                    songs.append({
                        'id': entry['id'],
                        'title': entry['title'],
                        'url': f"https://youtube.com/watch?v={entry['id']}",
                        'duration': entry.get('duration', 0),
                        'thumbnail': entry.get('thumbnail', '')
                    })
                return jsonify(songs)
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
def download():
    """MP3 indir ve Telegram'a gönder"""
    data = request.json
    url = data.get('url')
    user_id = data.get('user_id')
    chat_id = data.get('chat_id')
    
    if not url or not user_id:
        return jsonify({'error': 'URL ve User ID gerekli'}), 400
    
    try:
        # MP3 ayarları
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': f'{DOWNLOAD_DIR}/%(title)s.%(ext)s',
            'quiet': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            mp3_file = filename.replace('.webm', '.mp3').replace('.m4a', '.mp3')
            
            # Telegram'a gönder
            asyncio.run_coroutine_threadsafe(
                send_mp3(user_id, mp3_file, info['title']),
                bot.loop
            )
            
            return jsonify({
                'success': True,
                'title': info['title']
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

async def send_mp3(user_id, file_path, title):
    """MP3'ü user'e gönder"""
    try:
        await bot.send_file(
            int(user_id),
            file_path,
            caption=f"🎵 **{title}**\n\n✅ Müzik hazır! YouTube'dan indirildi.",
            attributes=[
                DocumentAttributeAudio(
                    duration=0,
                    title=title,
                    performer="YouTube Music",
                    waveform=None
                )
            ]
        )
        
        # Dosyayı sil
        try:
            os.remove(file_path)
        except:
            pass
            
    except Exception as e:
        print(f"Gönderme hatası: {e}")

if __name__ == '__main__':
    # Botu başlat
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.create_task(bot.start())
    
    # Flask'i başlat
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
