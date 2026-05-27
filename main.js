const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, nativeImage, dialog, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const Store = require('electron-store');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  MAX_HISTORY,
  GEMINI_MODELS,
  RETRYABLE_STATUS_CODES,
  normalizeDictionary,
  normalizeSettings,
  buildGeminiInstruction,
  getErrorStatus,
  classifyGeminiError,
  validateAudioPayload,
} = require('./src/shared/waterVoiceCore');

const APP_NAME = 'Water Voice';
const APP_DATA_DIR = app.getPath('appData');
const APP_USER_DATA_DIR = path.join(APP_DATA_DIR, APP_NAME);

app.setName(APP_NAME);
app.setPath('userData', APP_USER_DATA_DIR);

function migrateLegacyStore() {
  const targetConfig = path.join(APP_USER_DATA_DIR, 'config.json');
  if (fs.existsSync(targetConfig)) return;

  const legacyConfigPaths = [
    path.join(APP_DATA_DIR, 'water-voice', 'config.json'),
    path.join(APP_DATA_DIR, 'Aqua Voice', 'config.json'),
  ];

  const sourceConfig = legacyConfigPaths.find((configPath) => fs.existsSync(configPath));
  if (!sourceConfig) return;

  fs.mkdirSync(APP_USER_DATA_DIR, { recursive: true });
  fs.copyFileSync(sourceConfig, targetConfig);
}

migrateLegacyStore();

const store = new Store({
  defaults: {
    apiKey: '',
    hotkey: 'CommandOrControl+Shift+Space',
    language: 'ja-JP',
    removeFillers: true,
    customDictionary: [],
    history: [],
  },
});

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isRecording = false;
let isQuitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.exit(0);
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, stdout: stdout ? stdout.trim() : '' });
    });
  });
}

function sendRecordingState(nextIsRecording) {
  const payload = { isRecording: nextIsRecording };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-state', payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('recording-state', payload);
  }
}

function stopRecordingState({ hideOverlay = true } = {}) {
  isRecording = false;
  if (hideOverlay && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
  sendRecordingState(false);
}

function cancelRecordingState({ hideOverlay = true } = {}) {
  isRecording = false;
  if (hideOverlay && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-cancelled');
  }
}

function positionOverlayNearCursor() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const { screen } = require('electron');
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const { x, y, width, height } = display.workArea;
  overlayWindow.setPosition(
    Math.floor(x + width / 2 - 110),
    Math.floor(y + height - 100)
  );
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Water Voice',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 220,
    height: 60,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.hide();
  positionOverlayNearCursor();
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxoQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADCSURBVFiF7ZYxCsIwFIa/tHQTvYCIg5uCp3DxEB7D0UP0Ai4O4iF0chQPIIqD4OABxKWDi0sTkrxHWqhD/+1/8l4+CISQkJDwX2TMXQB4AyZAn1mRATvgDKwBj6oCgFVVCdQF6lIVoC5Ql6oAdYG6VAWoC9SlKkBdoC5VAeoCdakKUBeoS1WAukBdqgLUBepSFaAuUJeqAHWBulQFqAvUpSpAXaAuVQHqAnWpClAXqEtVgLpAXaoC1AXqUhWgLlCXqgB1gbpUBagL1KUqQF2gLlUB6gJ1qQrQF6hLVfgCRwcYWEIyBxsAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('Water Voice');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '設定を開く',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: `ホットキー: ${store.get('hotkey')}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function refreshTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  createTray();
}

function registerHotkey(hotkey) {
  globalShortcut.unregisterAll();

  if (!hotkey || typeof hotkey !== 'string') {
    return false;
  }

  const success = globalShortcut.register(hotkey, () => {
    toggleRecording();
  });

  if (!success) {
    console.error('Hotkey registration failed:', hotkey);
  }

  return success;
}

function toggleRecording() {
  isRecording = !isRecording;

  if (isRecording) {
    positionOverlayNearCursor();
    overlayWindow?.showInactive();
    sendRecordingState(true);
  } else {
    sendRecordingState(false);
  }
}

function saveGeneratedText(text) {
  clipboard.writeText(text);
  shell.beep();
  return { copied: true, feedback: 'beep' };
}

function getPublicSettings() {
  return {
    apiKey: store.get('apiKey'),
    hotkey: store.get('hotkey'),
    language: store.get('language'),
    removeFillers: store.get('removeFillers'),
    customDictionary: normalizeDictionary(store.get('customDictionary')),
  };
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Gemini request timeout')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function processAudioWithGemini(audioBase64, mimeType, options = {}) {
  validateAudioPayload(audioBase64, mimeType);

  const apiKey = store.get('apiKey');
  if (!apiKey) {
    throw Object.assign(new Error('Gemini APIキーが設定されていません。設定画面で入力してください。'), {
      errorCode: 'GEMINI_API_KEY_MISSING',
    });
  }

  const dictionary = normalizeDictionary(store.get('customDictionary'));
  const removeFillers = options?.removeFillers ?? store.get('removeFillers', true);
  const language = options?.language ?? store.get('language', 'ja-JP');
  const systemInstruction = buildGeminiInstruction({ language, removeFillers, dictionary });
  const genAI = new GoogleGenerativeAI(apiKey);

  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await withTimeout(
          model.generateContent([{ inlineData: { data: audioBase64, mimeType } }]),
          45000
        );
        const text = result.response.text().trim();
        if (!text) {
          throw new Error('Gemini APIから空の結果が返りました。');
        }
        return text;
      } catch (error) {
        lastError = error;
        const status = getErrorStatus(error);
        if (!RETRYABLE_STATUS_CODES.has(status) || attempt === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      }
    }
  }

  const classified = classifyGeminiError(lastError);
  throw Object.assign(new Error(classified.error), { errorCode: classified.errorCode });
}

async function testGeminiApiKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) {
    throw Object.assign(new Error('Gemini APIキーを入力してください。'), {
      errorCode: 'GEMINI_API_KEY_MISSING',
    });
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  await withTimeout(model.generateContent('Return only: ok'), 15000);
}

function addToHistory(entry) {
  const processed = typeof entry?.processed === 'string' ? entry.processed.trim() : '';
  const raw = typeof entry?.raw === 'string' ? entry.raw.trim() : '';
  if (!processed) return;

  const history = Array.isArray(store.get('history')) ? store.get('history') : [];
  history.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    processed,
    ...(raw && raw !== processed ? { raw } : {}),
  });

  store.set('history', history.slice(0, MAX_HISTORY));
}

async function checkMicrophonePermission() {
  if (process.platform !== 'darwin') return;

  const status = systemPreferences.getMediaAccessStatus('microphone');

  if (status === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone');
    return;
  }

  if (status === 'denied') {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'マイクへのアクセス許可が必要です',
      message: 'Water Voiceは音声入力のためにマイクへのアクセスが必要です。',
      detail: 'システム設定 > プライバシーとセキュリティ > マイクでWater Voiceを許可してください。',
      buttons: ['閉じる', 'システム設定を開く'],
      defaultId: 1,
    });

    if (response === 1) {
      await runCommand('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone']);
    }
  }
}

ipcMain.handle('get-settings', () => getPublicSettings());

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const normalized = normalizeSettings(settings);
    const oldHotkey = store.get('hotkey');

    Object.entries(normalized).forEach(([key, value]) => {
      store.set(key, value);
    });

    if (normalized.hotkey && normalized.hotkey !== oldHotkey) {
      const success = registerHotkey(normalized.hotkey);
      if (!success) {
        store.set('hotkey', oldHotkey);
        registerHotkey(oldHotkey);
        return {
          success: false,
          errorCode: 'HOTKEY_REGISTER_FAILED',
          error: `「${normalized.hotkey}」の登録に失敗しました。他のアプリと競合している可能性があります。`,
        };
      }
      refreshTray();
    }

    return { success: true };
  } catch (error) {
    return { success: false, errorCode: 'SETTINGS_SAVE_FAILED', error: error.message };
  }
});

ipcMain.handle('get-history', () => {
  const history = store.get('history', []);
  return Array.isArray(history) ? history : [];
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return { success: true };
});

ipcMain.handle('process-audio-with-gemini', async (event, payload = {}) => {
  try {
    const result = await processAudioWithGemini(payload.audioBase64, payload.mimeType, payload.options);
    return { success: true, text: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: error.errorCode || classifyGeminiError(error).errorCode,
    };
  }
});

ipcMain.handle('test-gemini-api-key', async (event, payload = {}) => {
  try {
    await testGeminiApiKey(payload.apiKey);
    return { success: true };
  } catch (error) {
    const classified = classifyGeminiError(error);
    return {
      success: false,
      error: error.errorCode ? error.message : classified.error,
      errorCode: error.errorCode || classified.errorCode,
    };
  }
});

ipcMain.handle('insert-text', async (event, payload = {}) => {
  try {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const raw = typeof payload.raw === 'string' ? payload.raw : '';
    stopRecordingState({ hideOverlay: true });
    addToHistory({ raw, processed: text });

    const saveResult = saveGeneratedText(text);
    return { success: true, ...saveResult };
  } catch (error) {
    return { success: false, errorCode: 'SAVE_TEXT_FAILED', error: error.message };
  }
});

ipcMain.handle('save-generated-text', async (event, payload = {}) => {
  try {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const raw = typeof payload.raw === 'string' ? payload.raw : '';
    stopRecordingState({ hideOverlay: true });
    addToHistory({ raw, processed: text });

    const saveResult = saveGeneratedText(text);
    return { success: true, ...saveResult };
  } catch (error) {
    return { success: false, errorCode: 'SAVE_TEXT_FAILED', error: error.message };
  }
});

ipcMain.handle('get-active-app', async () => 'Unknown');

ipcMain.handle('cancel-recording', () => {
  cancelRecordingState({ hideOverlay: true });
  return { success: true };
});

ipcMain.handle('is-overlay', (event) => {
  return Boolean(overlayWindow && event.sender === overlayWindow.webContents);
});

ipcMain.handle('get-login-item', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-login-item', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: true });
  return { success: true };
});

ipcMain.handle('check-mic-permission', async () => {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('microphone');
});

app.whenReady().then(async () => {
  await checkMicrophonePermission();
  createMainWindow();
  createOverlayWindow();
  createTray();
  registerHotkey(store.get('hotkey'));

  app.on('activate', () => {
    mainWindow?.show();
  });
});

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
