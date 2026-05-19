import React, { useEffect, useState } from 'react';

export default function History() {
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    load();
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

  const copy = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
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

      {history.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#666' }}>
          <div>まだ履歴がありません</div>
        </div>
      ) : (
        history.map((item) => {
          const text = item.processed || item.raw || '';
          return (
            <div key={item.id} className="history-item">
              <div className="history-meta">
                <span className="history-time">{formatTime(item.timestamp)}</span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => copy(text, item.id)}
                >
                  {copied === item.id ? 'コピー済み' : 'コピー'}
                </button>
              </div>
              <div className="history-text">{text}</div>
              {item.raw && item.raw !== item.processed && (
                <div className="history-raw">元: {item.raw}</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
