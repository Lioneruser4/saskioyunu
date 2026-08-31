import os
import requests
import asyncio
from flask import Flask, request, jsonify
from telegram import Bot
from telegram.error import TelegramError
from flask_cors import CORS
import yt_dlp
import tempfile
import time

app = Flask(__name__)
CORS(app)

# Telegram Bot Token
BOT_TOKEN = os.environ.get('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
bot = Bot(token=BOT_TOKEN)

# İndirme ayarları
ydl_opts = {
    'format': 'bestaudio/best',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
}

@app.route('/search', methods=['GET'])
def search_youtube():
    """YouTube arama"""
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'Arama sorgusu gerekli'}), 400
    
    try:
        ydl_opts_search = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'default_search': 'ytsearch10'
        }
        
        with yt_dlp.YoutubeDL(ydl_opts_search) as ydl:
            info = ydl.extract_info(query, download=False)
            results = []
            
            entries = info.get('entries', [])
            if not entries and info.get('title'):
                entries = [info]
            
            for entry in entries[:10]:
                duration = entry.get('duration', 0)
                if duration and duration > 600:
                    continue
                    
                results.append({
                    'title': entry.get('title', 'Bilgi yok'),
                    'url': entry.get('webpage_url', ''),
                    'duration': f"{duration // 60}:{duration % 60:02d}" if duration else 'Bilinmiyor',
                    'thumbnail': entry.get('thumbnail', 'https://i.ytimg.com/vi/default/mqdefault.jpg'),
                    'type': 'audio'
                })
            
            return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/send', methods=['POST'])
def send_to_telegram():
    """İndir ve gönder"""
    data = request.json
    user_id = data.get('user_id')
    url = data.get('url')
    title = data.get('title', 'Şarkı')
    media_type = data.get('type', 'audio')
    
    if not user_id or not url:
        return jsonify({'error': 'Eksik bilgi'}), 400
    
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts_download = {
                'format': 'bestaudio/best' if media_type == 'audio' else 'best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }] if media_type == 'audio' else [],
                'outtmpl': f'{temp_dir}/%(title)s.%(ext)s',
                'quiet': True,
                'no_warnings': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts_download) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                
                if media_type == 'audio':
                    filename = filename.rsplit('.', 1)[0] + '.mp3'
                
                # Dosya boyutu kontrolü
                file_size = os.path.getsize(filename) / (1024 * 1024)  # MB
                if file_size > 50:
                    return jsonify({'error': 'Dosya çok büyük (50MB limit)'}), 400
                
                # Telegram'a gönder
                if media_type == 'audio':
                    with open(filename, 'rb') as f:
                        bot.send_audio(
                            chat_id=user_id,
                            audio=f,
                            title=title[:50],
                            performer='FullSongBot',
                            caption=f'🎵 {title[:50]}'
                        )
                else:
                    with open(filename, 'rb') as f:
                        bot.send_video(
                            chat_id=user_id,
                            video=f,
                            caption=f'🎬 {title[:50]}'
                        )
                
                return jsonify({'success': True, 'message': 'Gönderildi!'})
                
    except TelegramError as e:
        return jsonify({'error': f'Telegram hatası: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health():
    return jsonify({
        'status': 'FullSongBot çalışıyor! 🎵',
        'version': '1.0'
    })

@app.route('/webhook', methods=['POST'])
def webhook():
    """Telegram webhook (opsiyonel)"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
