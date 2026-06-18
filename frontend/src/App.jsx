import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = 'http://localhost:8000';

const getYouTubeId = (url) => {
  if (!url) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
};

function WaveformTimeline({ isProcessing, start, end, duration, onChange }) {
  const barCount = 32;
  const barHeights = [
    30, 45, 60, 25, 40, 75, 50, 80, 95, 65,
    40, 30, 50, 70, 85, 90, 60, 45, 35, 55,
    75, 80, 65, 40, 30, 20, 45, 60, 75, 50,
    35, 20
  ];

  if (isProcessing) {
    return (
      <div className="waveform-wrapper processing">
        <div className="waveform-bars">
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="waveform-bar pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${i * 0.04}s`
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const handleStartChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val < end) {
      onChange(val, end);
    }
  };

  const handleEndChange = (e) => {
    const val = parseFloat(e.target.value);
    if (val > start) {
      onChange(start, val);
    }
  };

  return (
    <div className="waveform-wrapper timeline">
      <div className="waveform-bars collapsed">
        {barHeights.map((h, i) => {
          const barTime = (i / barCount) * duration;
          const isActive = barTime >= start && barTime <= end;
          return (
            <div
              key={i}
              className={`waveform-bar ${isActive ? 'active-range' : 'inactive-range'}`}
              style={{
                height: `${Math.max(4, h * 0.25)}px`
              }}
            />
          );
        })}
      </div>
      <div className="timeline-slider-overlay">
        <input
          type="range"
          min="0"
          max={duration}
          step="1"
          value={start}
          onChange={handleStartChange}
          className="slider-handle"
        />
        <input
          type="range"
          min="0"
          max={duration}
          step="1"
          value={end}
          onChange={handleEndChange}
          className="slider-handle"
        />
      </div>
      <div className="timeline-labels">
        <span>{Math.round(start)}s</span>
        <span>{Math.round(end)}s</span>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('forger'); // 'forger', 'styles', 'exports'
  const [step, setStep] = useState(1); // Forger sub-steps: 1: Import, 2: Loading, 3: Clips Selection
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  
  // Backend data
  const [urlHash, setUrlHash] = useState('');
  const [segments, setSegments] = useState([]);
  const [clips, setClips] = useState([]);
  
  // Configs
  const [numClips, setNumClips] = useState(3); // How many shorts to request Kimi to find
  const [selectedClipIndices, setSelectedClipIndices] = useState([]); // indices of clips chosen for rendering
  const [activePreviewClipIdx, setActivePreviewClipIdx] = useState(0);
  
  // Caption style config
  const [fontName, setFontName] = useState('Space Grotesk');
  const [fontSize, setFontSize] = useState(70);
  const [uppercase, setUppercase] = useState(true);
  const [primaryColor, setPrimaryColor] = useState('#FFFFFF');
  const [highlightColor, setHighlightColor] = useState('#00FF94');
  const [showBgBox, setShowBgBox] = useState(true);
  const [bgColor, setBgColor] = useState('#000000');
  const [bgOpacity, setBgOpacity] = useState(0.65);
  const [marginV, setMarginV] = useState(480);
  const [animationStyle, setAnimationStyle] = useState('highlight'); // 'highlight', 'bounce', 'focus'
  const [translationLang, setTranslationLang] = useState('Original'); // 'Original', 'Spanish', 'Chinese', 'Hindi', 'French', 'German'
  
  // Custom subtitles settings
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineSpacing, setLineSpacing] = useState(1.01);
  const [alignment, setAlignment] = useState(2); // 2 = bottom center, 5 = middle center, 8 = top center
  const [globalTextPosition, setGlobalTextPosition] = useState('normal'); // 'normal', 'superscript', 'subscript'
  const [kerning, setKerning] = useState(true);
  const [ligatures, setLigatures] = useState(true);
  
  // Output quality & Crop adjust
  const [videoResolution, setVideoResolution] = useState('1080x1920');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [cropOffsetX, setCropOffsetX] = useState(0.0);
  const [cropOffsetY, setCropOffsetY] = useState(0.0);
  const [videoScale, setVideoScale] = useState(1.0);
  
  const [outlineThickness, setOutlineThickness] = useState(2);
  const [shadowOffset, setShadowOffset] = useState(1);
  
  // Cinematic presets & color grading
  const [videoFilter, setVideoFilter] = useState('none');
  const [filmGrain, setFilmGrain] = useState(false);
  const [filmGrainStrength, setFilmGrainStrength] = useState(10);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(1.0);

  // Subtitle custom text overrides
  const [editedWordTexts, setEditedWordTexts] = useState({}); // key: original_start_time, value: edited_text
  const [wordOverrides, setWordOverrides] = useState({}); // key: start_time, value: { word, font, color, position, bold, italic, fontSize, letterSpacing, outlineThickness, shadowOffset }
  const [selectedWordStart, setSelectedWordStart] = useState(null);
  
  // Mock cycle highlight index
  const [mockWordHighlightIdx, setMockWordHighlightIdx] = useState(0);
  
  // Rendering progress state
  const [batchResults, setBatchResults] = useState([]); // Array of { clip, status: 'pending'|'rendering'|'done'|'error', downloadUrl: '', errorMsg: '' }
  const [batchRendering, setBatchRendering] = useState(false);

  // Helper for mock video filters
  const getVibeFilterCSS = () => {
    let filterStr = '';
    if (videoFilter === 'bw') {
      filterStr += 'grayscale(100%) ';
    } else if (videoFilter === 'vintage') {
      filterStr += 'sepia(40%) contrast(110%) saturate(80%) ';
    } else if (videoFilter === 'warm') {
      filterStr += 'sepia(20%) saturate(120%) hue-rotate(-10deg) ';
    } else if (videoFilter === 'cool') {
      filterStr += 'saturate(110%) hue-rotate(15deg) ';
    } else if (videoFilter === 'neon') {
      filterStr += 'contrast(130%) saturate(160%) ';
    }
    
    if (saturation !== 1.0) {
      filterStr += `saturate(${saturation * 100}%) `;
    }
    if (hue !== 0) {
      filterStr += `hue-rotate(${hue}deg) `;
    }
    return filterStr || 'none';
  };

  const getResolutionOptions = () => {
    if (aspectRatio === '9:16') {
      return [
        { value: '1080x1920', label: 'Full HD (1080x1920)' },
        { value: '720x1280', label: 'Standard HD (720x1280)' },
        { value: '540x960', label: 'Mobile SD (540x960)' }
      ];
    } else if (aspectRatio === '1:1') {
      return [
        { value: '1080x1080', label: 'Square HD (1080x1080)' },
        { value: '720x720', label: 'Square MD (720x720)' },
        { value: '540x540', label: 'Square SD (540x540)' }
      ];
    } else if (aspectRatio === '4:5') {
      return [
        { value: '1080x1350', label: 'Instagram Feed (1080x1350)' },
        { value: '720x900', label: 'Instagram Feed MD (720x900)' },
        { value: '540x675', label: 'Instagram Feed SD (540x675)' }
      ];
    } else {
      return [
        { value: '1920x1080', label: 'Landscape Full HD (1920x1080)' },
        { value: '1280x720', label: 'Landscape HD (1280x720)' },
        { value: '960x540', label: 'Landscape SD (960x540)' }
      ];
    }
  };

  const handleAspectRatioChange = (newRatio) => {
    setAspectRatio(newRatio);
    if (newRatio === '9:16') setVideoResolution('1080x1920');
    else if (newRatio === '1:1') setVideoResolution('1080x1080');
    else if (newRatio === '4:5') setVideoResolution('1080x1350');
    else if (newRatio === '16:9') setVideoResolution('1920x1080');
  };

  const getShiftPct = () => {
    let targetAspect = 9/16;
    if (aspectRatio === '1:1') targetAspect = 1.0;
    if (aspectRatio === '4:5') targetAspect = 0.8;
    if (aspectRatio === '16:9') targetAspect = 16/9;

    const sourceAspect = 16/9;
    return (videoScale - targetAspect / sourceAspect) * 50;
  };

  const getVerticalShiftPct = () => {
    return (videoScale - 1) * 50;
  };

  const getPreviewScale = () => {
    const contentWidth = aspectRatio === '16:9' ? 332 : 282;
    let targetAspect = 9/16;
    if (aspectRatio === '1:1') targetAspect = 1.0;
    else if (aspectRatio === '4:5') targetAspect = 0.8;
    else if (aspectRatio === '16:9') targetAspect = 16/9;

    const contentHeight = contentWidth / targetAspect;
    
    let resHeight = 1920;
    try {
      resHeight = parseInt(videoResolution.split('x')[1]);
    } catch (e) {}
    
    return contentHeight / resHeight;
  };

  // Cycle mock highlight index for live editor preview
  useEffect(() => {
    const interval = setInterval(() => {
      setMockWordHighlightIdx(prev => (prev + 1) % 100);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Filter words belonging to a clip, applying user text edits and custom style overrides
  const getClipWords = (clip) => {
    if (!clip) return [];
    const words = [];
    segments.forEach(seg => {
      if (seg.words) {
        seg.words.forEach(w => {
          if (w.start >= clip.start && w.end <= clip.end) {
            const override = wordOverrides[w.start] || {};
            words.push({
              ...w,
              word: editedWordTexts[w.start] !== undefined ? editedWordTexts[w.start] : w.word,
              font: override.font || '',
              color: override.color || '',
              position: override.position || 'normal',
              bold: override.bold || false,
              italic: override.italic || false,
              fontSize: override.fontSize || '',
              letterSpacing: override.letterSpacing !== undefined ? override.letterSpacing : '',
              outlineThickness: override.outlineThickness !== undefined ? override.outlineThickness : '',
              shadowOffset: override.shadowOffset !== undefined ? override.shadowOffset : ''
            });
          }
        });
      }
    });
    return words;
  };

  const totalDuration = segments.length > 0 ? segments[segments.length - 1].end : 120;

  // Form submit handler for importing YouTube URL
  const handleImport = async (e) => {
    e.preventDefault();
    if (!youtubeUrl) return;
    
    setStep(2);
    setStatusMsg('Initializing download pipeline...');
    setSelectedClipIndices([]);
    setActivePreviewClipIdx(0);
    setEditedWordTexts({}); // Reset edits
    
    try {
      // Step 1: Transcribe & Download audio/video
      setStatusMsg('Downloading video & converting audio...');
      const transResponse = await fetch(`${API_BASE}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      
      if (!transResponse.ok) {
        const err = await transResponse.json();
        throw new Error(err.detail || 'Failed to download/transcribe');
      }
      
      const transData = await transResponse.json();
      setUrlHash(transData.url_hash);
      setSegments(transData.segments);
      
      // Step 2: Select clips using Kimi K2.6
      setStatusMsg('Analyzing transcripts with Kimi K2.6 to automatically select viral shorts...');
      const clipsResponse = await fetch(`${API_BASE}/api/select-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: transData.segments, num_clips: numClips })
      });
      
      if (!clipsResponse.ok) {
        const err = await clipsResponse.json();
        throw new Error(err.detail || 'Failed to select clips');
      }
      
      const clipsData = await clipsResponse.json();
      setClips(clipsData.clips);
      
      // Auto-select all clips initially
      setSelectedClipIndices(clipsData.clips.map((_, i) => i));
      setStep(3);
      
    } catch (err) {
      console.error(err);
      alert(err.message || 'An error occurred during import');
      setStep(1);
    }
  };

  const handleToggleSelectClip = (idx) => {
    if (selectedClipIndices.includes(idx)) {
      setSelectedClipIndices(selectedClipIndices.filter(i => i !== idx));
    } else {
      setSelectedClipIndices([...selectedClipIndices, idx]);
    }
  };

  const handleSelectAllClips = () => {
    if (selectedClipIndices.length === clips.length) {
      setSelectedClipIndices([]);
    } else {
      setSelectedClipIndices(clips.map((_, i) => i));
    }
  };

  const handleClipTimeChange = (idx, newStart, newEnd) => {
    setClips(prev => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        start: newStart,
        end: newEnd
      };
      return copy;
    });
  };

  const handleNextToStyling = () => {
    if (selectedClipIndices.length === 0) {
      alert('Please select at least one viral clip to generate.');
      return;
    }
    setActiveTab('styles');
  };

  // Launch batch rendering of all selected clips concurrently
  const handleBatchRender = async () => {
    setBatchRendering(true);
    setActiveTab('exports');
    
    const styleConfig = {
      font_name: fontName,
      font_size: fontSize,
      primary_color: primaryColor,
      highlight_color: highlightColor,
      bg_color: bgColor,
      bg_opacity: bgOpacity,
      show_bg_box: showBgBox,
      margin_v: marginV,
      uppercase: uppercase,
      animation_style: animationStyle,
      translation_lang: translationLang,
      letter_spacing: letterSpacing,
      line_spacing: lineSpacing,
      alignment: alignment,
      text_position: globalTextPosition,
      kerning: kerning,
      ligatures: ligatures,
      outline_thickness: outlineThickness,
      shadow_offset: shadowOffset,
      video_filter: videoFilter,
      film_grain: filmGrain,
      film_grain_strength: filmGrainStrength,
      hue: hue,
      saturation: saturation,
      video_resolution: videoResolution,
      aspect_ratio: aspectRatio,
      crop_offset_x: cropOffsetX,
      crop_offset_y: cropOffsetY,
      video_scale: videoScale
    };
    
    // Build initial progress array
    const initialBatch = selectedClipIndices.map(idx => ({
      clip: clips[idx],
      status: 'pending',
      downloadUrl: '',
      errorMsg: ''
    }));
    
    setBatchResults(initialBatch);
 
    // Trigger concurrent renders
    const renderPromises = initialBatch.map(async (item, listIdx) => {
      // Update state to rendering
      setBatchResults(prev => {
        const copy = [...prev];
        copy[listIdx] = { ...copy[listIdx], status: 'rendering' };
        return copy;
      });
 
      try {
        // Construct the list of words for this clip, including user edits and overrides
        const clipWords = [];
        segments.forEach(seg => {
          if (seg.words) {
            seg.words.forEach(w => {
              if (w.start >= item.clip.start && w.end <= item.clip.end) {
                const override = wordOverrides[w.start] || {};
                clipWords.push({
                  ...w,
                  word: editedWordTexts[w.start] !== undefined ? editedWordTexts[w.start] : w.word,
                  font: override.font || undefined,
                  color: override.color || undefined,
                  position: override.position || undefined,
                  bold: override.bold !== undefined ? override.bold : undefined,
                  italic: override.italic !== undefined ? override.italic : undefined,
                  font_size: override.fontSize || undefined,
                  letter_spacing: override.letterSpacing !== undefined ? override.letterSpacing : undefined,
                  outline_thickness: override.outlineThickness !== undefined ? override.outlineThickness : undefined,
                  shadow_offset: override.shadowOffset !== undefined ? override.shadowOffset : undefined
                });
              }
            });
          }
        });

        const response = await fetch(`${API_BASE}/api/render-clip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: youtubeUrl,
            start: item.clip.start,
            end: item.clip.end,
            segments: segments,
            style: styleConfig,
            words: clipWords
          })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Rendering failed');
        }

        const data = await response.json();
        
        setBatchResults(prev => {
          const copy = [...prev];
          copy[listIdx] = { 
            ...copy[listIdx], 
            status: 'done', 
            downloadUrl: data.download_url 
          };
          return copy;
        });

      } catch (err) {
        console.error(err);
        setBatchResults(prev => {
          const copy = [...prev];
          copy[listIdx] = { 
            ...copy[listIdx], 
            status: 'error', 
            errorMsg: err.message || 'Error occurred' 
          };
          return copy;
        });
      }
    });

    await Promise.all(renderPromises);
    setBatchRendering(false);
  };

  const handleStartOver = () => {
    setStep(1);
    setActiveTab('forger');
    setYoutubeUrl('');
    setUrlHash('');
    setSegments([]);
    setClips([]);
    setSelectedClipIndices([]);
    setBatchResults([]);
    setEditedWordTexts({});
  };

  const activeClip = clips[activePreviewClipIdx];
  const ytVideoId = getYouTubeId(youtubeUrl);

  return (
    <div className="dashboard-layout">
      {/* Persistent Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand" onClick={handleStartOver}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4H10V10H4V4Z" fill="#00FF94"/>
            <path d="M14 4H20V10H14V4Z" fill="#00FF94"/>
            <path d="M4 14H10V20H4V14Z" fill="#00FF94"/>
            <path d="M14 14H20V20H14V14Z" fill="#00FF94"/>
          </svg>
          <span className="brand-name">ClipForge</span>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'forger' ? 'active' : ''}`}
            onClick={() => setActiveTab('forger')}
          >
            <span className="nav-icon">📁</span>
            <span>Clips Forger</span>
          </button>
          
          <button 
            className={`nav-item ${activeTab === 'styles' ? 'active' : ''}`}
            onClick={() => setActiveTab('styles')}
            disabled={clips.length === 0}
          >
            <span className="nav-icon">🎨</span>
            <span>Caption Styles</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'exports' ? 'active' : ''}`}
            onClick={() => setActiveTab('exports')}
            disabled={clips.length === 0}
          >
            <span className="nav-icon">📦</span>
            <span>Batch Exports</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="version-tag">CLIPFORGE v1.0.0</span>
          <div className="accent-pill flex items-center gap-1.5">
            <span className="pulse-dot"></span>
            AI PIPELINE ONLINE
          </div>
        </div>
      </aside>

      {/* Right Content Area */}
      <main className="main-content">
        {activeTab === 'forger' && (
          /* ==================== PANEL: FORGER ==================== */
          <>
            {step === 1 && (
              <div className="import-wrapper fade-in">
                <div className="hero-text">
                  <h1>Forging Viral Clips in Seconds</h1>
                  <p>ClipForge downloads YouTube videos, transcribes using NVIDIA Riva ASR, selects high-engagement segments with Kimi K2.6, and generates optimized vertical shorts with burning ASS captions.</p>
                </div>

                <div className="import-form-card">
                  <form onSubmit={handleImport}>
                    <div className="input-group">
                      <div className="url-input-container">
                        <input
                          type="url"
                          placeholder="Paste YouTube Link (e.g., https://www.youtube.com/watch?v=...)"
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          required
                        />
                        <button type="submit" className="primary">Forge</button>
                      </div>

                      <div className="inputs-row">
                        <div className="input-field-block">
                          <label>Viral Shorts to Select</label>
                          <select value={numClips} onChange={(e) => setNumClips(parseInt(e.target.value))}>
                            <option value="1">1 Short (Best Hook Only)</option>
                            <option value="2">2 Shorts</option>
                            <option value="3">3 Shorts (Recommended)</option>
                            <option value="4">4 Shorts</option>
                            <option value="5">5 Shorts</option>
                            <option value="6">6 Shorts (Max)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="upload-placeholder-box">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 16V8M12 8L9 11M12 8L15 11" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 15V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V15" strokeLinecap="round"/>
                  </svg>
                  <span>Drag & Drop Local Files (Coming Soon)</span>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="loading-wrapper fade-in">
                <h2>Processing Video Pipeline</h2>
                <div className="status-message">{statusMsg}</div>

                <div style={{ margin: '32px 0' }}>
                  <WaveformTimeline isProcessing={true} />
                </div>

                <div className="pipeline-steps-card">
                  <div className={`step-row ${statusMsg.includes('Download') ? 'active' : ''} ${statusMsg.includes('ASR') || statusMsg.includes('Kimi') || step === 3 ? 'completed' : ''}`}>
                    <div className="step-indicator">1</div>
                    <span>yt-dlp Video Retrieval</span>
                  </div>
                  <div className={`step-row ${statusMsg.includes('ASR') || statusMsg.includes('converting') ? 'active' : ''} ${statusMsg.includes('Kimi') || step === 3 ? 'completed' : ''}`}>
                    <div className="step-indicator">2</div>
                    <span>NVIDIA Riva ASR Speech-to-Text</span>
                  </div>
                  <div className={`step-row ${statusMsg.includes('Kimi') ? 'active' : ''} ${step === 3 ? 'completed' : ''}`}>
                    <div className="step-indicator">3</div>
                    <span>Kimi K2.6 Nim Virality Selection</span>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="clips-wrapper fade-in">
                <div className="column-left">
                  <div className="clips-title-bar">
                    <h2>Viral Recommendations ({clips.length})</h2>
                    <button className="secondary btn-sm" onClick={handleSelectAllClips}>
                      {selectedClipIndices.length === clips.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <p className="subtitle-desc text-secondary">Select shorts to customize. Click text tags to edit subtitle transcription directly.</p>

                  <div className="clips-list">
                    {clips.map((clip, idx) => {
                      const isSelected = selectedClipIndices.includes(idx);
                      const isActive = activePreviewClipIdx === idx;
                      return (
                        <div 
                          key={idx} 
                          className={`clip-card ${isActive ? 'active-card' : ''}`}
                          onClick={() => setActivePreviewClipIdx(idx)}
                        >
                          <div className="checkbox-wrapper" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => handleToggleSelectClip(idx)}
                            />
                          </div>

                          <div className="clip-content">
                            <div className="clip-header">
                              <span className="clip-hook">{clip.hook}</span>
                              <span className="clip-score">★ {clip.score.toFixed(1)} / 10</span>
                            </div>
                            <p className="clip-reasoning">{clip.reason}</p>

                            <WaveformTimeline
                              isProcessing={false}
                              start={clip.start}
                              end={clip.end}
                              duration={totalDuration}
                              onChange={(start, end) => handleClipTimeChange(idx, start, end)}
                            />

                            {/* Live Subtitle Transcript Editor */}
                            {isActive && (
                              <div className="transcript-editor-container" onClick={(e) => e.stopPropagation()}>
                                <span className="editor-label">Edit Subtitle Text (Live Updates)</span>
                                <div className="word-editor-grid">
                                  {getClipWords(clip).map((w, wIdx) => (
                                    <div key={wIdx} className="word-edit-badge">
                                      <input
                                        type="text"
                                        value={w.word}
                                        onChange={(e) => {
                                          const newText = e.target.value;
                                          setEditedWordTexts(prev => ({
                                            ...prev,
                                            [w.start]: newText
                                          }));
                                        }}
                                        className="word-edit-input"
                                      />
                                      <span className="word-time-tag">{Math.round(w.start)}s</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="clip-footer">
                              <span className="clip-time font-mono">
                                ⏱ Range: {Math.round(clip.start)}s - {Math.round(clip.end)}s ({Math.round(clip.end - clip.start)}s)
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-4 mt-6">
                    <button className="secondary" onClick={handleStartOver}>Start Over</button>
                    <button className="primary flex-1" onClick={handleNextToStyling}>
                      Customize Styles ({selectedClipIndices.length} Selected)
                    </button>
                  </div>
                </div>

                <div className="column-right">
                  <div className="preview-card">
                    <div className="preview-header-label">Source Video Preview</div>
                    <div className="video-preview-box">
                      {activeClip ? (
                        <iframe
                          key={`${activePreviewClipIdx}-${Math.round(activeClip.start)}`}
                          src={`https://www.youtube.com/embed/${ytVideoId}?start=${Math.round(activeClip.start)}`}
                          title="YouTube video player"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      ) : (
                        <span className="text-tertiary">No Clip Selected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'styles' && (
          /* ==================== PANEL: STYLES ==================== */
          clips.length === 0 ? (
            <div className="text-center py-12">
              <h3>No Clips Available</h3>
              <p className="text-secondary mt-2">Please go to Clips Forger tab and import a video first.</p>
            </div>
          ) : (
            <div className="editor-wrapper fade-in">
              <div className="column-left">
                <h2>Customize Subtitle Styles</h2>
                <p className="subtitle-desc">Configure typography, animation styles, cinematic vibes, and positions.</p>

                <div className="editor-settings-scroll">
                  <div className="settings-card">
                    <h3>Typography & Borders</h3>

                    <div className="inputs-row">
                      <div className="input-field-block">
                        <label>Font Family</label>
                        <select value={fontName} onChange={(e) => setFontName(e.target.value)}>
                          <option value="Space Grotesk">Space Grotesk (Default)</option>
                          <option value="JetBrains Mono">JetBrains Mono</option>
                          <option value="Inter">Inter (Clean Sans)</option>
                          <option value="Montserrat">Montserrat (Geometric Sans)</option>
                          <option value="Bebas Neue">Bebas Neue (Bold Display)</option>
                          <option value="Oswald">Oswald (Condensed Sans)</option>
                          <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
                          <option value="Arial">Arial (Standard)</option>
                          <option value="Impact">Impact (Classic Meme)</option>
                          <option value="Georgia">Georgia (Serif)</option>
                        </select>
                      </div>

                      <div className="input-field-block">
                        <label>Subtitle Translation</label>
                        <select value={translationLang} onChange={(e) => setTranslationLang(e.target.value)}>
                          <option value="Original">Original (English)</option>
                          <option value="Spanish">Spanish</option>
                          <option value="Chinese">Chinese</option>
                          <option value="Hindi">Hindi</option>
                          <option value="French">French</option>
                          <option value="German">German</option>
                        </select>
                      </div>
                    </div>

                    <div className="input-field-block">
                      <label>Burn Animation</label>
                      <select value={animationStyle} onChange={(e) => setAnimationStyle(e.target.value)}>
                        <option value="highlight">Highlight Active Word (Default)</option>
                        <option value="bounce">Bounce Pop (Scale Zoom Effect)</option>
                        <option value="focus">Focus Glow (Dim Inactive Words)</option>
                      </select>
                    </div>

                    <div className="input-field-block">
                      <div className="flex justify-between items-center mb-1">
                        <label>Font Size</label>
                        <span className="range-slider-display">{fontSize}px</span>
                      </div>
                      <input type="range" min="30" max="120" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} />
                    </div>

                    <div className="inputs-row">
                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Outline Thickness</label>
                          <span className="range-slider-display">{outlineThickness}px</span>
                        </div>
                        <input type="range" min="0" max="8" value={outlineThickness} onChange={(e) => setOutlineThickness(parseInt(e.target.value))} />
                      </div>

                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Shadow Offset</label>
                          <span className="range-slider-display">{shadowOffset}px</span>
                        </div>
                        <input type="range" min="0" max="8" value={shadowOffset} onChange={(e) => setShadowOffset(parseInt(e.target.value))} />
                      </div>
                    </div>

                    <div className="checkbox-toggle-block">
                      <input type="checkbox" id="uppercase-toggle" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} />
                      <label htmlFor="uppercase-toggle">Force Uppercase Text</label>
                    </div>
                  </div>

                  {/* Advanced settings section (matching the reference image layout) */}
                  <div className="settings-card">
                    <h3>Advanced Settings</h3>
                    
                    <div className="advanced-section-title">Spacing</div>
                    
                    <div className="input-field-block">
                      <div className="flex justify-between items-center mb-1">
                        <label>Letter spacing</label>
                        <span className="range-slider-display">{letterSpacing}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        value={letterSpacing} 
                        onChange={(e) => setLetterSpacing(parseInt(e.target.value))} 
                      />
                    </div>
                    
                    <div className="input-field-block">
                      <div className="flex justify-between items-center mb-1">
                        <label>Line spacing</label>
                        <span className="range-slider-display">{lineSpacing}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.8" 
                        max="2.0" 
                        step="0.05"
                        value={lineSpacing} 
                        onChange={(e) => setLineSpacing(parseFloat(e.target.value))} 
                      />
                    </div>
                    
                    <div className="input-field-block">
                      <label>Anchor text box</label>
                      <div className="segmented-control">
                        <button 
                          className={`control-btn ${alignment === 8 ? 'active' : ''}`}
                          onClick={() => setAlignment(8)}
                          title="Top Center"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="4" x2="20" y2="4"></line>
                            <polyline points="7 9 12 14 17 9"></polyline>
                            <line x1="12" y1="4" x2="12" y2="14"></line>
                          </svg>
                          <span>Top</span>
                        </button>
                        <button 
                          className={`control-btn ${alignment === 5 ? 'active' : ''}`}
                          onClick={() => setAlignment(5)}
                          title="Middle Center"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="12" x2="20" y2="12"></line>
                            <polyline points="7 7 12 12 17 7"></polyline>
                            <polyline points="7 17 12 12 17 17"></polyline>
                          </svg>
                          <span>Middle</span>
                        </button>
                        <button 
                          className={`control-btn ${alignment === 2 ? 'active' : ''}`}
                          onClick={() => setAlignment(2)}
                          title="Bottom Center"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="4" y1="20" x2="20" y2="20"></line>
                            <polyline points="7 15 12 10 17 15"></polyline>
                            <line x1="12" y1="10" x2="12" y2="20"></line>
                          </svg>
                          <span>Bottom</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="advanced-section-title mt-4">Formatting</div>
                    
                    <div className="input-field-block">
                      <label>Text position</label>
                      <div className="segmented-control">
                        <button 
                          className={`control-btn ${globalTextPosition === 'normal' ? 'active' : ''}`}
                          onClick={() => setGlobalTextPosition('normal')}
                        >
                          <span>A2</span>
                        </button>
                        <button 
                          className={`control-btn ${globalTextPosition === 'superscript' ? 'active' : ''}`}
                          onClick={() => setGlobalTextPosition('superscript')}
                        >
                          <span>A<sup>2</sup></span>
                        </button>
                        <button 
                          className={`control-btn ${globalTextPosition === 'subscript' ? 'active' : ''}`}
                          onClick={() => setGlobalTextPosition('subscript')}
                        >
                          <span>A<sub>2</sub></span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="advanced-section-title mt-4">Typography</div>
                    
                    <div className="inputs-row">
                      <div className="input-field-block">
                        <label>Kerning</label>
                        <div className="segmented-control">
                          <button
                            className={`control-btn ${!kerning ? 'active' : ''}`}
                            onClick={() => setKerning(false)}
                          >
                            -
                          </button>
                          <button
                            className={`control-btn ${kerning ? 'active' : ''}`}
                            onClick={() => setKerning(true)}
                          >
                            VA
                          </button>
                        </div>
                      </div>
                      
                      <div className="input-field-block">
                        <label>Ligatures</label>
                        <div className="segmented-control">
                          <button
                            className={`control-btn ${!ligatures ? 'active' : ''}`}
                            onClick={() => setLigatures(false)}
                          >
                            fi
                          </button>
                          <button
                            className={`control-btn ${ligatures ? 'active' : ''}`}
                            onClick={() => setLigatures(true)}
                          >
                            fi
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                               {/* Individual word customization */}
                  <div className="settings-card">
                    <h3>Individual Word Customization</h3>
                    <p className="field-hint mb-4">Click any word below to style it specifically (overrides global parameters).</p>
                    
                    <div className="word-grid-customizer mb-4">
                      {getClipWords(activeClip).map((w, wIdx) => {
                        const isSelected = selectedWordStart === w.start;
                        const hasOverride = wordOverrides[w.start] !== undefined;
                        const hasTextEdit = editedWordTexts[w.start] !== undefined;
                        return (
                          <button
                            key={wIdx}
                            className={`word-badge-btn ${isSelected ? 'selected' : ''} ${hasOverride || hasTextEdit ? 'overridden' : ''}`}
                            onClick={() => setSelectedWordStart(w.start)}
                            style={{
                              fontFamily: w.font || 'inherit',
                              color: w.color || 'inherit',
                              fontWeight: w.bold ? 'bold' : 'normal',
                              fontStyle: w.italic ? 'italic' : 'normal'
                            }}
                          >
                            {w.word}
                          </button>
                        );
                      })}
                    </div>
                    
                    {selectedWordStart !== null && (() => {
                      const selectedWordObj = getClipWords(activeClip).find(w => w.start === selectedWordStart);
                      if (!selectedWordObj) return null;
                      
                      const override = wordOverrides[selectedWordStart] || {};
                      
                      const updateOverride = (field, value) => {
                        setWordOverrides(prev => {
                          const copy = { ...prev };
                          const currentOverride = copy[selectedWordStart] || {};
                          
                          if (value === undefined || value === '' || value === false) {
                            delete currentOverride[field];
                          } else {
                            currentOverride[field] = value;
                          }
                          
                          if (Object.keys(currentOverride).length === 0) {
                            delete copy[selectedWordStart];
                          } else {
                            copy[selectedWordStart] = currentOverride;
                          }
                          return copy;
                        });
                      };
                      
                      return (
                        <div className="word-override-form fade-in">
                          <div className="flex justify-between items-center mb-3">
                            <span className="editor-label">Styling: "{selectedWordObj.word}"</span>
                            <button 
                              className="btn-sm secondary" 
                              onClick={() => {
                                setWordOverrides(prev => {
                                  const copy = { ...prev };
                                  delete copy[selectedWordStart];
                                  return copy;
                                });
                              }}
                            >
                              Reset
                            </button>
                          </div>
                          
                          <div className="input-field-block">
                            <label>Word Text</label>
                            <input
                              type="text"
                              value={editedWordTexts[selectedWordStart] !== undefined ? editedWordTexts[selectedWordStart] : selectedWordObj.word}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditedWordTexts(prev => ({
                                  ...prev,
                                  [selectedWordStart]: val
                                }));
                              }}
                            />
                          </div>
                          
                          <div className="inputs-row">
                            <div className="input-field-block">
                              <label>Word Font</label>
                              <select 
                                value={override.font || ''} 
                                onChange={(e) => updateOverride('font', e.target.value)}
                              >
                                <option value="">Global Default</option>
                                <option value="Space Grotesk">Space Grotesk</option>
                                <option value="JetBrains Mono">JetBrains Mono</option>
                                <option value="Inter">Inter</option>
                                <option value="Montserrat">Montserrat</option>
                                <option value="Bebas Neue">Bebas Neue</option>
                                <option value="Oswald">Oswald</option>
                                <option value="Playfair Display">Playfair Display</option>
                                <option value="Arial">Arial</option>
                                <option value="Impact">Impact</option>
                                <option value="Georgia">Georgia</option>
                              </select>
                            </div>
                            
                            <div className="input-field-block">
                              <label>Word Color</label>
                              <div className="color-picker-input-wrapper">
                                <input
                                  type="color"
                                  value={override.color || '#ffffff'}
                                  onChange={(e) => updateOverride('color', e.target.value)}
                                  className="color-picker-input"
                                />
                                <div className="checkbox-toggle-block mt-2">
                                  <input
                                    type="checkbox"
                                    id="word-color-toggle"
                                    checked={override.color !== undefined}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        updateOverride('color', '#ffffff');
                                      } else {
                                        updateOverride('color', undefined);
                                      }
                                    }}
                                  />
                                  <label htmlFor="word-color-toggle" style={{ fontSize: '10px' }}>Apply Color</label>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="inputs-row">
                            <div className="input-field-block">
                              <label>Formatting</label>
                              <div className="word-format-toggles">
                                <button
                                  className={`btn-sm font-semibold ${override.bold ? 'primary' : 'secondary'}`}
                                  style={{ padding: '6px 12px', flex: 1 }}
                                  onClick={() => updateOverride('bold', !override.bold)}
                                >
                                  Bold
                                </button>
                                <button
                                  className={`btn-sm font-semibold ${override.italic ? 'primary' : 'secondary'}`}
                                  style={{ padding: '6px 12px', flex: 1 }}
                                  onClick={() => updateOverride('italic', !override.italic)}
                                >
                                  Italic
                                </button>
                              </div>
                            </div>
                            
                            <div className="input-field-block">
                              <label>Word Position</label>
                              <select
                                value={override.position || 'normal'}
                                onChange={(e) => updateOverride('position', e.target.value === 'normal' ? undefined : e.target.value)}
                              >
                                <option value="normal">Normal</option>
                                <option value="superscript">Superscript (A²)</option>
                                <option value="subscript">Subscript (A₂)</option>
                              </select>
                            </div>
                          </div>

                          <div className="inputs-row">
                            <div className="input-field-block">
                              <div className="flex justify-between items-center mb-1">
                                <label>Word Size</label>
                                <span className="range-slider-display">{override.fontSize ? `${override.fontSize}px` : 'Global'}</span>
                              </div>
                              <input 
                                type="range" 
                                min="20" 
                                max="130" 
                                value={override.fontSize || fontSize} 
                                onChange={(e) => updateOverride('fontSize', parseInt(e.target.value))} 
                              />
                            </div>
                            
                            <div className="input-field-block">
                              <div className="flex justify-between items-center mb-1">
                                <label>Word Spacing</label>
                                <span className="range-slider-display">{override.letterSpacing !== undefined ? `${override.letterSpacing}px` : 'Global'}</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="15" 
                                value={override.letterSpacing !== undefined ? override.letterSpacing : letterSpacing} 
                                onChange={(e) => updateOverride('letterSpacing', parseInt(e.target.value))} 
                              />
                            </div>
                          </div>
                          
                          <div className="inputs-row">
                            <div className="input-field-block">
                              <div className="flex justify-between items-center mb-1">
                                <label>Word Outline</label>
                                <span className="range-slider-display">{override.outlineThickness !== undefined ? `${override.outlineThickness}px` : 'Global'}</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="8" 
                                value={override.outlineThickness !== undefined ? override.outlineThickness : outlineThickness} 
                                onChange={(e) => updateOverride('outlineThickness', parseInt(e.target.value))} 
                              />
                            </div>
                            
                            <div className="input-field-block">
                              <div className="flex justify-between items-center mb-1">
                                <label>Word Shadow</label>
                                <span className="range-slider-display">{override.shadowOffset !== undefined ? `${override.shadowOffset}px` : 'Global'}</span>
                              </div>
                              <input 
                                type="range" 
                                min="0" 
                                max="8" 
                                value={override.shadowOffset !== undefined ? override.shadowOffset : shadowOffset} 
                                onChange={(e) => updateOverride('shadowOffset', parseInt(e.target.value))} 
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="settings-card">
                    <h3>Colors & Backdrop Box</h3>

                    <div className="color-picker-row">
                      <div className="color-input-wrapper">
                        <label>Text Color</label>
                        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="color-picker-input" />
                      </div>
                      <div className="color-input-wrapper">
                        <label>Highlight Color</label>
                        <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="color-picker-input" />
                      </div>
                    </div>

                    <div className="checkbox-toggle-block" style={{ marginTop: '20px' }}>
                      <input type="checkbox" id="bgbox-toggle" checked={showBgBox} onChange={(e) => setShowBgBox(e.target.checked)} />
                      <label htmlFor="bgbox-toggle">Opaque Background Box</label>
                    </div>

                    {showBgBox && (
                      <div className="fade-in mt-4">
                        <div className="input-field-block">
                          <label>Box Color</label>
                          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="color-picker-input" />
                        </div>
                        <div className="input-field-block">
                          <div className="flex justify-between items-center mb-1">
                            <label>Box Opacity</label>
                            <span className="range-slider-display">{Math.round(bgOpacity * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={bgOpacity} onChange={(e) => setBgOpacity(parseFloat(e.target.value))} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="settings-card">
                    <h3>Cinematic Presets & Color Grading</h3>
                    
                    <div className="inputs-row">
                      <div className="input-field-block">
                        <label>Video Vibe Filter</label>
                        <select value={videoFilter} onChange={(e) => setVideoFilter(e.target.value)}>
                          <option value="none">Original (None)</option>
                          <option value="bw">Noir B&W (Monochrome)</option>
                          <option value="vintage">Warm Vintage (Film Look)</option>
                          <option value="warm">Golden Hour (Warm Tone)</option>
                          <option value="cool">Deep Blue (Cool Tone)</option>
                          <option value="neon">Cyber Neon (Vibrant Contrast)</option>
                        </select>
                      </div>

                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Saturation</label>
                          <span className="range-slider-display">{saturation}x</span>
                        </div>
                        <input type="range" min="0" max="2" step="0.1" value={saturation} onChange={(e) => setSaturation(parseFloat(e.target.value))} />
                      </div>
                    </div>

                    <div className="input-field-block">
                      <div className="flex justify-between items-center mb-1">
                        <label>Hue Shift</label>
                        <span className="range-slider-display">{hue}°</span>
                      </div>
                      <input type="range" min="-180" max="180" value={hue} onChange={(e) => setHue(parseInt(e.target.value))} />
                    </div>

                    <div className="checkbox-toggle-block">
                      <input type="checkbox" id="filmgrain-toggle" checked={filmGrain} onChange={(e) => setFilmGrain(e.target.checked)} />
                      <label htmlFor="filmgrain-toggle">Apply Cinematic Film Grain</label>
                    </div>

                    {filmGrain && (
                      <div className="input-field-block fade-in mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <label>Grain Strength</label>
                          <span className="range-slider-display">{filmGrainStrength}</span>
                        </div>
                        <input type="range" min="5" max="30" value={filmGrainStrength} onChange={(e) => setFilmGrainStrength(parseInt(e.target.value))} />
                      </div>
                    )}
                  </div>

                  <div className="settings-card">
                    <h3>Layout Position & Quality</h3>
                    <div className="inputs-row">
                      <div className="input-field-block">
                        <label>Aspect Ratio</label>
                        <select value={aspectRatio} onChange={(e) => handleAspectRatioChange(e.target.value)}>
                          <option value="9:16">Shorts / Reels (9:16)</option>
                          <option value="1:1">Instagram Square (1:1)</option>
                          <option value="4:5">Instagram Feed (4:5)</option>
                          <option value="16:9">Landscape (16:9)</option>
                        </select>
                      </div>

                      <div className="input-field-block">
                        <label>Quality & Resolution</label>
                        <select value={videoResolution} onChange={(e) => setVideoResolution(e.target.value)}>
                          {getResolutionOptions().map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="inputs-row">
                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Video Scale / Zoom</label>
                          <span className="range-slider-display">{videoScale.toFixed(2)}x</span>
                        </div>
                        <input 
                          type="range" 
                          min="0.5" 
                          max="2.0" 
                          step="0.05" 
                          value={videoScale} 
                          onChange={(e) => setVideoScale(parseFloat(e.target.value))} 
                        />
                      </div>

                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Vertical Margin (Subs)</label>
                          <span className="range-slider-display">{marginV}px</span>
                        </div>
                        <input type="range" min="100" max="900" value={marginV} onChange={(e) => setMarginV(parseInt(e.target.value))} />
                      </div>
                    </div>
                    
                    <div className="inputs-row">
                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Horizontal Crop adjust</label>
                          <span className="range-slider-display">{cropOffsetX > 0 ? `+${Math.round(cropOffsetX * 100)}%` : `${Math.round(cropOffsetX * 100)}%`}</span>
                        </div>
                        <input 
                          type="range" 
                          min="-1.0" 
                          max="1.0" 
                          step="0.02" 
                          value={cropOffsetX} 
                          onChange={(e) => setCropOffsetX(parseFloat(e.target.value))} 
                        />
                      </div>

                      <div className="input-field-block">
                        <div className="flex justify-between items-center mb-1">
                          <label>Vertical Crop adjust</label>
                          <span className="range-slider-display">{cropOffsetY > 0 ? `+${Math.round(cropOffsetY * 100)}%` : `${Math.round(cropOffsetY * 100)}%`}</span>
                        </div>
                        <input 
                          type="range" 
                          min="-1.0" 
                          max="1.0" 
                          step="0.02" 
                          value={cropOffsetY} 
                          onChange={(e) => setCropOffsetY(parseFloat(e.target.value))} 
                        />
                      </div>
                    </div>
                    <span className="field-hint">Pan video horizontally/vertically or scale it to fit or zoom on speakers.</span>
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button className="secondary" onClick={() => setActiveTab('forger')}>Back</button>
                  <button className="primary flex-1" onClick={handleBatchRender}>
                    Forge {selectedClipIndices.length} Clip{selectedClipIndices.length > 1 ? 's' : ''}
                  </button>
                </div>
              </div>

              <div className="column-right mobile-frame-container">
                <div className="mobile-mock-video-frame" style={{
                  aspectRatio: aspectRatio === '9:16' ? '9/16' : (aspectRatio === '1:1' ? '1/1' : (aspectRatio === '4:5' ? '4/5' : '16/9')),
                  width: aspectRatio === '16:9' ? '340px' : '290px',
                  backgroundColor: '#0d0d0d',
                  borderRadius: '16px',
                  border: '4px solid var(--border-color-dark)',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                }}>
                  <div className="mobile-mock-video" style={{
                    filter: getVibeFilterCSS()
                  }}>
                    {ytVideoId ? (
                      <div className="mock-iframe-container" style={{
                        transform: `translate(calc(-50% - ${cropOffsetX * getShiftPct()}%), calc(-50% - ${cropOffsetY * getVerticalShiftPct()}%)) scale(${videoScale})`,
                        width: (aspectRatio === '16:9' && videoScale === 1.0) ? '100%' : undefined
                      }}>
                        <iframe
                          className="mock-iframe"
                          src={`https://www.youtube.com/embed/${ytVideoId}?start=${Math.round(activeClip.start)}&autoplay=1&mute=1&controls=0&loop=1&playlist=${ytVideoId}`}
                          title="Mock video preview"
                          allow="autoplay"
                        ></iframe>
                      </div>
                    ) : null}
                    
                    <div className="mobile-scan-grid"></div>
                    
                    {filmGrain && (
                      <div 
                        className="film-grain-overlay" 
                        style={{ opacity: filmGrainStrength / 100 }}
                      ></div>
                    )}

                    <div className="subtitle-mock-container" style={{
                      fontFamily: fontName === 'Space Grotesk' ? 'var(--font-sans)' : (fontName === 'JetBrains Mono' ? 'var(--font-mono)' : `'${fontName}', sans-serif`),
                      fontSize: `${fontSize * getPreviewScale()}px`,
                      letterSpacing: `${letterSpacing * getPreviewScale()}px`,
                      lineHeight: lineSpacing,
                      fontKerning: kerning ? 'normal' : 'none',
                      fontVariantLigatures: ligatures ? 'common-ligatures' : 'none',
                      left: '50%',
                      transform: alignment === 5 ? 'translate(-50%, -50%)' : 'translateX(-50%)',
                      top: alignment === 8 ? `${marginV * getPreviewScale()}px` : (alignment === 5 ? '50%' : 'auto'),
                      bottom: alignment === 2 ? `${marginV * getPreviewScale()}px` : 'auto',
                    }}>
                      <div className="subtitle-mock-box" style={{
                        backgroundColor: showBgBox ? `rgba(${parseInt(bgColor.slice(1,3),16)}, ${parseInt(bgColor.slice(3,5),16)}, ${parseInt(bgColor.slice(5,7),16)}, ${bgOpacity})` : 'transparent',
                        padding: showBgBox ? '8px 14px' : '0',
                        borderRadius: showBgBox ? '4px' : '0',
                        textTransform: uppercase ? 'uppercase' : 'none',
                        justifyContent: 'center'
                      }}>
                        {(() => {
                          const activeClipWords = getClipWords(activeClip);
                          if (activeClipWords.length === 0) {
                            return ["LIVE", "SUBTITLE", "ANIMATED", "PREVIEW"].map((w, wIdx) => {
                              const isHighlighted = wIdx === (mockWordHighlightIdx % 4);
                              return (
                                <span 
                                  key={wIdx} 
                                  style={{ color: isHighlighted ? highlightColor : primaryColor }}
                                >
                                  {uppercase ? w.toUpperCase() : w}
                                </span>
                              );
                            });
                          }
                          
                          // Group words into lines matching backend logic
                          const lines = [];
                          let currentLine = [];
                          for (let i = 0; i < activeClipWords.length; i++) {
                            const w = activeClipWords[i];
                            currentLine.push(w);
                            if (currentLine.length >= 4) {
                              lines.push(currentLine);
                              currentLine = [];
                            } else if (currentLine.length > 1 && (w.start - currentLine[currentLine.length - 2].end > 1.0)) {
                              lines.push(currentLine.slice(0, -1));
                              currentLine = [w];
                            }
                          }
                          if (currentLine.length > 0) {
                            lines.push(currentLine);
                          }
                          
                          // Cycle mock highlight index
                          const activeWordIdx = mockWordHighlightIdx % activeClipWords.length;
                          const activeWord = activeClipWords[activeWordIdx];
                          
                          // Find current line
                          let activeLine = lines[0] || [];
                          for (const line of lines) {
                            if (line.some(w => w.start === activeWord.start)) {
                              activeLine = line;
                              break;
                            }
                          }
                          
                          return activeLine.map((w, wIdx) => {
                            const isHighlighted = w.start === activeWord.start;
                            const displayW = uppercase ? w.word.toUpperCase() : w.word;
                            
                            const wFont = w.font ? `'${w.font}', sans-serif` : (fontName === 'Space Grotesk' ? 'var(--font-sans)' : (fontName === 'JetBrains Mono' ? 'var(--font-mono)' : `'${fontName}', sans-serif`));
                            const wColor = isHighlighted ? highlightColor : (w.color || primaryColor);
                            const wPos = w.position || globalTextPosition;
                            
                            let className = '';
                            if (isHighlighted) {
                              if (animationStyle === 'bounce') className = 'bounce-active';
                              if (animationStyle === 'focus') className = 'glow-text';
                            } else {
                              if (animationStyle === 'focus') className = 'fade-dim';
                            }
                            
                            const scale = getPreviewScale();
                            const wordSize = (w.fontSize || fontSize) * scale;
                            const wordSpacing = (w.letterSpacing !== undefined && w.letterSpacing !== '') ? w.letterSpacing * scale : letterSpacing * scale;
                            const wordOutline = (w.outlineThickness !== undefined && w.outlineThickness !== '') ? w.outlineThickness * scale : outlineThickness * scale;
                            const wordShadow = (w.shadowOffset !== undefined && w.shadowOffset !== '') ? w.shadowOffset * scale : shadowOffset * scale;
                            
                            const wordStyle = {
                              color: wColor,
                              fontFamily: wFont,
                              fontWeight: w.bold ? 'bold' : 'normal',
                              fontStyle: w.italic ? 'italic' : 'normal',
                              fontSize: `${wordSize}px`,
                              letterSpacing: `${wordSpacing}px`,
                              display: 'inline-block'
                            };
                            
                            let textShadows = [];
                            if (wordOutline > 0) {
                              const borderCol = bgColor || '#000000';
                              const outSize = wordOutline;
                              textShadows.push(
                                `-${outSize}px -${outSize}px 0 ${borderCol}`,
                                `${outSize}px -${outSize}px 0 ${borderCol}`,
                                `-${outSize}px ${outSize}px 0 ${borderCol}`,
                                `${outSize}px ${outSize}px 0 ${borderCol}`,
                                `0px ${outSize}px 0 ${borderCol}`,
                                `0px -${outSize}px 0 ${borderCol}`,
                                `${outSize}px 0px 0 ${borderCol}`,
                                `-${outSize}px 0px 0 ${borderCol}`
                              );
                            }
                            if (wordShadow > 0) {
                              const shadowCol = 'rgba(0,0,0,0.5)';
                              const shadSize = wordShadow;
                              textShadows.push(`${shadSize}px ${shadSize}px 2px ${shadowCol}`);
                            }
                            if (textShadows.length > 0) {
                              wordStyle.textShadow = textShadows.join(', ');
                            }
                            
                            if (wPos === 'superscript') {
                              wordStyle.verticalAlign = 'super';
                              wordStyle.fontSize = `${wordSize * 0.7}px`;
                            } else if (wPos === 'subscript') {
                              wordStyle.verticalAlign = 'sub';
                              wordStyle.fontSize = `${wordSize * 0.7}px`;
                            }
                            
                            return (
                              <span 
                                key={w.start} 
                                className={className} 
                                style={wordStyle}
                              >
                                {displayW}
                              </span>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {activeTab === 'exports' && (
          /* ==================== PANEL: EXPORTS ==================== */
          clips.length === 0 ? (
            <div className="text-center py-12">
              <h3>No Clips Available</h3>
              <p className="text-secondary mt-2">Please go to Clips Forger tab and import a video first.</p>
            </div>
          ) : (
            <div className="export-wrapper fade-in">
              <div className="export-header">
                <h2>Batch Generation Queue</h2>
                {batchRendering ? (
                  <p className="text-secondary">FFmpeg is cropping videos to 9:16 vertical, scaling to 1080x1920, and burning animated ASS subtitles...</p>
                ) : (
                  <p className="text-success">All selected clips have been forged! Download below.</p>
                )}
              </div>

              <div className="export-grid">
                {batchResults.map((item, idx) => (
                  <div key={idx} className={`export-card ${item.status === 'done' ? 'done-card' : 'rendering-card'}`}>
                    <div className="export-card-header">
                      <h4>{item.clip.hook}</h4>
                      <div className="export-time-range font-mono">⏱ Range: {Math.round(item.clip.start)}s - {Math.round(item.clip.end)}s</div>
                    </div>

                    <div className="video-container-box">
                      {item.status === 'pending' && <span className="text-tertiary">Queued...</span>}
                      {item.status === 'rendering' && (
                        <div className="export-loading-dots">
                          <div className="mini-spinner"></div>
                          <span>Rendering...</span>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="error-container">❌ Failed: {item.errorMsg}</div>
                      )}
                      {item.status === 'done' && (
                        <video controls src={`${API_BASE}${item.downloadUrl}`}></video>
                      )}
                    </div>

                    <div>
                      {item.status === 'done' ? (
                        <a href={`${API_BASE}${item.downloadUrl}`} download className="w-full">
                          <button className="primary w-full">Download MP4</button>
                        </a>
                      ) : (
                        <button className="primary w-full" disabled>
                          {item.status === 'rendering' ? 'Processing...' : 'Waiting...'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!batchRendering && (
                <div className="flex justify-center gap-4 mt-8">
                  <button className="secondary" onClick={() => setActiveTab('styles')}>Back to Editor</button>
                  <button className="primary" onClick={handleStartOver}>Forge New Video</button>
                </div>
              )}
            </div>
          )
        )}
      </main>
    </div>
  );
}
