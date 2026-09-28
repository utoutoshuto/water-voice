import React, { useEffect, useRef, useState } from 'react';
import { useRecorder } from '../hooks/useRecorder';

// 録音中の音量メーター。録音ロジックは RecorderProvider 側にあり、ここは描画だけを担当する。
function AudioMeter({ analyser }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!analyser) return undefined;

    let animFrame = null;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
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

      animFrame = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [analyser]);

  return (
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
  );
}

export default function Home() {
  const [settings, setSettings] = useState(null);
  const [copied, setCopied] = useState(false);
  const {
    isRecording,
    status,
    processed,
    notice,
    errorMsg,
    micPermission,
    failedRecordingId,
    retrying,
    analyser,
    toggleRecording,
    retryFailedRecording,
    discardFailedRecording,
    clearResult,
  } = useRecorder();

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
  }, []);

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
            onClick={toggleRecording}
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

          <AudioMeter analyser={analyser} />
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
            <button className="btn btn-ghost" onClick={clearResult}>クリア</button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">
          <div>{errorMsg}</div>
          {failedRecordingId && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" onClick={retryFailedRecording} disabled={retrying}>
                {retrying ? '再送信中...' : '録音データを再送信'}
              </button>
              <button className="btn btn-ghost" onClick={discardFailedRecording} disabled={retrying}>
                破棄
              </button>
            </div>
          )}
        </div>
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
