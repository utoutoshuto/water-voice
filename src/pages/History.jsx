import React, { useEffect, useState } from 'react';
import { extractCandidateWords, calculateHistoryStats } from '../shared/historyUtils';

export default function History() {
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 編集関連ステート
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // 辞書追加の候補表示モーダル/カードステート
  const [dictCandidateModal, setDictCandidateModal] = useState(null);
  const [addedWords, setAddedWords] = useState(new Set());

  useEffect(() => {
    window.electronAPI.getHistory().then((data) => {
      setHistory(Array.isArray(data) ? data : []);
    });
  }, []);

  const load = async () => {
    const data = await window.electronAPI.getHistory();
    setHistory(Array.isArray(data) ? data : []);
  };

  const handleClear = async () => {
    if (!confirm('履歴をすべて削除しますか？')) return;
    await window.electronAPI.clearHistory();
    setHistory([]);
  };

  const handleDelete = async (id) => {
    if (!confirm('この履歴エントリを削除しますか？')) return;
    await window.electronAPI.deleteHistoryEntry(id);
    await load();
  };

  const startEditing = (item) => {
    setEditingId(String(item.id));
    setEditText(item.processed || item.raw || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEditing = async (item) => {
    const oldText = item.processed || item.raw || '';
    const newText = editText.trim();

    if (!newText) {
      alert('内容を空にして保存することはできません。');
      return;
    }

    await window.electronAPI.updateHistoryEntry(item.id, newText);
    setEditingId(null);
    setEditText('');
    await load();

    // 差分から候補単語を抽出
    const candidates = extractCandidateWords(oldText, newText);
    if (candidates.length > 0) {
      setAddedWords(new Set());
      setDictCandidateModal({ candidates });
    }
  };

  const handleAddWordToDictionary = async (word) => {
    try {
      const settings = await window.electronAPI.getSettings();
      const currentDict = Array.isArray(settings?.customDictionary) ? settings.customDictionary : [];
      if (!currentDict.includes(word)) {
        const updatedDict = [...currentDict, word];
        await window.electronAPI.saveSettings({ customDictionary: updatedDict });
      }
      setAddedWords((prev) => new Set(prev).add(word));
    } catch (err) {
      console.error('Failed to add word to dictionary:', err);
    }
  };

  const copy = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopied(String(id));
    setTimeout(() => setCopied(null), 1500);
  };

  const formatTime = (iso) => {
    const date = new Date(iso);
    return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stats = calculateHistoryStats(history);

  const filteredHistory = history.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const processed = (item.processed || '').toLowerCase();
    const raw = (item.raw || '').toLowerCase();
    return processed.includes(q) || raw.includes(q);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>履歴</h1>
        {history.length > 0 && (
          <button className="btn btn-danger" onClick={handleClear}>
            全削除
          </button>
        )}
      </div>

      {/* 利用統計カード */}
      <div className="card history-stats-card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>利用統計</div>
        <div className="history-stats-grid">
          <div className="stat-item">
            <div className="stat-value">{stats.totalCount}</div>
            <div className="stat-label">総件数</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.totalChars.toLocaleString()}</div>
            <div className="stat-label">総文字数</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.todayCount}</div>
            <div className="stat-label">今日</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.thisWeekCount}</div>
            <div className="stat-label">今週</div>
          </div>
          <div className="stat-item stat-item-highlight">
            <div className="stat-value">{stats.savedTimeFormatted}</div>
            <div className="stat-label">推定節約時間</div>
          </div>
        </div>
      </div>

      {/* 辞書追加提案通知 */}
      {dictCandidateModal && (
        <div className="card alert-info dict-candidate-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            「カスタム辞書」に追加しますか？
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            編集によって追加された固有名詞候補が検出されました。辞書に登録すると次回以降の文字起こし精度が向上します。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {dictCandidateModal.candidates.map((word) => {
              const isAdded = addedWords.has(word);
              return (
                <button
                  key={word}
                  className={`btn ${isAdded ? 'btn-ghost' : 'btn-primary'}`}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  disabled={isAdded}
                  onClick={() => handleAddWordToDictionary(word)}
                >
                  {isAdded ? `✓ ${word} (追加済み)` : `+ ${word}`}
                </button>
              );
            })}
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setDictCandidateModal(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 検索バー */}
      {history.length > 0 && (
        <div className="form-group" style={{ marginBottom: 20 }}>
          <input
            type="text"
            className="form-input"
            placeholder="履歴を検索 (テキスト部分一致)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {history.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#666' }}>
          <div>まだ履歴がありません</div>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#666' }}>
          <div>「{searchQuery}」に一致する履歴は見つかりませんでした</div>
        </div>
      ) : (
        filteredHistory.map((item) => {
          const isEditing = String(editingId) === String(item.id);
          const text = item.processed || item.raw || '';
          return (
            <div key={item.id} className="history-item">
              <div className="history-meta">
                <span className="history-time">{formatTime(item.timestamp)}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!isEditing && (
                    <>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => startEditing(item)}
                      >
                        編集
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}
                        onClick={() => handleDelete(item.id)}
                      >
                        削除
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => copy(text, item.id)}
                      >
                        {copied === String(item.id) ? 'コピー済み' : 'コピー'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="history-edit-form" style={{ marginTop: 8 }}>
                  <textarea
                    className="form-input"
                    style={{
                      width: '100%',
                      minHeight: 80,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      marginBottom: 8,
                    }}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={cancelEditing}
                    >
                      キャンセル
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      onClick={() => saveEditing(item)}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="history-text">{text}</div>
                  {item.raw && item.raw !== item.processed && (
                    <div className="history-raw">元: {item.raw}</div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
