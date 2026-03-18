import React, { useState, useEffect } from 'react';

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
    WebkitAppRegion: 'drag',
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
    background: 'rgba(20, 20, 20, 0.92)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
  },
  processingText: {
    color: '#3b82f6',
  },
  processingDot: {
    background: '#3b82f6',
    animation: 'spin 1s linear infinite',
  },
};

export default function Overlay() {
  const [state, setState] = useState('recording'); // recording | processing

  useEffect(() => {
    window.electronAPI.onRecordingState(({ isRecording }) => {
      if (!isRecording) {
        setState('processing');
        // After insert is done, main process will hide the window
      } else {
        setState('recording');
      }
    });

    return () => {
      window.electronAPI.removeRecordingStateListener();
    };
  }, []);

  const isProcessing = state === 'processing';

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
      <div style={{ ...overlayStyles.container, ...(isProcessing ? overlayStyles.processing : {}) }}>
        <div style={{
          ...overlayStyles.dot,
          ...(isProcessing ? overlayStyles.processingDot : {}),
        }} />
        <span style={{
          ...overlayStyles.text,
          ...(isProcessing ? overlayStyles.processingText : {}),
        }}>
          {isProcessing ? '⚙️ 整形中...' : '🎙 録音中'}
        </span>
      </div>
    </>
  );
}
