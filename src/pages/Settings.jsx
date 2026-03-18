import React, { useState, useEffect } from 'react';

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

const HOTKEYS = [
  'CommandOrControl+Shift+Space',
  'CommandOrControl+Shift+V',
  'CommandOrControl+Alt+Space',
  'Alt+Space',
  'F9',
  'F10',
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
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

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

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
          <label className="form-label">APIキー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              className="form-input"
              placeholder="sk-ant-..."
              value={settings.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
            />
            <button
              className="btn btn-ghost"
              onClick={() => setShowApiKey(!showApiKey)}
              style={{ flexShrink: 0 }}
            >
              {showApiKey ? '🙈' : '👁'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            Anthropic Console からAPIキーを取得できます。キーはローカルに暗号化して保存されます。
          </p>
        </div>
      </div>

      {/* Hotkey */}
      <div className="card">
        <div className="card-title">ホットキー</div>
        <div className="form-group">
          <label className="form-label">録音開始/停止キー</label>
          <select
            className="form-select"
            value={settings.hotkey}
            onChange={(e) => update('hotkey', e.target.value)}
          >
            {HOTKEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            変更後は保存が必要です。他のアプリと競合する場合は別のキーを選択してください。
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
            <input
              type="checkbox"
              checked={settings.autoInsert}
              onChange={(e) => update('autoInsert', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
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
      </div>

      <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 15, padding: '10px 32px' }}>
        保存
      </button>
    </div>
  );
}
