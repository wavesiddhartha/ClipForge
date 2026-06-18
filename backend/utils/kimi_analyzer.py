import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
KIMI_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

def select_viral_clips(segments: list, num_clips: int = 3) -> list:
    """
    Calls Moonshot Kimi K2.6 via NVIDIA NIM to select the top N viral segments
    from a list of transcribed segments.
    """
    if not segments:
        return []
        
    # Simplify segments format for LLM context optimization
    simplified_segments = []
    for seg in segments:
        simplified_segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["transcript"]
        })
        
    prompt = f"""You are an expert video editor and social media viral growth strategist.
Analyze the following transcript segments with timestamps. Automatically identify all highly engaging, coherent, and viral-worthy moments suitable for short-form 9:16 videos (like TikToks, Reels, or Shorts).

Do not force a fixed number of clips. Instead, dynamically identify only the best moments that are genuinely high-quality and have a virality score of 7.0 or higher. You can recommend anywhere from 1 to 6 clips depending on the video's content quality.

Each clip should ideally be between 15 and 60 seconds long. Ensure the selected ranges start and end at logical sentence boundaries so they make complete sense to a viewer.

For each selected clip, provide:
1. start: The starting timestamp (float, in seconds) matching the input segments.
2. end: The ending timestamp (float, in seconds) matching the input segments.
3. hook: A catchy, short text title for the clip (1-4 words).
4. reason: A brief explanation of why this segment is viral/engaging.
5. score: A virality rating between 1.0 and 10.0.

You must return ONLY a raw JSON array of objects. Do not include markdown code block styling, and do not include any other conversational text or explanation.
JSON format:
[
  {{
    "start": 12.34,
    "end": 45.67,
    "hook": "The Secret Formula",
    "reason": "This part contains an actionable formula that triggers curiosity.",
    "score": 9.2
  }}
]

TRANSCRIPT SEGMENTS:
{json.dumps(simplified_segments, indent=2)}
"""

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "moonshotai/kimi-k2.6",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 4096,
        "temperature": 0.5,
        "top_p": 1.0
    }

    print("Requesting viral clip selection from Kimi K2.6 NIM...")
    try:
        response = requests.post(KIMI_INVOKE_URL, headers=headers, json=payload, timeout=60.0)
        if response.status_code != 200:
            raise Exception(f"Kimi API returned status {response.status_code}: {response.text}")
            
        res_json = response.json()
        content = res_json["choices"][0]["message"]["content"].strip()
        
        # Strip markdown syntax if LLM returned ```json ... ```
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
            
        clips = json.loads(content)
        print(f"Kimi selected {len(clips)} viral clips successfully.")
        return clips
    except Exception as e:
        print("Error during viral clips selection:", str(e))
        # Fallback to a default clip if something goes wrong
        duration = segments[-1]["end"] - segments[0]["start"]
        fallback_end = min(segments[0]["start"] + 30.0, segments[-1]["end"])
        return [{
            "start": round(segments[0]["start"], 2),
            "end": round(fallback_end, 2),
            "hook": "Key Highlight",
            "reason": "Fallback segment selected due to an API error.",
            "score": 8.0
        }]



def translate_text(text: str, target_lang: str) -> str:
    """
    Translates a short text line into the target language using Kimi K2.6 NIM.
    """
    if not text.strip() or target_lang == "Original":
        return text
        
    system_prompt = f"You are a translator. Translate the following text into {target_lang}. Return ONLY the exact translated text, with no quotes, explanations, or extra words."
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "moonshotai/kimi-k2.6",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "max_tokens": 512,
        "temperature": 0.2,
        "top_p": 1.0
    }

    try:
        response = requests.post(KIMI_INVOKE_URL, headers=headers, json=payload, timeout=15.0)
        if response.status_code != 200:
            return text  # Fallback to original text if translation fails
        res_json = response.json()
        translated = res_json["choices"][0]["message"]["content"].strip()
        # Clean any accidental outer quotes returned by LLM
        if (translated.startswith('"') and translated.endswith('"')) or (translated.startswith("'") and translated.endswith("'")):
            translated = translated[1:-1].strip()
        return translated if translated else text
    except Exception as e:
        print("Translation error:", str(e))
        return text


