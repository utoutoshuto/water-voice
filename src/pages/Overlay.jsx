import React, { useEffect, useState } from 'react';

const overlayStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(20, 20, 20, 0.92)',
    backdropFilter: 'blur(10px)',
    borderRadius: 30,
    padding: '10px 18px',
    border: '1px solid rgba(249, 115, 22, 0.4)',
    WebkitAppRegion: 'no-drag',
    cursor: 'pointer',
    userSelect: 'none',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#f97316',
    animation: 'blink 1s ease-in-out infinite',
  },
  text: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f97316',
  },
  processing: {
    border: '1px solid rgba(59, 130, 246, 0.4)',
  },
  processingText: {
    color: '#3b82f6',
  },
  processingDot: {
    background: '#3b82f6',
    animation: 'spin 1s linear infinite',
  },
  // Command Mode は色を変えて通常の音声入力と区別する
  command: {
    border: '1px solid rgba(168, 85, 247, 0.5)',
  },
  commandText: {
    color: '#a855f7',
  },
  commandDot: {
    background: '#a855f7',
  },
};

const LABELS = {
  dictation: { recording: '録音中', processing: '整形中...' },
  command: { recording: 'コマンド: 指示を話す', processing: 'コマンド実行中...' },
};

export default function Overlay() {
  const [state, setState] = useState(null); // null | recording | processing
  const [mode, setMode] = useState('dictation'); // dictation | command

  useEffect(() => {
    // main の録音状態 (idle | recording | processing) にそのまま従う
    const offState = window.electronAPI.onRecordingState(({ phase, mode: nextMode }) => {
      setState(phase === 'recording' || phase === 'processing' ? phase : null);
      setMode(nextMode === 'command' ? 'command' : 'dictation');
    });

    // ウィンドウ非表示中はCSSアニメーション(blink/spin)を止めてGPU/CPU負荷をなくす
    const handleVisibility = () => {
      if (document.hidden) {
        setState(null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      offState();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (!state) return null;

  const isProcessing = state === 'processing';
  const isCommand = mode === 'command';

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        body {
          background: transparent !important;
          overflow: hidden;
        }
        #root {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 60px;
        }
      `}</style>
      <div
        style={{
          ...overlayStyles.container,
          ...(isProcessing ? overlayStyles.processing : {}),
          ...(isCommand ? overlayStyles.command : {}),
        }}
        onClick={() => {
          if (!isProcessing) window.electronAPI.cancelRecording();
        }}
      >
        <div style={{
          ...overlayStyles.dot,
          ...(isProcessing ? overlayStyles.processingDot : {}),
          ...(isCommand ? overlayStyles.commandDot : {}),
        }}
        />
        <span style={{
          ...overlayStyles.text,
          ...(isProcessing ? overlayStyles.processingText : {}),
          ...(isCommand ? overlayStyles.commandText : {}),
        }}
        >
          {LABELS[mode][state]}
        </span>
      </div>
    </>
  );
}
