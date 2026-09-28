const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, nativeImage, dialog, safeStorage, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const Store = require('electron-store');
const { GoogleGenAI } = require('@google/genai');
const {
  MAX_HISTORY,
  DEFAULT_GEMINI_MODEL,
  RETRYABLE_STATUS_CODES,
  normalizeDictionary,
  normalizeSnippets,
  normalizeSettings,
  getApiKeyLast4,
  getGeminiModelOrder,
  getThinkingConfig,
  buildGeminiInstruction,
  getErrorStatus,
  classifyGeminiError,
  shouldFallbackGeminiError,
  validateAudioPayload,
} = require('./src/shared/waterVoiceCore');
const {
  RECORDING_PHASE,
  RECORDING_EVENT,
  nextRecordingPhase,
} = require('./src/shared/recorderCore');

const APP_NAME = 'Water Voice';
const APP_DATA_DIR = app.getPath('appData');
const APP_USER_DATA_DIR = path.join(APP_DATA_DIR, APP_NAME);
const FAILED_RECORDINGS_DIR = path.join(APP_USER_DATA_DIR, 'failed-recordings');
const FAILED_RECORDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

app.setName(APP_NAME);
app.setPath('userData', APP_USER_DATA_DIR);

const store = new Store({
  defaults: {
    apiKeyEncrypted: '',
    hotkey: 'CommandOrControl+Shift+Space',
    language: 'ja-JP',
    model: DEFAULT_GEMINI_MODEL,
    removeFillers: true,
    customDictionary: [],
    microphoneDeviceId: '',
    customInstructions: '',
    outputLanguage: 'same',
    snippets: [],
    history: [],
  },
});

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let recordingPhase = RECORDING_PHASE.IDLE;
let registeredHotkey = null;
let isEscapeRegistered = false;
let isQuitting = false;

function isSafeStorageAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (error) {
    console.warn('safeStorage が利用できないため、APIキーを平文で保存します。', error);
    return false;
  }
}

function getStoredApiKey() {
  const encrypted = store.get('apiKeyEncrypted', '');
  if (encrypted) {
    if (!isSafeStorageAvailable()) {
      console.warn('safeStorage が利用できないため、暗号化済みのAPIキーを読み込めません。');
      return '';
    }
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (error) {
      console.error('暗号化済みAPIキーの復号に失敗しました。', error);
      return '';
    }
  }

  return typeof store.get('apiKey') === 'string' ? store.get('apiKey').trim() : '';
}

function saveApiKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return;

  if (isSafeStorageAvailable()) {
    store.set('apiKeyEncrypted', safeStorage.encryptString(key).toString('base64'));
    store.delete('apiKey');
    return;
  }

  console.warn('safeStorage が利用できないため、APIキーを平文で保存します。');
  store.delete('apiKeyEncrypted');
  store.set('apiKey', key);
}

function deleteApiKey() {
  store.delete('apiKeyEncrypted');
  store.delete('apiKey');
}

function migrateLegacyApiKey() {
  const legacyApiKey = typeof store.get('apiKey') === 'string' ? store.get('apiKey').trim() : '';
  if (!legacyApiKey) return;

  saveApiKey(legacyApiKey);
  if (isSafeStorageAvailable()) store.delete('apiKey');
}

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

function sendRecordingState(phase) {
  const payload = { phase, isRecording: phase === RECORDING_PHASE.RECORDING };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-state', payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('recording-state', payload);
  }
}

// 録音中だけ Esc をグローバルに奪い、どのアプリからでもキャンセルできるようにする
function registerEscapeShortcut() {
  if (isEscapeRegistered) return;
  isEscapeRegistered = globalShortcut.register('Escape', () => {
    dispatchRecordingEvent(RECORDING_EVENT.CANCEL);
  });
}

function unregisterEscapeShortcut() {
  if (!isEscapeRegistered) return;
  globalShortcut.unregister('Escape');
  isEscapeRegistered = false;
}

// 録音状態 (idle | recording | processing) は main が唯一の正とし、
// オーバーレイ表示・Esc 登録・renderer への通知はすべてこの遷移に従う。
function dispatchRecordingEvent(event) {
  const prevPhase = recordingPhase;
  const nextPhase = nextRecordingPhase(prevPhase, event);
  if (nextPhase === prevPhase) return prevPhase;

  recordingPhase = nextPhase;

  if (nextPhase === RECORDING_PHASE.RECORDING) {
    positionOverlayNearCursor();
    overlayWindow?.showInactive();
    registerEscapeShortcut();
  } else {
    unregisterEscapeShortcut();
  }

  if (nextPhase === RECORDING_PHASE.IDLE && overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }

  if (event === RECORDING_EVENT.CANCEL && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording-cancelled');
  }

  sendRecordingState(nextPhase);
  return nextPhase;
}

// 整形結果の保存時に呼ばれる。整形中のときだけ idle に戻す。
function stopRecordingState() {
  dispatchRecordingEvent(RECORDING_EVENT.PROCESSING_DONE);
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

  // 録音ロジックを持つ renderer が再読み込み・クラッシュした場合、録音状態が戻らなくならないよう idle に戻す
  mainWindow.webContents.on('did-finish-load', () => dispatchRecordingEvent(RECORDING_EVENT.FINISH));
  mainWindow.webContents.on('render-process-gone', () => dispatchRecordingEvent(RECORDING_EVENT.FINISH));

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
  // Esc など他のショートカットを消さないよう、自分が登録したホットキーだけ解除する
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }

  if (!hotkey || typeof hotkey !== 'string') {
    return false;
  }

  let success = false;
  try {
    success = globalShortcut.register(hotkey, () => {
      toggleRecording();
    });
  } catch (error) {
    console.error('Hotkey registration error:', error);
  }

  if (success) {
    registeredHotkey = hotkey;
  } else {
    console.error('Hotkey registration failed:', hotkey);
  }

  return success;
}

function toggleRecording() {
  return dispatchRecordingEvent(RECORDING_EVENT.TOGGLE);
}

function saveGeneratedText(text) {
  clipboard.writeText(text);
  shell.beep();
  return { copied: true, feedback: 'beep' };
}

function getPublicSettings() {
  const apiKey = getStoredApiKey();
  return {
    hasApiKey: Boolean(apiKey),
    apiKeyLast4: getApiKeyLast4(apiKey),
    hotkey: store.get('hotkey'),
    language: store.get('language'),
    model: store.get('model', DEFAULT_GEMINI_MODEL),
    removeFillers: store.get('removeFillers'),
    customDictionary: normalizeDictionary(store.get('customDictionary')),
    microphoneDeviceId: store.get('microphoneDeviceId', ''),
    customInstructions: store.get('customInstructions', ''),
    outputLanguage: store.get('outputLanguage', 'same'),
    snippets: normalizeSnippets(store.get('snippets')),
  };
}

async function withTimeout(request, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await request(controller.signal);
  } catch (error) {
    if (timedOut) throw new Error('Gemini request timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function processAudioWithGemini(audioBase64, mimeType, options = {}) {
  validateAudioPayload(audioBase64, mimeType);

  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('Gemini APIキーが設定されていません。設定画面で入力してください。'), {
      errorCode: 'GEMINI_API_KEY_MISSING',
    });
  }

  const dictionary = normalizeDictionary(store.get('customDictionary'));
  const snippets = normalizeSnippets(store.get('snippets'));
  const removeFillers = options?.removeFillers ?? store.get('removeFillers', true);
  const language = options?.language ?? store.get('language', 'ja-JP');
  const customInstructions = store.get('customInstructions', '');
  const outputLanguage = store.get('outputLanguage', 'same');
  const systemInstruction = buildGeminiInstruction({
    language,
    removeFillers,
    dictionary,
    customInstructions,
    outputLanguage,
    snippets,
  });
  const ai = new GoogleGenAI({ apiKey });

  let lastError = null;

  for (const modelName of getGeminiModelOrder(store.get('model', DEFAULT_GEMINI_MODEL))) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await withTimeout((abortSignal) => ai.models.generateContent({
          model: modelName,
          contents: [{ inlineData: { data: audioBase64, mimeType } }],
          config: {
            systemInstruction,
            thinkingConfig: getThinkingConfig(modelName),
            abortSignal,
          },
        }), 45000
        );
        const text = result.text?.trim();
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
    if (!shouldFallbackGeminiError(lastError)) break;
  }

  const classified = classifyGeminiError(lastError);
  throw Object.assign(new Error(classified.error), { errorCode: classified.errorCode });
}

async function testGeminiApiKey(apiKey, model) {
  const key = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : getStoredApiKey();
  if (!key) {
    throw Object.assign(new Error('Gemini APIキーが設定されていません。'), {
      errorCode: 'GEMINI_API_KEY_MISSING',
    });
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const [modelName] = getGeminiModelOrder(model || store.get('model', DEFAULT_GEMINI_MODEL));
  await withTimeout((abortSignal) => ai.models.generateContent({
    model: modelName,
    contents: 'Return only: ok',
    config: { thinkingConfig: getThinkingConfig(modelName), abortSignal },
  }), 15000);
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

// 文字起こし失敗時、録音データを消さずに一時保存しておくための仕組み。
// 成功時 or ユーザーが明示的に破棄した時にのみファイルを削除する。
function ensureFailedRecordingsDir() {
  fs.mkdirSync(FAILED_RECORDINGS_DIR, { recursive: true });
}

function failedRecordingPaths(id) {
  return {
    audioPath: path.join(FAILED_RECORDINGS_DIR, `${id}.audio`),
    metaPath: path.join(FAILED_RECORDINGS_DIR, `${id}.json`),
  };
}

function saveFailedRecording(audioBase64, mimeType, options) {
  ensureFailedRecordingsDir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { audioPath, metaPath } = failedRecordingPaths(id);
  fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));
  fs.writeFileSync(metaPath, JSON.stringify({ mimeType, options, createdAt: new Date().toISOString() }));
  return id;
}

function loadFailedRecording(id) {
  const { audioPath, metaPath } = failedRecordingPaths(id);
  if (!fs.existsSync(audioPath) || !fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const audioBase64 = fs.readFileSync(audioPath).toString('base64');
  return { audioBase64, mimeType: meta.mimeType, options: meta.options };
}

function deleteFailedRecording(id) {
  const { audioPath, metaPath } = failedRecordingPaths(id);
  [audioPath, metaPath].forEach((filePath) => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

function cleanupOldFailedRecordings() {
  try {
    ensureFailedRecordingsDir();
    const now = Date.now();
    fs.readdirSync(FAILED_RECORDINGS_DIR).forEach((file) => {
      const filePath = path.join(FAILED_RECORDINGS_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > FAILED_RECORDING_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (error) {
    console.error('Failed to cleanup old failed recordings:', error);
  }
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
      if (key === 'apiKey') return;
      store.set(key, value);
    });

    if (normalized.apiKey) saveApiKey(normalized.apiKey);

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

ipcMain.handle('delete-api-key', () => {
  deleteApiKey();
  return { success: true };
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
    await testGeminiApiKey(payload.apiKey, payload.model);
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

// ユーザー起点のキャンセル (オーバーレイクリック等)。録音中のみ有効。
ipcMain.handle('cancel-recording', () => {
  dispatchRecordingEvent(RECORDING_EVENT.CANCEL);
  return { success: true };
});

// ホーム画面の録音ボタン。ホットキーと同じ経路で状態遷移させる。
ipcMain.handle('toggle-recording', () => {
  return { success: true, phase: toggleRecording() };
});

// renderer 側の処理終了通知 (成功・失敗・録音が短すぎ・開始失敗)。オーバーレイを閉じて idle に戻す。
ipcMain.handle('finish-recording-session', () => {
  dispatchRecordingEvent(RECORDING_EVENT.FINISH);
  return { success: true };
});

ipcMain.handle('get-recording-phase', () => recordingPhase);

ipcMain.handle('save-failed-recording', (event, payload = {}) => {
  try {
    const id = saveFailedRecording(payload.audioBase64, payload.mimeType, payload.options);
    return { success: true, id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('retry-failed-recording', async (event, payload = {}) => {
  try {
    const record = loadFailedRecording(payload.id);
    if (!record) {
      return { success: false, error: '保存された録音データが見つかりません。' };
    }

    const text = await processAudioWithGemini(record.audioBase64, record.mimeType, record.options);
    deleteFailedRecording(payload.id);
    return { success: true, text };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: error.errorCode || classifyGeminiError(error).errorCode,
    };
  }
});

ipcMain.handle('discard-failed-recording', (event, payload = {}) => {
  try {
    deleteFailedRecording(payload.id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
  migrateLegacyApiKey();
  await checkMicrophonePermission();
  cleanupOldFailedRecordings();
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
