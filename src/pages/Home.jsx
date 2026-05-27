import React, { useEffect, useRef, useState } from 'react';

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function getSupportedMimeType() {
  if (!window.MediaRecorder) return '';
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('音声データの読み込みに失敗しました。'));
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

export default function Home() {
  const [settings, setSettings] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [processed, setProcessed] = useState('');
  const [status, setStatus] = useState('idle');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [micPermission, setMicPermission] = useState('unknown');
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    window.electronAPI.getSettings().then((loaded) => {
      settingsRef.current = loaded;
      setSettings(loaded);
    });
    window.electronAPI.checkMicPermission().then(setMicPermission);

    window.electronAPI.onRecordingState(({ isRecording: rec }) => {
      if (rec) {
        startRecording();
      } else {
        stopRecording();
      }
    });

    window.electronAPI.onRecordingCancelled(() => {
      cancelLocalRecording('録音をキャンセルしました。');
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isRecordingRef.current) {
        cancelLocalRecording('録音をキャンセルしました。');
        window.electronAPI.cancelRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.electronAPI.removeRecordingStateListener();
      cleanupAudio();
    };
  }, []);

  const startAudioMeter = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
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

        for (let i = 0; i < barCount; i += 1) {
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
      streamRef.current.getTracks().forEach((track) => track.stop());
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

  const startRecording = async () => {
    if (isRecordingRef.current || isStoppingRef.current) return;

    setNotice('');
    setErrorMsg('');
    setProcessed('');

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErrorMsg('この環境では音声録音に対応していません。');
      setStatus('error');
      await window.electronAPI.cancelRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setMicPermission('granted');
      startAudioMeter(stream);

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.start(100);

      recordingStartTimeRef.current = Date.now();
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      console.error('Mic error:', err);
      cleanupAudio();
      setMicPermission('denied');
      setErrorMsg('マイクへのアクセスが拒否されました。OS設定でWater Voiceを許可してください。');
      setStatus('error');
      await window.electronAPI.cancelRecording();
    }
  };

  const cancelLocalRecording = (message) => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.stop();
      }
    }

    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;
    isStoppingRef.current = false;
    setIsRecording(false);
    setStatus('idle');
    setNotice(message);
    cleanupAudio();
  };

  const finishRecording = async (recorder) => {
    cleanupAudio();

    try {
      const chunks = audioChunksRef.current;
      const duration = Date.now() - (recordingStartTimeRef.current || Date.now());

      if (chunks.length === 0 || duration < 700) {
        setNotice('録音が短すぎました。もう少し長く話してください。');
        setStatus('idle');
        await window.electronAPI.cancelRecording();
        return;
      }

      const actualMimeType = recorder.mimeType || getSupportedMimeType() || 'audio/webm';
      const blob = new Blob(chunks, { type: actualMimeType });

      if (blob.size < 1000) {
        setNotice('音声がほとんど検出されませんでした。マイク入力を確認してください。');
        setStatus('idle');
        await window.electronAPI.cancelRecording();
        return;
      }

      setStatus('processing');
      const base64 = await readBlobAsBase64(blob);
      const currentSettings = settingsRef.current || settings || {};

      const result = await window.electronAPI.processAudioWithGemini(
        base64,
        actualMimeType.split(';')[0],
        {
          removeFillers: currentSettings.removeFillers,
          language: currentSettings.language,
        }
      );

      if (!result.success) {
        await window.electronAPI.cancelRecording();
        setErrorMsg(result.error);
        setStatus('error');
        return;
      }

      setProcessed(result.text);
      setStatus('done');

      const saveResult = await window.electronAPI.saveGeneratedText(result.text);
      if (saveResult.success) {
        setNotice('完了。テキストをクリップボードに保存しました。');
      } else {
        setNotice('整形は完了しましたが、クリップボード保存に失敗しました。');
      }
    } catch (err) {
      await window.electronAPI.cancelRecording();
      setErrorMsg(err.message || '録音処理に失敗しました。');
      setStatus('error');
    } finally {
      isStoppingRef.current = false;
      isRecordingRef.current = false;
      setIsRecording(false);
      mediaRecorderRef.current = null;
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current || isStoppingRef.current) return;

    isStoppingRef.current = true;
    isRecordingRef.current = false;
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupAudio();
      isStoppingRef.current = false;
      setStatus('idle');
      return;
    }

    recorder.onstop = () => finishRecording(recorder);

    if (recorder.state === 'recording' || recorder.state === 'paused') {
      recorder.stop();
    } else {
      finishRecording(recorder);
    }
  };

  const handleManualToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!settings) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>;

  const noApiKey = !settings.apiKey;

  return (
    <div>
      <h1 className="page-title">Water Voice</h1>

      {notice && <div className="alert alert-info">{notice}</div>}

      {noApiKey && (
        <div className="alert alert-info">
          Gemini APIキーが未設定です。設定画面で入力してください。
        </div>
      )}

      {micPermission === 'denied' && (
        <div className="alert alert-error">
          マイクの使用が拒否されています。OS設定でWater Voiceを許可してください。
        </div>
      )}

      <div className="card">
        <div className="card-title">ホットキー</div>
        <div className="hotkey-display">
          <div style={{ marginBottom: 16 }}>
            <kbd style={{
              background: '#242424',
              border: '1px solid #3e3e3e',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 16,
              fontFamily: 'monospace',
              color: '#e8e8e8',
            }}>
              {settings.hotkey}
            </kbd>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>
            どのアプリでもこのキーを押すと録音開始/停止します。
          </p>
          <button
            className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleManualToggle}
            disabled={noApiKey || status === 'processing'}
            style={{ fontSize: 15, padding: '10px 24px' }}
          >
            {isRecording ? '録音停止' : '録音開始'}
          </button>
        </div>
      </div>

      {status === 'recording' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="recording-pulse" style={{ width: 14, height: 14, fontSize: 14 }} />
            <span style={{ color: '#f97316', fontWeight: 600 }}>録音中...</span>
            <span style={{ color: '#888', fontSize: 13 }}>停止するとGeminiが認識します</span>
          </div>

          <canvas
            ref={canvasRef}
            width={480}
            height={48}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 8,
              background: '#111',
            }}
          />
        </div>
      )}

      {status === 'processing' && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>処理中</div>
            <div>Geminiが音声認識・整形中...</div>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="card">
          <div className="card-title">整形結果</div>
          <div className="transcript-box" style={{ marginBottom: 12 }}>{processed}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => copyToClipboard(processed)}>
              {copied ? 'コピー済み' : 'コピー'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStatus('idle')}>クリア</button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">{errorMsg}</div>
      )}

      <div className="card">
        <div className="card-title">使い方</div>
        <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#ccc' }}>
          <li>設定画面でGemini APIキーを入力</li>
          <li>どのアプリでも <kbd style={{ background: '#242424', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{settings.hotkey}</kbd> を押す</li>
          <li>話す。音量メーターで入力を確認</li>
          <li>もう一度ホットキーを押すと、Geminiが整形してクリップボードに保存します</li>
        </ol>
      </div>
    </div>
  );
}
