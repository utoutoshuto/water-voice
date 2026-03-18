import React, { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [settings, setSettings] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [processed, setProcessed] = useState('');
  const [status, setStatus] = useState('idle'); // idle | recording | processing | done | error
  const [errorMsg, setErrorMsg] = useState('');

  const recognitionRef = useRef(null);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);

    // Listen for recording state changes from main process (hotkey)
    window.electronAPI.onRecordingState(({ isRecording: rec }) => {
      if (rec) {
        startRecording();
      } else {
        stopRecording();
      }
    });

    return () => {
      window.electronAPI.removeRecordingStateListener();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg('このブラウザは音声認識をサポートしていません');
      setStatus('error');
      return;
    }

    setStatus('recording');
    setIsRecording(true);
    setTranscript('');
    setInterimTranscript('');
    setProcessed('');
    setErrorMsg('');

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = settings?.language || 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalText);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setErrorMsg(`音声認識エラー: ${event.error}`);
        setStatus('error');
      }
    };

    recognition.onend = () => {
      // If recording was still active (e.g., network timeout), restart
      if (recognitionRef.current === recognition && isRecording) {
        try {
          recognition.start();
        } catch (e) {
          // Already stopped
        }
      }
    };

    recognition.start();
  };

  const stopRecording = async () => {
    setIsRecording(false);

    const finalText = transcript + interimTranscript;

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (!finalText.trim()) {
      setStatus('idle');
      return;
    }

    setStatus('processing');
    setInterimTranscript('');

    const result = await window.electronAPI.processWithClaude(finalText, {
      removeFillers: settings?.removeFillers,
    });

    if (result.success) {
      setProcessed(result.text);
      setStatus('done');

      if (settings?.autoInsert) {
        await window.electronAPI.insertText(result.text, finalText);
      }
    } else {
      setErrorMsg(result.error);
      setStatus('error');
    }
  };

  const handleManualToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (!settings) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>;

  const noApiKey = !settings.apiKey;

  return (
    <div>
      <h1 className="page-title">🎙️ Aqua Voice</h1>

      {noApiKey && (
        <div className="alert alert-info">
          ⚠️ Claude API キーが未設定です。設定画面で入力してください。
        </div>
      )}

      {/* Hotkey info */}
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
            上のホットキーを押すと録音開始/停止します
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

      {/* Recording indicator */}
      {status === 'recording' && (
        <div className="card">
          <div className="recording-active">
            <div className="recording-pulse">🎙️</div>
            <div style={{ color: '#f97316', fontWeight: 600 }}>録音中...</div>
            <div style={{ width: '100%' }}>
              {transcript && (
                <div className="transcript-box" style={{ marginBottom: 8 }}>
                  {transcript}
                </div>
              )}
              {interimTranscript && (
                <div className="transcript-box transcript-interim">
                  {interimTranscript}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚙️</div>
            <div>Claude API でテキストを整形中...</div>
            {transcript && (
              <div className="transcript-box" style={{ marginTop: 12, textAlign: 'left' }}>
                {transcript}
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="card">
          <div className="card-title">整形結果</div>
          <div className="transcript-box" style={{ marginBottom: 12 }}>
            {processed}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => copyToClipboard(processed)}>
              📋 コピー
            </button>
            <button className="btn btn-ghost" onClick={() => setStatus('idle')}>
              クリア
            </button>
          </div>
          {transcript && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>元のテキスト:</div>
              <div style={{ fontSize: 13, color: '#666' }}>{transcript}</div>
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">
          ❌ {errorMsg}
        </div>
      )}

      {/* How to use */}
      <div className="card">
        <div className="card-title">使い方</div>
        <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#ccc' }}>
          <li>設定画面でClaude APIキーを入力</li>
          <li>どのアプリでも <kbd style={{ background: '#242424', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{settings.hotkey}</kbd> を押す</li>
          <li>話す（録音中は画面下にインジケーターが表示）</li>
          <li>もう一度ホットキーを押す → AIが整形してテキストを挿入</li>
        </ol>
      </div>
    </div>
  );
}
