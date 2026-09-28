import React, { useState, useEffect } from 'react';

const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.webm', '.ogg', '.aac', '.flac', '.mp4', '.mov', '.mkv', '.avi'];

export default function FileTranscribe() {
  const [selectedFile, setSelectedFile] = useState(null); // { path, name, size }
  const [mode, setMode] = useState('full'); // 'full' | 'summary' | 'minutes'
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [resultText, setResultText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      setHasApiKey(Boolean(settings && settings.apiKey));
    });
  }, []);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSelectFile = async () => {
    try {
      const res = await window.electronAPI.selectAudioFile();
      if (!res.canceled && res.filePath) {
        setSelectedFile({
          path: res.filePath,
          name: res.fileName,
          size: res.fileSize,
        });
        setErrorMsg('');
        setResultText('');
      }
    } catch (err) {
      setErrorMsg(`ファイル選択エラー: ${err.message}`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const filePath = file.path;
      if (!filePath) return;

      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setErrorMsg(`対応していないファイル形式です (${ext})。音声または動画ファイルを選択してください。`);
        return;
      }

      setSelectedFile({
        path: filePath,
        name: file.name || filePath.split('/').pop() || filePath.split('\\').pop(),
        size: file.size,
      });
      setErrorMsg('');
      setResultText('');
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMsg('');
    setResultText('');
    setProgressMessage('Geminiに送信中...');

    try {
      const res = await window.electronAPI.transcribeFile(selectedFile.path, { mode });
      if (res.success) {
        setResultText(res.text);
      } else {
        if (res.error && res.error.includes('キャンセル')) {
          setErrorMsg('文字起こし処理をキャンセルしました。');
        } else {
          setErrorMsg(res.error || '文字起こし処理に失敗しました。');
        }
      }
    } catch (err) {
      setErrorMsg(`エラーが発生しました: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setProgressMessage('');
    }
  };

  const handleCancel = async () => {
    try {
      await window.electronAPI.cancelFileTranscription();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  const handleCopy = async () => {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveTxt = async () => {
    if (!resultText) return;
    const baseName = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'transcription';
    const defaultFileName = `${baseName}_${mode}.txt`;
    await window.electronAPI.saveTextFile(resultText, defaultFileName);
  };

  return (
    <div className="file-transcribe-page">
      <h1 className="page-title">ファイル文字起こし</h1>

      {!hasApiKey && (
        <div className="alert alert-info">
          Gemini APIキーが未設定です。設定画面で入力してください。
        </div>
      )}

      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

      {/* ファイル選択エリア */}
      <div className="card">
        <div className="card-title">音声・動画ファイル選択</div>
        <div
          className={`dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectFile}
          style={{
            border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: '36px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-elevated)',
            transition: 'all 0.2s',
            marginBottom: selectedFile ? '16px' : '0',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📁</div>
          {selectedFile ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>
                {selectedFile.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                サイズ: {formatFileSize(selectedFile.size)} ({selectedFile.size >= 20 * 1024 * 1024 ? 'Files API送信' : 'Direct送信'})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '8px' }}>
                クリックまたはドラッグ＆ドロップで別のファイルに変更
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>
                ここにファイルをドラッグ＆ドロップ
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                または クリックしてファイルを選択
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                対応形式: mp3, m4a, wav, webm, ogg, aac, flac, mp4, mov, mkv, avi
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 出力モード選択エリア */}
      <div className="card">
        <div className="card-title">出力モード選択</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <button
            type="button"
            className={`btn ${mode === 'full' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('full')}
            disabled={isProcessing}
            style={{
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontWeight: 600 }}>整形した全文</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>話し言葉を自然に整形</span>
          </button>

          <button
            type="button"
            className={`btn ${mode === 'summary' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('summary')}
            disabled={isProcessing}
            style={{
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontWeight: 600 }}>要約 (箇条書き)</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>要点をまとめて箇条書き</span>
          </button>

          <button
            type="button"
            className={`btn ${mode === 'minutes' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('minutes')}
            disabled={isProcessing}
            style={{
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontWeight: 600 }}>議事録</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>決定事項・TODOを抽出</span>
          </button>
        </div>
      </div>

      {/* 実行・進捗エリア */}
      <div style={{ marginBottom: '24px' }}>
        {isProcessing ? (
          <div className="card" style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px' }}>
              {progressMessage || '文字起こし処理中...'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              大きなファイルや動画は数分程度かかる場合があります
            </div>
            <button type="button" className="btn btn-danger" onClick={handleCancel}>
              キャンセル
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTranscribe}
            disabled={!selectedFile || !hasApiKey}
            style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 600 }}
          >
            文字起こしを開始
          </button>
        )}
      </div>

      {/* 結果表示エリア */}
      {resultText && (
        <div className="card">
          <div className="card-title">文字起こし・整形結果</div>
          <div
            className="transcript-box"
            style={{
              marginBottom: '16px',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          >
            {resultText}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={handleCopy}>
              {isCopied ? 'コピーしました！' : 'コピー'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleSaveTxt}>
              .txt で保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
