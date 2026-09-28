const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Gemini API
  processAudioWithGemini: (audioBase64, mimeType, options) =>
    ipcRenderer.invoke('process-audio-with-gemini', { audioBase64, mimeType, options }),
  testGeminiApiKey: (apiKey, model) => ipcRenderer.invoke('test-gemini-api-key', { apiKey, model }),

  // Generated text output
  saveGeneratedText: (text, raw) => ipcRenderer.invoke('save-generated-text', { text, raw }),

  // Kept for compatibility. This now saves to clipboard only.
  insertText: (text, raw) => ipcRenderer.invoke('insert-text', { text, raw }),

  // Active app
  getActiveApp: () => ipcRenderer.invoke('get-active-app'),

  // Recording control
  cancelRecording: () => ipcRenderer.invoke('cancel-recording'),

  // Failed recording recovery (文字起こし失敗時の録音データ保全)
  saveFailedRecording: (audioBase64, mimeType, options) =>
    ipcRenderer.invoke('save-failed-recording', { audioBase64, mimeType, options }),
  retryFailedRecording: (id) => ipcRenderer.invoke('retry-failed-recording', { id }),
  discardFailedRecording: (id) => ipcRenderer.invoke('discard-failed-recording', { id }),

  // Login item
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled) => ipcRenderer.invoke('set-login-item', enabled),

  // Microphone permission
  checkMicPermission: () => ipcRenderer.invoke('check-mic-permission'),

  // Check if this window is the overlay
  isOverlay: () => ipcRenderer.invoke('is-overlay'),

  // Events from main process
  onRecordingState: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('recording-state', listener);
    return () => ipcRenderer.removeListener('recording-state', listener);
  },

  onRecordingCancelled: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('recording-cancelled', listener);
    return () => ipcRenderer.removeListener('recording-cancelled', listener);
  },

  removeRecordingStateListener: () => {
    ipcRenderer.removeAllListeners('recording-state');
    ipcRenderer.removeAllListeners('recording-cancelled');
  },
});
