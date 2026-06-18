import os
import wave
import time
import riva.client
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
RIVA_ASR_FUNCTION_ID = os.getenv("RIVA_ASR_FUNCTION_ID", "1598d209-5e27-4d3c-8079-4751568b1081")

def transcribe_audio(wav_path: str) -> list:
    """
    Transcribes a mono 48kHz WAV file using NVIDIA Riva speech-to-text
    and returns a list of transcribed segments with word-level timestamps.
    """
    if not os.path.exists(wav_path):
        raise FileNotFoundError(f"Audio file not found: {wav_path}")
        
    # Read WAV metadata to confirm sample rate
    with wave.open(wav_path, 'rb') as wav_f:
        framerate = wav_f.getframerate()
        channels = wav_f.getnchannels()
        if channels != 1:
            raise ValueError(f"ASR requires mono WAV, got {channels} channels")
            
    # Set up Riva client auth pointing to the cloud functions gRPC gateway
    auth = riva.client.Auth(
        use_ssl=True,
        uri="grpc.nvcf.nvidia.com:443",
        metadata_args=[
            ["function-id", RIVA_ASR_FUNCTION_ID],
            ["authorization", f"Bearer {NVIDIA_API_KEY}"]
        ]
    )
    
    asr_service = riva.client.ASRService(auth)
    
    # Configure ASR request
    config = riva.client.RecognitionConfig(
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
        sample_rate_hertz=framerate,
        language_code="en-US",
        max_alternatives=1,
        enable_automatic_punctuation=True,
        enable_word_time_offsets=True
    )
    
    streaming_config = riva.client.StreamingRecognitionConfig(
        config=config,
        interim_results=False
    )
    
    # Chunk size: 4800 frames is 100ms at 48000Hz
    chunk_size = 4800
    
    def chunk_generator(filepath):
        with wave.open(filepath, 'rb') as wav_f:
            # Limit to first 120 seconds of audio for performance
            max_frames = 120 * framerate
            frames_read = 0
            while frames_read < max_frames:
                data = wav_f.readframes(chunk_size)
                if not data:
                    break
                yield data
                frames_read += len(data) // (2 * channels)  # 2 bytes per sample

    print(f"Streaming {wav_path} to Riva ASR...")
    segments = []
    
    responses = asr_service.streaming_response_generator(
        audio_chunks=chunk_generator(wav_path),
        streaming_config=streaming_config
    )
    
    for response in responses:
        for result in response.results:
            if result.is_final:
                alternative = result.alternatives[0]
                transcript_text = alternative.transcript
                
                # Extract word details
                words_info = []
                segment_start = None
                segment_end = None
                
                for w in alternative.words:
                    w_start = w.start_time / 1000.0  # ms to s
                    w_end = w.end_time / 1000.0
                    
                    if segment_start is None or w_start < segment_start:
                        segment_start = w_start
                    if segment_end is None or w_end > segment_end:
                        segment_end = w_end
                        
                    words_info.append({
                        "word": w.word,
                        "start": w_start,
                        "end": w_end
                    })
                
                if transcript_text.strip():
                    segments.append({
                        "transcript": transcript_text,
                        "start": segment_start or 0.0,
                        "end": segment_end or 0.0,
                        "words": words_info
                    })
                    
    return segments
