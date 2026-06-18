import requests
import json
import time

API_BASE = "http://localhost:8000"
test_url = "https://www.youtube.com/watch?v=UF8uR6Z6KLc"

def run_test():
    print("Step 1: Requesting transcription...")
    res = requests.post(f"{API_BASE}/api/transcribe", json={"url": test_url})
    if res.status_code != 200:
        print("Transcription failed:", res.text)
        return
        
    data = res.json()
    url_hash = data["url_hash"]
    segments = data["segments"]
    print("Transcription successful. URL Hash:", url_hash)
    
    # Select clips
    print("\nStep 2: Selecting clips...")
    res_clips = requests.post(f"{API_BASE}/api/select-clips", json={
        "segments": segments,
        "num_clips": 1
    })
    if res_clips.status_code != 200:
        print("Clips selection failed:", res_clips.text)
        return
        
    clips_data = res_clips.json()
    if not clips_data.get("clips"):
        print("No clips selected.")
        return
        
    clip = clips_data["clips"][0]
    print(f"Target Clip: {clip['hook']} ({clip['start']}s to {clip['end']}s)")
    
    # Ratios and scales to test
    test_cases = [
        {"aspect_ratio": "9:16", "resolution": "1080x1920", "video_scale": 1.5, "crop_offset_x": 0.2, "crop_offset_y": 0.3, "video_filter": "cool"}, 
        {"aspect_ratio": "1:1", "resolution": "1080x1080", "video_scale": 0.75, "crop_offset_x": -0.4, "crop_offset_y": 0.2, "video_filter": "warm"}, 
        {"aspect_ratio": "4:5", "resolution": "1080x1350", "video_scale": 1.0, "crop_offset_x": 0.0, "crop_offset_y": 0.0, "video_filter": "none"}, 
        {"aspect_ratio": "16:9", "resolution": "1920x1080", "video_scale": 0.5, "crop_offset_x": 0.0, "crop_offset_y": -0.5, "video_filter": "vintage"}
    ]
    
    for case in test_cases:
        ratio = case["aspect_ratio"]
        res_str = case["resolution"]
        scale = case["video_scale"]
        off_x = case["crop_offset_x"]
        off_y = case["crop_offset_y"]
        filt = case["video_filter"]
        print(f"\nTesting aspect ratio {ratio} ({res_str}) at scale {scale}x, vibe {filt} with shifts ({off_x}, {off_y})...")
        
        style = {
            "font_name": "Arial",
            "font_size": 70,
            "primary_color": "#FFFFFF",
            "highlight_color": "#FFFF00",
            "bg_color": "#000000",
            "bg_opacity": 0.5,
            "show_bg_box": True,
            "margin_v": 400,
            "uppercase": True,
            "aspect_ratio": ratio,
            "video_resolution": res_str,
            "crop_offset_x": off_x,
            "crop_offset_y": off_y,
            "video_scale": scale,
            "video_filter": filt
        }
        
        t0 = time.time()
        res_render = requests.post(f"{API_BASE}/api/render-clip", json={
            "url": test_url,
            "start": clip["start"],
            "end": clip["end"],
            "segments": segments,
            "style": style
        })
        
        print(f"Render status for {ratio}:", res_render.status_code)
        if res_render.status_code != 200:
            print("Response error:", res_render.text)
        else:
            render_data = res_render.json()
            print(f"Completed rendering in {time.time() - t0:.2f}s!")
            print("Result:", render_data)

if __name__ == "__main__":
    run_test()
