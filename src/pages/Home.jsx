import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [settings, setSettings] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [processed, setProcessed] = useState('');
  const [status, setStatus] = useState('idle'); // idle | recording | processing | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [micPermission, setMicPermission] = useState('unknown');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.checkMicPermission().then(setMicPermission);

    window.electronAPI.onRecordingState(({ isRecording: rec }) => {
      if (rec) {
        startRecording();
      } else {
        stopRecording();
      }
    });

    return () => {
      window.electronAPI.removeRecordingStateListener();
      cleanupAudio();
    };
  }, []);

  // ===== Audio =====

  const startAudioMeter = (stream) => {
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const draw = () => {
      if (!analyserRef.current) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        const barCount = 40;
        const barWidth = (W / barCount) - 1;

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * dataArray.length);
          const v = dataArray[dataIndex] / 255;
          const barH = Math.max(2, v * H);

          const gradient = ctx.createLinearGradient(0, H, 0, H - barH);
          gradient.addColorStop(0, '#f97316');
          gradient.addColorStop(1, '#fbbf24');

          ctx.fillStyle = gradient;
          const x = i * (barWidth + 1);
          ctx.beginPath();
          ctx.roundRect(x, H - barH, barWidth, barH, 2);
          ctx.fill();
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const cleanupAudio = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // ===== Recording =====

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setMicPermission('granted');

      startAudioMeter(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);

      recordingStartTimeRef.current = Date.now();
      setStatus('recording');
      setIsRecording(true);
      isRecordingRef.current = true;
      setProcessed('');
      setErrorMsg('');
    } catch (err) {
      console.error('Mic error:', err);
      setMicPermission('denied');
      setErrorMsg('マイクへのアクセスが拒否されました');
      setStatus('error');
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupAudio();
      setStatus('idle');
      return;
    }

    recorder.onstop = async () => {
      cleanupAudio();

      try {
        const chunks = audioChunksRef.current;
        if (chunks.length === 0) {
          await window.electronAPI.cancelRecording();
          setStatus('idle');
          return;
        }

        const actualMimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: actualMimeType });

        if (blob.size < 1000) {
          await window.electronAPI.cancelRecording();
          setStatus('idle');
          return;
        }

        const duration = Date.now() - (recordingStartTimeRef.current || 0);
        if (duration < 3000) {
          await window.electronAPI.cancelRecording();
          setStatus('idle');
          return;
        }

        setStatus('processing');

        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });

        const result = await window.electronAPI.processAudioWithGemini(
          base64,
          actualMimeType.split(';')[0],
          { removeFillers: settings?.removeFillers, language: settings?.language }
        );

        if (result.success) {
          setProcessed(result.text);
          setStatus('done');
          await window.electronAPI.insertText(result.text, result.text);
        } else {
          await window.electronAPI.cancelRecording();
          setErrorMsg(result.error);
          setStatus('error');
        }
      } catch (err) {
        await window.electronAPI.cancelRecording();
        setErrorMsg(err.message);
        setStatus('error');
      }
    };

    recorder.stop();
    mediaRecorderRef.current = null;
  };

  const handleManualToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = (text) => navigator.clipboard.writeText(text);

  if (!settings) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>;

  const noApiKey = !settings.apiKey;

  return (
    <div>
      <h1 className="page-title">🎙️ Water Voice</h1>

      {noApiKey && (
        <div className="alert alert-info">
          ⚠️ Gemini API キーが未設定です。設定画面で入力してください。
        </div>
      )}

      {micPermission === 'denied' && (
        <div className="alert alert-error">
          🎤 マイクの使用が拒否されています。システム設定から許可してください。
        </div>
      )}

      {/* Hotkey */}
      <div className="card">
        <div className="card-title">ホットキー</div>
        <div className="hotkey-display">
          <div style={{ marginBottom: 16 }}>
            <kbd style={{
              background: '#242424', border: '1px solid #3e3e3e',
              borderRadius: 6, padding: '8px 16px',
              fontSize: 16, fontFamily: 'monospace', color: '#e8e8e8',
            }}>
              {settings.hotkey}
            </kbd>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>
            どのアプリでもこのキーを押すと録音開始/停止します
          </p>
          <button
            className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleManualToggle}
            disabled={noApiKey}
            style={{ fontSize: 15, padding: '10px 24px' }}
          >
            {isRecording ? '⏹ 録音停止' : '🎙 録音開始'}
          </button>
        </div>
      </div>

      {/* Recording State */}
      {status === 'recording' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="recording-pulse" style={{ width: 14, height: 14, fontSize: 14 }}>🔴</div>
            <span style={{ color: '#f97316', fontWeight: 600 }}>録音中...</span>
            <span style={{ color: '#888', fontSize: 13 }}>停止すると Gemini が認識します</span>
          </div>

          <canvas
            ref={canvasRef}
            width={480}
            height={48}
            style={{
              width: '100%', height: 48,
              borderRadius: 8, background: '#111',
            }}
          />
        </div>
      )}

      {status === 'processing' && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚙️</div>
            <div>Gemini が音声認識・整形中...</div>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="card">
          <div className="card-title">整形結果</div>
          <div className="transcript-box" style={{ marginBottom: 12 }}>{processed}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => copyToClipboard(processed)}>
              📋 コピー
            </button>
            <button className="btn btn-ghost" onClick={() => setStatus('idle')}>クリア</button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">❌ {errorMsg}</div>
      )}

      {/* How to use */}
      <div className="card">
        <div className="card-title">使い方</div>
        <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#ccc' }}>
          <li>設定画面で Gemini API キーを入力</li>
          <li>どのアプリでも <kbd style={{ background: '#242424', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{settings.hotkey}</kbd> を押す</li>
          <li>話す（音量メーターで入力を確認）</li>
          <li>もう一度ホットキーを押す → Gemini が音声認識・整形してテキストを自動挿入</li>
        </ol>
      </div>
    </div>
  );
}
