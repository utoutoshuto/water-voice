import React, { useState, useEffect, useRef } from 'react';

const LANGUAGES = [
  { value: 'ja-JP', label: '日本語' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'zh-CN', label: '中文 (简体)' },
  { value: 'zh-TW', label: '中文 (繁體)' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
];

function keyEventToElectron(e) {
  const parts = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const ignored = ['Meta', 'Control', 'Alt', 'Shift'];
  if (!ignored.includes(e.key)) {
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);
  }

  return parts.length > 1 || (parts.length === 1 && !['Command','Control','Alt','Shift'].includes(parts[0]))
    ? parts.join('+')
    : null;
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
        {value}
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

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
    window.electronAPI.getLoginItem().then(setLaunchAtLogin);
  }, []);

  const handleSave = async () => {
    setSavedMsg('');
    setErrorMsg('');
    const result = await window.electronAPI.saveSettings(settings);
    if (result.success) {
      setSavedMsg('設定を保存しました ✅');
      setTimeout(() => setSavedMsg(''), 3000);
    } else {
      setErrorMsg(result.error);
    }
  };

  const handleLoginToggle = async (enabled) => {
    setLaunchAtLogin(enabled);
    await window.electronAPI.setLoginItem(enabled);
  };

  const update = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  if (!settings) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>;

  return (
    <div>
      <h1 className="page-title">⚙️ 設定</h1>

      {savedMsg && <div className="alert alert-success">{savedMsg}</div>}
      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

      {/* API Key */}
      <div className="card">
        <div className="card-title">Claude API キー</div>
        <div className="form-group">
          <label className="form-label">API キー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              className="form-input"
              placeholder="sk-ant-..."
              value={settings.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
            />
            <button className="btn btn-ghost" onClick={() => setShowApiKey(!showApiKey)} style={{ flexShrink: 0 }}>
              {showApiKey ? '🙈' : '👁'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            Anthropic Console から取得できます。キーはローカルに暗号化して保存されます。
          </p>
        </div>
      </div>

      {/* Hotkey */}
      <div className="card">
        <div className="card-title">ホットキー</div>
        <div className="form-group">
          <label className="form-label">録音開始/停止キー</label>
          <HotkeyRecorder value={settings.hotkey} onChange={(v) => update('hotkey', v)} />
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            「変更」を押してからキーを入力してください。変更後は保存が必要です。
          </p>
        </div>
      </div>

      {/* Language */}
      <div className="card">
        <div className="card-title">音声認識</div>
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
      </div>

      {/* Behavior */}
      <div className="card">
        <div className="card-title">動作設定</div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">自動テキスト挿入</div>
            <div className="toggle-desc">整形後に自動でテキストを貼り付ける</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={settings.autoInsert}
              onChange={(e) => update('autoInsert', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">フィラーワード除去</div>
            <div className="toggle-desc">「えー」「あー」「えっと」などを自動削除</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={settings.removeFillers}
              onChange={(e) => update('removeFillers', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-label">ログイン時に自動起動</div>
            <div className="toggle-desc">OS 起動時にバックグラウンドで自動起動する</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={launchAtLogin}
              onChange={(e) => handleLoginToggle(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 15, padding: '10px 32px' }}>
        保存
      </button>
    </div>
  );
}
