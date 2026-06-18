import os
import subprocess
import re
from dotenv import load_dotenv
from utils.kimi_analyzer import translate_text

load_dotenv()

FFMPEG_PATH = os.getenv("FFMPEG_PATH")

def get_video_dimensions(video_path: str, ffmpeg_path: str) -> tuple[int, int]:
    """
    Runs ffmpeg -i to probe the source video stream dimensions.
    Uses regex to extract the resolution safely.
    """
    try:
        cmd = [ffmpeg_path, "-i", video_path]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        info = res.stderr.decode("utf-8", errors="ignore")
        for line in info.splitlines():
            if "Stream" in line and "Video:" in line:
                m = re.search(r",\s*(\d{2,5})x(\d{2,5})", line)
                if m:
                    return int(m.group(1)), int(m.group(2))
                m = re.search(r"\s(\d{2,5})x(\d{2,5})", line)
                if m:
                    return int(m.group(1)), int(m.group(2))
    except Exception as e:
        print("Error getting video dimensions:", e)
    return 1920, 1080 # default fallback

def hex_to_ass_color(hex_str: str, opacity: float = 1.0) -> str:
    """
    Converts a standard hex color (e.g., "#FF0000" or "FFFFFF")
    to the ASS style color format: &H[Alpha][Blue][Green][Red] (all in hex).
    """
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = "".join(c*2 for c in hex_str)
        
    r = hex_str[0:2]
    g = hex_str[2:4]
    b = hex_str[4:6]
    
    # Transparency (00 = opaque, FF = fully transparent)
    alpha = int((1.0 - opacity) * 255)
    alpha_hex = f"{alpha:02X}"
    
    return f"&H{alpha_hex}{b}{g}{r}"

def format_ass_time(seconds: float) -> str:
    """
    Formats seconds into ASS time format: H:MM:SS.cs (cs is centiseconds).
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centiseconds = int(round((seconds % 1) * 100))
    if centiseconds == 100:
        secs += 1
        centiseconds = 0
        
    return f"{hours}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"

def generate_ass_subtitles(words: list, start_time: float, end_time: float, style: dict, ass_path: str):
    """
    Generates an Advanced Substation Alpha (.ass) file with active-word highlighting.
    """
    # Filter and shift words relative to the clip start time, keeping style overrides
    clip_words = []
    for w in words:
        if w["start"] >= start_time and w["end"] <= end_time:
            word_obj = {
                "word": w["word"],
                "start": w["start"] - start_time,
                "end": w["end"] - start_time
            }
            # Copy style overrides if present
            for k in ["font", "color", "position", "bold", "italic", "font_size", "letter_spacing", "outline_thickness", "shadow_offset"]:
                if k in w:
                    word_obj[k] = w[k]
            clip_words.append(word_obj)
            
    # Group words into lines (e.g., max 4 words per line)
    lines = []
    current_line = []
    for w in clip_words:
        current_line.append(w)
        # Group by 4 words or if there is a long pause (> 1 second)
        if len(current_line) >= 4:
            lines.append(current_line)
            current_line = []
        elif len(current_line) > 1 and (w["start"] - current_line[-2]["end"] > 1.0):
            # Split due to pause
            lines.append(current_line[:-1])
            current_line = [w]
            
    if current_line:
        lines.append(current_line)
        
    # Styles config
    font_name = style.get("font_name", "Arial")
    font_size = style.get("font_size", 32)
    primary_color = hex_to_ass_color(style.get("primary_color", "#FFFFFF"), style.get("opacity", 1.0))
    highlight_color = hex_to_ass_color(style.get("highlight_color", "#FFFF00"), 1.0)
    back_color = hex_to_ass_color(style.get("bg_color", "#000000"), style.get("bg_opacity", 0.5))
    
    # BorderStyle: 3 means a background box, 1 means outline + shadow
    border_style = 3 if style.get("show_bg_box", False) else 1
    outline = style.get("outline_thickness", 2)
    shadow = style.get("shadow_offset", 1)
    letter_spacing = style.get("letter_spacing", 0)
    alignment = style.get("alignment", 2)
    
    # Position (Y-axis offset from bottom). 
    # For a 1080x1920 video, Y offset is usually around 300 to 500.
    margin_v = style.get("margin_v", 480) 
    
    # Target resolution
    video_resolution = style.get("video_resolution", "1080x1920")
    try:
        res_width, res_height = [int(v) for v in video_resolution.split("x")]
    except Exception:
        res_width, res_height = 1080, 1920

    # Header of ASS file
    ass_content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {res_width}
PlayResY: {res_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},&H000000FF,&H00000000,{back_color},-1,0,0,0,100,100,{letter_spacing},0,{border_style},{outline},{shadow},{alignment},100,100,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # Create Dialogue lines for active-word highlighting
    for line in lines:
        if not line:
            continue
            
        line_start = line[0]["start"]
        line_end = line[-1]["end"]
        
        # If subtitle translation is requested, translate this line's words
        translation_lang = style.get("translation_lang", "Original")
        if translation_lang != "Original":
            original_text = " ".join([w["word"] for w in line])
            translated_text = translate_text(original_text, translation_lang)
            translated_words = translated_text.split()
            if translated_words:
                duration = line_end - line_start
                word_dur = duration / len(translated_words)
                translated_line = []
                for i, w_str in enumerate(translated_words):
                    translated_line.append({
                        "word": w_str,
                        "start": line_start + i * word_dur,
                        "end": line_start + (i + 1) * word_dur
                    })
                line = translated_line
                line_start = line[0]["start"]
                line_end = line[-1]["end"]
        
        # Output sub-events for each word highlight duration
        for active_idx, active_word in enumerate(line):
            start_str = format_ass_time(active_word["start"])
            # The highlight duration goes until the next word starts, or the end of the line
            if active_idx < len(line) - 1:
                end_str = format_ass_time(line[active_idx + 1]["start"])
            else:
                end_str = format_ass_time(line_end)
                
            # Build the text with active word styling
            text_parts = []
            anim_style = style.get("animation_style", "highlight")
            
            for idx, w in enumerate(line):
                word_str = w["word"]
                if style.get("uppercase", True):
                    word_str = word_str.upper()
                    
                w_font = w.get("font")
                w_color = w.get("color")
                w_position = w.get("position")
                w_bold = w.get("bold")
                w_italic = w.get("italic")
                w_font_size = w.get("font_size")
                w_letter_spacing = w.get("letter_spacing")
                w_outline = w.get("outline_thickness")
                w_shadow = w.get("shadow_offset")
                
                tags = []
                
                if w_font:
                    tags.append(f"\\fn{w_font}")
                if w_bold is True:
                    tags.append("\\b1")
                elif w_bold is False:
                    tags.append("\\b0")
                if w_italic is True:
                    tags.append("\\i1")
                elif w_italic is False:
                    tags.append("\\i0")
                if w_font_size:
                    tags.append(f"\\fs{w_font_size}")
                if w_letter_spacing is not None and w_letter_spacing != "":
                    tags.append(f"\\fsp{w_letter_spacing}")
                if w_outline is not None and w_outline != "":
                    tags.append(f"\\bord{w_outline}")
                if w_shadow is not None and w_shadow != "":
                    tags.append(f"\\shad{w_shadow}")
                    
                # Text position (superscript/subscript)
                pos = w_position if w_position else style.get("text_position", "normal")
                if pos == "superscript":
                    tags.append("\\yshift-15\\fscx70\\fscy70")
                elif pos == "subscript":
                    tags.append("\\yshift15\\fscx70\\fscy70")
                    
                # Highlight or focus active word
                if idx == active_idx:
                    tags.append(f"\\1c{highlight_color}")
                    if anim_style == "bounce":
                        tags.append("\\fscx120\\fscy120\\t(0,100,\\fscx100\\fscy100)")
                    elif anim_style == "focus":
                        tags.append("\\1a&H00")
                else:
                    if w_color:
                        w_ass_color = hex_to_ass_color(w_color, 1.0)
                        tags.append(f"\\1c{w_ass_color}")
                    if anim_style == "focus":
                        tags.append("\\1a&H88")
                        
                if tags:
                    tags_str = "".join(tags)
                    text_parts.append(f"{{{tags_str}}}{word_str}{{\\r}}")
                else:
                    text_parts.append(word_str)
                    
            event_text = " ".join(text_parts)
            ass_content += f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{event_text}\n"
            
    with open(ass_path, "w") as f:
        f.write(ass_content)

def render_clip(video_path: str, start_time: float, end_time: float, words: list, style_config: dict, output_path: str):
    """
    Crops the source video to 9:16, trims it to start_time and end_time,
    applies video filters, color balances, and burns the custom styled captions in.
    """
    temp_dir = os.path.dirname(output_path)
    base_name = os.path.splitext(os.path.basename(output_path))[0]
    ass_path = os.path.join(temp_dir, f"{base_name}.ass")
    
    generate_ass_subtitles(words, start_time, end_time, style_config, ass_path)
    
    # Target resolution
    video_resolution = style_config.get("video_resolution", "1080x1920")
    try:
        res_width, res_height = [int(v) for v in video_resolution.split("x")]
    except Exception:
        res_width, res_height = 1080, 1920
        
    # Manual horizontal & vertical crop shifts
    crop_offset_x = float(style_config.get("crop_offset_x", 0.0))
    crop_offset_x = max(-1.0, min(1.0, crop_offset_x))
    crop_offset_y = float(style_config.get("crop_offset_y", 0.0))
    crop_offset_y = max(-1.0, min(1.0, crop_offset_y))

    # Video scale factor
    video_scale = float(style_config.get("video_scale", 1.0))
    video_scale = max(0.5, min(2.0, video_scale))

    # Get source dimensions
    w_in, h_in = get_video_dimensions(video_path, FFMPEG_PATH)
    
    # Calculate scale factor to fill the target resolution
    s_base = max(res_width / w_in, res_height / h_in)
    
    # Actual scaled width and height
    w_scaled = int(round(w_in * s_base * video_scale))
    h_scaled = int(round(h_in * s_base * video_scale))
    
    escaped_ass_path = ass_path.replace(":", "\\:").replace("\\", "/")
    
    # Apply cropping or padding dynamically based on zoom factor
    if w_scaled >= res_width and h_scaled >= res_height:
        # Cropping (Zoomed in or standard fill)
        x = f"((iw-ow)/2+({crop_offset_x:.4f})*(iw-ow)/2)"
        y = f"((ih-oh)/2+({crop_offset_y:.4f})*(ih-oh)/2)"
        video_filter = f"scale={w_scaled}:{h_scaled},crop={res_width}:{res_height}:{x}:{y}"
    else:
        # Padding (Zoomed out)
        w_crop = min(w_scaled, res_width)
        h_crop = min(h_scaled, res_height)
        x_crop = f"((iw-ow)/2+({crop_offset_x:.4f})*(iw-ow)/2)"
        y_crop = f"((ih-oh)/2+({crop_offset_y:.4f})*(ih-oh)/2)"
        
        x_pad = f"((ow-iw)/2+({crop_offset_x:.4f})*(ow-iw)/2)"
        y_pad = f"((oh-ih)/2+({crop_offset_y:.4f})*(oh-ih)/2)"
        
        video_filter = f"scale={w_scaled}:{h_scaled},crop={w_crop}:{h_crop}:{x_crop}:{y_crop},pad={res_width}:{res_height}:{x_pad}:{y_pad}:black"
    
    # Apply color adjustments (hue, saturation)
    hue_val = style_config.get("hue", 0)
    saturation = style_config.get("saturation", 1.0)
    if hue_val != 0 or saturation != 1.0:
        video_filter += f",hue=h={hue_val}:s={saturation}"
        
    # Apply vibe presets
    vibe = style_config.get("video_filter", "none")
    if vibe == "bw":
        video_filter += ",hue=s=0"
    elif vibe == "vintage":
        video_filter += ",curves=preset=vintage"
    elif vibe == "warm":
        video_filter += ",colorbalance=rm=0.06:bm=-0.04"
    elif vibe == "cool":
        video_filter += ",colorbalance=rm=-0.04:bm=0.06"
    elif vibe == "neon":
        video_filter += ",hue=s=1.4,curves=preset=strong_contrast"
        
    # Apply film grain noise
    if style_config.get("film_grain", False):
        grain_strength = style_config.get("film_grain_strength", 10)
        video_filter += f",noise=alls={grain_strength}:allf=t+u"
        
    # Finally, burn subtitles and set format to yuv420p for encoder compatibility
    video_filter += f",subtitles='{escaped_ass_path}',format=yuv420p"
    
    cmd = [
        FFMPEG_PATH, "-y",
        "-ss", str(start_time),
        "-to", str(end_time),
        "-i", video_path,
        "-vf", video_filter,
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.2",
        "-preset", "veryfast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path
    ]
    
    print(f"Rendering short video clip from {start_time}s to {end_time}s...")
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        print("FFmpeg failed with exit code", e.returncode)
        print("FFmpeg stderr:", e.stderr)
        raise e
    
    # Clean up ASS file
    if os.path.exists(ass_path):
        os.remove(ass_path)
