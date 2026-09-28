const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  deleteApiKey: () => ipcRenderer.invoke('delete-api-key'),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryEntry: (id) => ipcRenderer.invoke('delete-history-entry', id),
  updateHistoryEntry: (id, text) => ipcRenderer.invoke('update-history-entry', { id, text }),

  // Gemini API
  processAudioWithGemini: (audioBase64, mimeType, options) =>
    ipcRenderer.invoke('process-audio-with-gemini', { audioBase64, mimeType, options }),
  testGeminiApiKey: (apiKey, model) => ipcRenderer.invoke('test-gemini-api-key', { apiKey, model }),

  // Generated text output
  // 自動貼り付けが有効なら録音開始時の前面アプリへ貼り付け、使えなければクリップボードへ保存する
  saveGeneratedText: (text, raw) => ipcRenderer.invoke('save-generated-text', { text, raw }),

  // Accessibility permission (macOS の自動貼り付けに必要)
  getAccessibilityStatus: () => ipcRenderer.invoke('get-accessibility-status'),
  openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings'),

  // Recording control
  // ユーザー起点のキャンセル (Esc / オーバーレイクリック)
  cancelRecording: () => ipcRenderer.invoke('cancel-recording'),
  // ホットキーと同じ経路で録音開始/停止する
  toggleRecording: () => ipcRenderer.invoke('toggle-recording'),
  // renderer 側の処理終了通知。オーバーレイを閉じて idle に戻す
  finishRecordingSession: () => ipcRenderer.invoke('finish-recording-session'),
  getRecordingPhase: () => ipcRenderer.invoke('get-recording-phase'),

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
