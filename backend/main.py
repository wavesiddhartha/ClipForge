import os
import uuid
import hashlib
import json
import time
from fastapi import FastAPI, HTTPException, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import utilities
from utils.downloader import download_audio, download_video
from utils.transcription import transcribe_audio
from utils.kimi_analyzer import select_viral_clips
from utils.renderer import render_clip

load_dotenv()

app = FastAPI(title="ClipForge API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage directories
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
AUDIO_DIR = os.path.join(STORAGE_DIR, "audio")
VIDEO_DIR = os.path.join(STORAGE_DIR, "video")
RENDER_DIR = os.path.join(STORAGE_DIR, "renders")

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

# Mount renders for static access
app.mount("/static/renders", StaticFiles(directory=RENDER_DIR), name="renders")

# File-based cache to survive reloads/restarts
CACHE_FILE = os.path.join(STORAGE_DIR, "cache.json")

def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache_data: dict):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache_data, f, indent=2)
    except Exception as e:
        print("Failed to save cache:", str(e))

def get_url_hash(url: str) -> str:
    return hashlib.md5(url.encode('utf-8')).hexdigest()

class TranscribeRequest(BaseModel):
    url: str

class ClipsRequest(BaseModel):
    segments: list
    num_clips: int = 3

class RenderRequest(BaseModel):
    url: str
    start: float
    end: float
    segments: list
    style: dict
    words: list = None

def bg_download_video(url: str, url_hash: str, task_video_dir: str):
    try:
        video_path = download_video(url, task_video_dir)
        cache = load_cache()
        if url_hash in cache:
            cache[url_hash]["video_path"] = video_path
            save_cache(cache)
            print(f"Background video download completed for {url_hash}")
    except Exception as e:
        print(f"Background video download failed for {url_hash}: {str(e)}")

@app.post("/api/transcribe")
async def api_transcribe(req: TranscribeRequest, background_tasks: BackgroundTasks):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="YouTube URL is required")
        
    url_hash = get_url_hash(url)
    cache = load_cache()
    
    # Check cache first
    if url_hash in cache:
        cached_res = cache[url_hash]
        if cached_res.get("video_path") and os.path.exists(cached_res["video_path"]):
            return cached_res
        
    print(f"Processing new URL: {url} (hash: {url_hash})")
    
    try:
        # 1. Download audio & convert to 48kHz mono WAV
        task_audio_dir = os.path.join(AUDIO_DIR, url_hash)
        wav_path = download_audio(url, task_audio_dir)
        
        # 2. Transcribe using NVIDIA Riva
        segments = transcribe_audio(wav_path)
        
        # 3. Download source video in background
        task_video_dir = os.path.join(VIDEO_DIR, url_hash)
        background_tasks.add_task(bg_download_video, url, url_hash, task_video_dir)
        
        # Cache results (video_path is initially None or pending)
        result = {
            "url_hash": url_hash,
            "segments": segments,
            "video_path": None,
            "wav_path": wav_path
        }
        cache[url_hash] = result
        save_cache(cache)
        
        return result
    except Exception as e:
        print("API transcription error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/select-clips")
async def api_select_clips(req: ClipsRequest):
    try:
        clips = select_viral_clips(req.segments, req.num_clips)
        return {"clips": clips}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/render-clip")
async def api_render_clip(req: RenderRequest):
    url = req.url.strip()
    url_hash = get_url_hash(url)
    cache = load_cache()
    
    if url_hash not in cache:
        raise HTTPException(status_code=404, detail="Video source not transcribed yet. Please transcribe first.")
        
    source_data = cache[url_hash]
    video_path = source_data.get("video_path")
    
    # Wait/Block up to 60 seconds if background download is still in progress
    wait_time = 0
    while (not video_path or not os.path.exists(video_path)) and wait_time < 60:
        print(f"Waiting for background video download to complete... ({wait_time}s)")
        time.sleep(2)
        wait_time += 2
        cache = load_cache()
        if url_hash in cache:
            source_data = cache[url_hash]
            video_path = source_data.get("video_path")
            
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=400, detail="Video source file is still downloading. Please wait a moment and try again.")
        
    segments = source_data["segments"]
    
    # Gather all words from all segments
    if req.words is not None:
        clip_words = req.words
    else:
        all_words = []
        for seg in segments:
            if "words" in seg:
                all_words.extend(seg["words"])
        clip_words = all_words
        
    # Output file path
    output_filename = f"clip_{uuid.uuid4().hex}.mp4"
    output_path = os.path.join(RENDER_DIR, output_filename)
    
    try:
        render_clip(
            video_path=video_path,
            start_time=req.start,
            end_time=req.end,
            words=clip_words,
            style_config=req.style,
            output_path=output_path
        )
        
        download_url = f"/static/renders/{output_filename}"
        return {
            "success": True,
            "download_url": download_url,
            "filename": output_filename
        }
    except Exception as e:
        print("API render error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
