import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram import Bot
import yt_dlp

app = Flask(__name__)
CORS(app)

BOT_TOKEN = os.environ.get('BOT_TOKEN')
if not BOT_TOKEN:
    print('❌ BOT_TOKEN ayarlanmamış!')
    exit(1)

bot = Bot(token=BOT_TOKEN)

@app.route('/search', methods=['GET'])
def search_youtube():
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'Arama sorgusu gerekli'}), 400
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'default_search': 'ytsearch10'
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
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
    data = request.json
    user_id = data.get('user_id')
    url = data.get('url')
    title = data.get('title', 'Şarkı')
    media_type = data.get('type', 'audio')
    
    if not user_id or not url:
        return jsonify({'error': 'Eksik bilgi'}), 400
    
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts = {
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
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                
                if media_type == 'audio':
                    filename = filename.rsplit('.', 1)[0] + '.mp3'
                
                if media_type == 'audio':
                    with open(filename, 'rb') as f:
                        bot.send_audio(
                            chat_id=user_id,
                            audio=f,
                            title=title[:50],
                            performer='FullSongBot'
                        )
                else:
                    with open(filename, 'rb') as f:
                        bot.send_video(
                            chat_id=user_id,
                            video=f,
                            caption=f'🎬 {title[:50]}'
                        )
                
                return jsonify({'success': True, 'message': 'Gönderildi!'})
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def health():
    return jsonify({'status': 'FullSongBot çalışıyor! 🎵'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
