import React, { useEffect, useRef, useState } from 'react';
import AccessibilityNotice from '../components/AccessibilityNotice';

const LANGUAGES = [
  { value: 'auto', label: '自動判別（多言語混在可）' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'zh-TW', label: '中文 (繁體)' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'fr-FR', label: 'Francais' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Espanol' },
];

const MODELS = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

const KEY_MAP = {
  ' ': 'Space',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Enter: 'Return',
};

function keyEventToElectron(e) {
  if (e.key === 'Escape') return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Command');

  const ignored = ['Meta', 'Control', 'Alt', 'Shift'];
  if (!ignored.includes(e.key)) {
    const key = KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    parts.push(key);
  }

  if (parts.length < 2) return null;
  return parts.join('+');
}

function HotkeyRecorder({ value, onChange }) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef(null);

  const start = () => {
    setRecording(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    e.preventDefault();
    const hotkey = keyEventToElectron(e);
    if (hotkey) {
      onChange(hotkey);
      setRecording(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <kbd style={{
        display: 'inline-block',
        padding: '6px 12px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#ccc',
        minWidth: 180,
        textAlign: 'center',
      }}>
        {value || '未設定'}
      </kbd>
      {recording ? (
        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
          readOnly
          placeholder="キーを押してください..."
          style={{
            background: '#1a3a5c',
            border: '1px solid #4a9eff',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            cursor: 'default',
          }}
        />
      ) : (
        <button className="btn btn-ghost" onClick={start} style={{ fontSize: 13 }}>
          変更
        </button>
      )}
    </div>
  );
}

// マイク選択。'' はシステム既定。選択デバイスが見つからない場合は録音時に既定へフォールバックする。
function MicrophoneSelect({ value, onChange }) {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return undefined;

    const load = () => {
      mediaDevices.enumerateDevices()
        .then((list) => setDevices(list.filter((device) => device.kind === 'audioinput' && device.deviceId)))
        .catch(() => setDevices([]));
    };

    load();
    mediaDevices.addEventListener?.('devicechange', load);
    return () => mediaDevices.removeEventListener?.('devicechange', load);
  }, []);

  const selectable = devices.filter((device) => device.deviceId !== 'default');
  const missing = value && !selectable.some((device) => device.deviceId === value);

  return (
    <select className="form-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">システム既定</option>
      {selectable.map((device, index) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label || `マイク ${index + 1}`}
        </option>
      ))}
      {missing && <option value={value}>(接続されていないマイク) システム既定を使用</option>}
    </select>
  );
}

const TEXT_SAVE_DELAY_MS = 800;
const API_KEY_CHECK_DELAY_MS = 1000;

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState({ state: 'idle', message: '' });

  const savedTimerRef = useRef(null);
  const pendingTextRef = useRef({});
  const textTimerRef = useRef(null);
  const apiKeyTimerRef = useRef(null);
  const lastCheckedKeyRef = useRef('');

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.getLoginItem().then(setLaunchAtLogin);
  }, []);

  const flashSaved = (message = '保存しました') => {
    setSavedMsg(message);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedMsg(''), 1500);
  };

  // 変更した項目だけを即座に保存する。失敗したら(ホットキー競合など)元の値に戻す。
  const saveFields = async (patch, previous) => {
    setErrorMsg('');
    const result = await window.electronAPI.saveSettings(patch);
    if (result.success) {
      flashSaved();
      return true;
    }
    if (previous) setSettings((prev) => ({ ...prev, ...previous }));
    setErrorMsg(result.error || '設定の保存に失敗しました。');
    return false;
  };

  const updateAndSave = (key, value) => {
    const previous = { [key]: settings[key] };
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveFields({ [key]: value }, previous);
  };

  // 長文入力は打ち終わってから保存する。ページ移動・フォーカス外れでも保存する。
  const flushTextSave = () => {
    clearTimeout(textTimerRef.current);
    const patch = pendingTextRef.current;
    pendingTextRef.current = {};
    if (Object.keys(patch).length > 0) saveFields(patch);
  };

  const updateText = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    pendingTextRef.current = { ...pendingTextRef.current, [key]: value };
    clearTimeout(textTimerRef.current);
    textTimerRef.current = setTimeout(flushTextSave, TEXT_SAVE_DELAY_MS);
  };

  useEffect(() => () => {
    flushTextSave();
    clearTimeout(apiKeyTimerRef.current);
    clearTimeout(savedTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // APIキーは接続確認に成功した時だけ保存する。同じキーの確認は 1 回だけ(RPM 節約)。
  const checkAndSaveApiKey = async (rawKey) => {
    const key = rawKey.trim();
    if (!key || key === lastCheckedKeyRef.current) return;
    lastCheckedKeyRef.current = key;

    setErrorMsg('');
    setApiKeyStatus({ state: 'checking', message: '接続確認中...' });
    const test = await window.electronAPI.testGeminiApiKey(key, settings.model);
    if (!test.success) {
      setApiKeyStatus({ state: 'error', message: `${test.error || 'APIキーの接続確認に失敗しました。'}（保存していません）` });
      return;
    }

    const saved = await saveFields({ apiKey: key });
    if (!saved) {
      setApiKeyStatus({ state: 'error', message: 'APIキーの保存に失敗しました。' });
      return;
    }
    setSettings((prev) => ({ ...prev, apiKey: '', hasApiKey: true, apiKeyLast4: key.slice(-4) }));
    setApiKeyStatus({ state: 'success', message: '接続を確認して保存しました。' });
  };

  const handleApiKeyChange = (value) => {
    setSettings((prev) => ({ ...prev, apiKey: value }));
    setApiKeyStatus({ state: 'idle', message: '' });
    clearTimeout(apiKeyTimerRef.current);
    apiKeyTimerRef.current = setTimeout(() => checkAndSaveApiKey(value), API_KEY_CHECK_DELAY_MS);
  };

  const flushApiKey = () => {
    clearTimeout(apiKeyTimerRef.current);
    if (settings?.apiKey) checkAndSaveApiKey(settings.apiKey);
  };

  const handleLoginToggle = async (enabled) => {
    setLaunchAtLogin(enabled);
    const result = await window.electronAPI.setLoginItem(enabled);
    if (!result.success) {
      setLaunchAtLogin(!enabled);
      setErrorMsg(result.error || 'ログイン時起動の変更に失敗しました。');
      return;
    }
    flashSaved();
  };

  const handleApiKeyTest = async () => {
    setErrorMsg('');
    setApiKeyStatus({ state: 'checking', message: '接続確認中...' });
    const result = await window.electronAPI.testGeminiApiKey('', settings.model);
    setApiKeyStatus(result.success
      ? { state: 'success', message: '保存済みのAPIキーで接続できました。' }
      : { state: 'error', message: result.error || 'Gemini APIキーの接続確認に失敗しました。' });
  };

  const handleApiKeyDelete = async () => {
    setErrorMsg('');
    const result = await window.electronAPI.deleteApiKey();
    if (result.success) {
      lastCheckedKeyRef.current = '';
      setSettings((prev) => ({ ...prev, apiKey: '', hasApiKey: false, apiKeyLast4: '' }));
      setApiKeyStatus({ state: 'idle', message: '' });
      flashSaved('APIキーを削除しました');
    } else {
      setErrorMsg(result.error || 'APIキーの削除に失敗しました。');
    }
  };

  const update = updateAndSave;

  if (!settings) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="page-title">設定</h1>
        <span style={{ fontSize: 13, color: '#4ade80', opacity: savedMsg ? 1 : 0, transition: 'opacity 0.3s' }}>
          ✓ {savedMsg || '保存しました'}
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#666', marginTop: -12, marginBottom: 16 }}>変更は自動で保存されます。</p>

      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

      <div className="card">
        <div className="card-title">Gemini APIキー</div>
        <div className="form-group">
          <label className="form-label">APIキー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              className="form-input"
              placeholder={settings.hasApiKey ? `設定済み（末尾: ${settings.apiKeyLast4}）` : 'AIza...'}
              value={settings.apiKey || ''}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              onBlur={flushApiKey}
              onKeyDown={(e) => {
                if (e.key === 'Enter') flushApiKey();
              }}
            />
            <button className="btn btn-ghost" onClick={() => setShowApiKey(!showApiKey)} style={{ flexShrink: 0 }}>
              {showApiKey ? '隠す' : '表示'}
            </button>
            {settings.hasApiKey && !settings.apiKey && (
              <button
                className="btn btn-ghost"
                onClick={handleApiKeyTest}
                disabled={apiKeyStatus.state === 'checking'}
                style={{ flexShrink: 0 }}
              >
                接続確認
              </button>
            )}
            {settings.hasApiKey && (
              <button className="btn btn-ghost" onClick={handleApiKeyDelete} style={{ flexShrink: 0 }}>
                削除
              </button>
            )}
          </div>
          {apiKeyStatus.message && (
            <p style={{
              fontSize: 13,
              marginTop: 8,
              color: { checking: '#aaa', success: '#4ade80', error: '#f87171' }[apiKeyStatus.state] || '#aaa',
            }}>
              {apiKeyStatus.state === 'success' ? '✓ ' : ''}{apiKeyStatus.message}
            </p>
          )}
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            Google AI Studioで取得できます。貼り付けると自動で接続確認し、成功したら保存します。キーはローカルで暗号化して保存されます。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">ホットキー</div>
        <div className="form-group">
          <label className="form-label">録音開始/停止キー</label>
          <HotkeyRecorder value={settings.hotkey} onChange={(value) => update('hotkey', value)} />
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            登録できない場合は他のアプリと競合しているため、元のキーに戻ります。
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">コマンドモード開始/停止キー</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HotkeyRecorder value={settings.commandHotkey} onChange={(value) => update('commandHotkey', value)} />
            {settings.commandHotkey && (
              <button className="btn btn-ghost" onClick={() => update('commandHotkey', '')} style={{ fontSize: 13 }}>
                無効にする
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            選択中のテキストに「もっと簡潔に」「英訳して」などの音声指示を適用し、結果で置き換えます。選択がなければ指示どおりに新しく作成します。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">出力</div>
        <AccessibilityNotice enabled={settings.autoPaste} />
        <div className="toggle-row">
          <div>
            <div className="toggle-label">前面のアプリに自動で貼り付け</div>
            <div className="toggle-desc">録音開始時に前面にあったアプリへ貼り付ける。オフの場合はクリップボードに保存して完了音を鳴らす</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoPaste}
              onChange={(e) => update('autoPaste', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">貼り付け後にクリップボードを復元</div>
            <div className="toggle-desc">貼り付けに使ったクリップボードを、少し待ってから元の内容に戻す</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.restoreClipboard}
              disabled={!settings.autoPaste}
              onChange={(e) => update('restoreClipboard', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-title">アップデート</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">起動時に自動でアップデート</div>
            <div className="toggle-desc">
              起動時に GitHub の最新版を確認し、新しい版があれば自動でダウンロードして再起動します（現在 v{settings.appVersion}）
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => update('autoUpdate', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-title">音声認識</div>
        <div className="form-group">
          <label className="form-label">Geminiモデル</label>
          <select
            className="form-select"
            value={settings.model}
            onChange={(e) => update('model', e.target.value)}
          >
            {MODELS.map((model) => (
              <option key={model.value} value={model.value}>{model.label}</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            利用できない場合は他のモデルに自動で切り替えます。
          </p>
        </div>
        <div className="form-group">
          <label className="form-label">言語</label>
          <select
            className="form-select"
            value={settings.language}
            onChange={(e) => update('language', e.target.value)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">出力言語</label>
          <select
            className="form-select"
            value={settings.outputLanguage}
            onChange={(e) => update('outputLanguage', e.target.value)}
          >
            <option value="same">話した言語のまま</option>
            {LANGUAGES.filter((lang) => lang.value !== 'auto').map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">追加指示</label>
          <textarea
            className="form-input"
            rows={5}
            maxLength={2000}
            placeholder="例: 丁寧語で整形する。箇条書きは維持する。"
            value={settings.customInstructions}
            onChange={(e) => updateText('customInstructions', e.target.value)}
            onBlur={flushTextSave}
            style={{ resize: 'vertical' }}
          />
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            {(settings.customInstructions || '').length}/2000文字
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">マイク</div>
        <div className="form-group">
          <label className="form-label">入力デバイス</label>
          <MicrophoneSelect
            value={settings.microphoneDeviceId}
            onChange={(value) => update('microphoneDeviceId', value)}
          />
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            選択したマイクが見つからない場合はシステム既定のマイクで録音します。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">動作設定</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">フィラーワード除去</div>
            <div className="toggle-desc">「えー」「あー」「えっと」などを自動削除</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.removeFillers}
              onChange={(e) => update('removeFillers', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">ログイン時に自動起動</div>
            <div className="toggle-desc">OS起動時にバックグラウンドで自動起動する</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={launchAtLogin}
              onChange={(e) => handleLoginToggle(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

    </div>
  );
}
