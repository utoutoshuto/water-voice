const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, clipboard, nativeImage, dialog, systemPreferences } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const Store = require('electron-store');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const store = new Store({
  defaults: {
    apiKey: '',
    hotkey: 'CommandOrControl+Shift+Space',
    language: 'ja-JP',
    autoInsert: true,
    removeFillers: true,
    customDictionary: [],
    history: [],
  },
});

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isRecording = false;

// ===== Window Creation =====

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
    titleBarStyle: 'hiddenInset',
    title: 'Water Voice',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
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
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  overlayWindow.hide();

  // Position: bottom center of screen
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  overlayWindow.setPosition(
    Math.floor(width / 2 - 110),
    height - 100
  );
}

// ===== Tray =====

function createTray() {
  // Use a simple template image or fallback to text
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA7AAAAOwBeShxoQAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADCSURBVFiF7ZYxCsIwFIa/tHQTvYCIg5uCp3DxEB7D0UP0Ai4O4iF0chQPIIqD4OABxKWDi0sTkrxHWqhD/+1/8l4+CISQkJDwX2TMXQB4AyZAn1mRATvgDKwBj6oCgFVVCdQF6lIVoC5Ql6oAdYG6VAWoC9SlKkBdoC5VAeoCdakKUBeoS1WAukBdqgLUBepSFaAuUJeqAHWBulQFqAvUpSpAXaAuVQHqAnWpClAXqEtVgLpAXaoC1AXqUhWgLlCXqgB1gbpUBagL1KUqQF2gLlUB6gJ1qQrQF6hLVfgCRwcYWEIyBxsAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('Water Voice');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '設定を開く',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
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
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// ===== Global Hotkey =====

function registerHotkey(hotkey) {
  globalShortcut.unregisterAll();

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
    overlayWindow.show();
    mainWindow.webContents.send('recording-state', { isRecording: true });
    overlayWindow.webContents.send('recording-state', { isRecording: true });
  } else {
    mainWindow.webContents.send('recording-state', { isRecording: false });
    overlayWindow.webContents.send('recording-state', { isRecording: false });
  }
}

// ===== Text Insertion =====

async function getActiveApp() {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      exec(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        (err, stdout) => {
          resolve(err ? 'Unknown' : stdout.trim());
        }
      );
    } else {
      resolve('Unknown');
    }
  });
}

async function insertText(text) {
  clipboard.writeText(text);

  return new Promise((resolve) => {
    setTimeout(() => {
      if (process.platform === 'darwin') {
        exec(
          `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
          (err) => {
            resolve(!err);
          }
        );
      } else if (process.platform === 'win32') {
        exec(
          `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
          (err) => {
            resolve(!err);
          }
        );
      } else {
        // Linux: xdotool
        exec('xdotool key ctrl+v', (err) => {
          resolve(!err);
        });
      }
    }, 100);
  });
}

// ===== Gemini API =====

async function processAudioWithGemini(audioBase64, mimeType, options = {}) {
  const apiKey = store.get('apiKey');
  if (!apiKey) {
    throw new Error('Gemini API キーが設定されていません。設定画面で入力してください。');
  }

  const dictionary = store.get('customDictionary', []);
  const removeFillers = options.removeFillers ?? store.get('removeFillers', true);

  let systemInstruction = `あなたは音声文字起こし・テキスト整形アシスタントです。
ユーザーから音声データが届いたら、以下のルールに従って処理したテキストのみを返してください。

ルール:
1. 意味を変えずに自然な文章に整形する
2. ${removeFillers ? 'えー、あー、えっと、うーん などのフィラーワードを除去する' : 'フィラーワードはそのまま保持する'}
3. 適切な句読点を追加する
4. 段落区切りが自然な位置にあれば改行を入れる
5. 整形したテキストのみを返す（説明文・前置き・補足は不要）`;

  if (dictionary.length > 0) {
    systemInstruction += `\n\nカスタム辞書（これらの単語を正確に使用すること）:\n${dictionary.join(', ')}`;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  });

  const result = await model.generateContent([
    { inlineData: { data: audioBase64, mimeType } },
    { text: 'この音声を文字起こしして整形してください。' },
  ]);

  return result.response.text();
}

// ===== History =====

function addToHistory(entry) {
  const history = store.get('history', []);
  history.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // 最大100件保持
  if (history.length > 100) history.pop();
  store.set('history', history);
}

// ===== IPC Handlers =====

ipcMain.handle('get-settings', () => {
  return {
    apiKey: store.get('apiKey'),
    hotkey: store.get('hotkey'),
    language: store.get('language'),
    autoInsert: store.get('autoInsert'),
    removeFillers: store.get('removeFillers'),
    customDictionary: store.get('customDictionary'),
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  const oldHotkey = store.get('hotkey');

  Object.entries(settings).forEach(([key, value]) => {
    store.set(key, value);
  });

  if (settings.hotkey && settings.hotkey !== oldHotkey) {
    const success = registerHotkey(settings.hotkey);
    if (!success) {
      store.set('hotkey', oldHotkey);
      return { success: false, error: 'ホットキーの登録に失敗しました' };
    }
    // Tray menu更新
    createTray();
  }

  return { success: true };
});

ipcMain.handle('get-history', () => {
  return store.get('history', []);
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return { success: true };
});

ipcMain.handle('process-audio-with-gemini', async (event, { audioBase64, mimeType, options }) => {
  try {
    const result = await processAudioWithGemini(audioBase64, mimeType, options);
    return { success: true, text: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('insert-text', async (event, { text, raw }) => {
  try {
    overlayWindow.hide();
    isRecording = false;

    addToHistory({ raw, processed: text });

    const autoInsert = store.get('autoInsert', true);
    if (autoInsert) {
      await insertText(text);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-active-app', async () => {
  const appName = await getActiveApp();
  return appName;
});

ipcMain.handle('cancel-recording', () => {
  isRecording = false;
  overlayWindow.hide();
  mainWindow.webContents.send('recording-state', { isRecording: false });
  overlayWindow.webContents.send('recording-state', { isRecording: false });
  return { success: true };
});

ipcMain.handle('is-overlay', (event) => {
  return event.sender === overlayWindow.webContents;
});

// ===== Microphone Permission =====

async function checkMicrophonePermission() {
  if (process.platform !== 'darwin') return;

  const status = systemPreferences.getMediaAccessStatus('microphone');

  if (status === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone');
  } else if (status === 'denied') {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'マイクのアクセス権限が必要です',
      message: 'Water Voice はマイクへのアクセスが許可されていません',
      detail:
        'システム設定 → プライバシーとセキュリティ → マイク で\nWater Voice を許可してください。',
      buttons: ['閉じる', 'システム設定を開く'],
      defaultId: 1,
    });
    if (response === 1) {
      exec(
        'open x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      );
    }
  }
}

// ===== Login Item =====

ipcMain.handle('get-login-item', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-login-item', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  return { success: true };
});

ipcMain.handle('check-mic-permission', async () => {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('microphone');
});

// ===== App Lifecycle =====

app.whenReady().then(async () => {
  await checkMicrophonePermission();
  createMainWindow();
  createOverlayWindow();
  createTray();

  const hotkey = store.get('hotkey');
  registerHotkey(hotkey);

  app.on('activate', () => {
    mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // macOSではウィンドウを閉じてもアプリを終了しない
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
