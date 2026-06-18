import os
import yt_dlp
import subprocess
from dotenv import load_dotenv

load_dotenv()

FFMPEG_PATH = os.getenv("FFMPEG_PATH")

def download_audio(youtube_url: str, output_dir: str) -> str:
    """
    Downloads the audio from a YouTube video, converts it to 48kHz mono WAV,
    and returns the path to the WAV file.
    """
    os.makedirs(output_dir, exist_ok=True)
    temp_template = os.path.join(output_dir, "temp_audio.%(ext)s")
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': temp_template,
        'ffmpeg_location': FFMPEG_PATH,
        'extractor_args': {
            'youtube': {
                'player_client': ['android']
            }
        },
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
        }],
        'quiet': True,
        'no_warnings': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        # Find download path
        downloaded_temp_wav = ydl.prepare_filename(info).rsplit('.', 1)[0] + ".wav"
        
    # Now convert it to mono and 48000Hz WAV using our static ffmpeg
    final_wav_path = os.path.join(output_dir, "audio_mono_48k.wav")
    if os.path.exists(final_wav_path):
        os.remove(final_wav_path)
        
    cmd = [
        FFMPEG_PATH, "-y",
        "-i", downloaded_temp_wav,
        "-ac", "1",
        "-ar", "48000",
        final_wav_path
    ]
    
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # Clean up temp files
    if os.path.exists(downloaded_temp_wav):
        os.remove(downloaded_temp_wav)
        
    return final_wav_path

def download_video(youtube_url: str, output_dir: str) -> str:
    """
    Downloads the YouTube video (best mp4 format or best video/audio combined)
    and returns the path to the video file.
    """
    os.makedirs(output_dir, exist_ok=True)
    out_template = os.path.join(output_dir, "source_video.%(ext)s")
    
    # We want a format that contains video and audio together (typically mp4)
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
        'outtmpl': out_template,
        'ffmpeg_location': FFMPEG_PATH,
        'extractor_args': {
            'youtube': {
                'player_client': ['android']
            }
        },
        'quiet': True,
        'no_warnings': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        video_path = ydl.prepare_filename(info)
        
    return video_path
