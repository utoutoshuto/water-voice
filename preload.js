const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Claude API
  processWithClaude: (transcript, options) =>
    ipcRenderer.invoke('process-with-claude', { transcript, options }),

  // Text insertion
  insertText: (text, raw) => ipcRenderer.invoke('insert-text', { text, raw }),

  // Active app
  getActiveApp: () => ipcRenderer.invoke('get-active-app'),

  // Recording control
  cancelRecording: () => ipcRenderer.invoke('cancel-recording'),

  // Login item
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled) => ipcRenderer.invoke('set-login-item', enabled),

  // Microphone permission
  checkMicPermission: () => ipcRenderer.invoke('check-mic-permission'),

  // Check if this window is the overlay
  isOverlay: () => ipcRenderer.invoke('is-overlay'),

  // Events from main process
  onRecordingState: (callback) => {
    ipcRenderer.on('recording-state', (event, data) => callback(data));
  },

  removeRecordingStateListener: () => {
    ipcRenderer.removeAllListeners('recording-state');
  },
});
