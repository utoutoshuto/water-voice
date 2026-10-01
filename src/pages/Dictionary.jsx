import React, { useEffect, useState } from 'react';

const MAX_WORDS = 800;
const MAX_SNIPPETS = 100;

export default function Dictionary() {
  const [words, setWords] = useState([]);
  const [input, setInput] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [snippetTrigger, setSnippetTrigger] = useState('');
  const [snippetText, setSnippetText] = useState('');
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    window.electronAPI.getSettings().then((settings) => {
      setWords(settings.customDictionary || []);
      setSnippets(settings.snippets || []);
    });
  }, []);

  const save = async (newWords) => {
    const result = await window.electronAPI.saveSettings({ customDictionary: newWords });
    if (!result.success) {
      setErrorMsg(result.error || '辞書の保存に失敗しました。');
      return;
    }
    setErrorMsg('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveSnippets = async (newSnippets) => {
    const result = await window.electronAPI.saveSettings({ snippets: newSnippets });
    if (!result.success) {
      setErrorMsg(result.error || 'スニペットの保存に失敗しました。');
      return;
    }
    setErrorMsg('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addWord = () => {
    const trimmed = input.trim();
    if (!trimmed || words.includes(trimmed)) {
      setInput('');
      return;
    }
    if (words.length >= MAX_WORDS) {
      setErrorMsg(`カスタム辞書は最大${MAX_WORDS}語まで登録できます。`);
      return;
    }

    const newWords = [...words, trimmed];
    setWords(newWords);
    save(newWords);
    setInput('');
  };

  const removeWord = (word) => {
    const newWords = words.filter((item) => item !== word);
    setWords(newWords);
    save(newWords);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') addWord();
  };

  const addSnippet = () => {
    const trigger = snippetTrigger.trim();
    const text = snippetText.trim();
    if (!trigger || !text) return;
    if (snippets.length >= MAX_SNIPPETS) {
      setErrorMsg(`スニペットは最大${MAX_SNIPPETS}件まで登録できます。`);
      return;
    }
    const newSnippets = [...snippets, { trigger, text }];
    setSnippets(newSnippets);
    saveSnippets(newSnippets);
    setSnippetTrigger('');
    setSnippetText('');
  };

  const removeSnippet = (index) => {
    const newSnippets = snippets.filter((_, itemIndex) => itemIndex !== index);
    setSnippets(newSnippets);
    saveSnippets(newSnippets);
  };

  return (
    <div>
      <h1 className="page-title">カスタム辞書</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>
        固有名詞・専門用語・製品名などを登録すると、Gemini APIが優先的に使用します。
        最大{MAX_WORDS}語まで登録可能です（{words.length}/{MAX_WORDS}）。
      </p>

      {saved && <div className="alert alert-success">保存しました</div>}
      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

      <div className="card">
        <div className="dict-input-row">
          <input
            type="text"
            className="form-input"
            placeholder="単語を入力。Enterで追加"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn btn-primary" onClick={addWord}>
            追加
          </button>
        </div>

        {words.length === 0 ? (
          <div style={{ color: '#666', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
            登録された単語はありません
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {words.map((word) => (
              <span key={word} className="dict-tag">
                {word}
                <button onClick={() => removeWord(word)} aria-label={`${word}を削除`}>x</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">スニペット</div>
        <p style={{ color: '#888', fontSize: 14, marginTop: 0, marginBottom: 14 }}>
          トリガー語を話すと、対応する本文に展開します（{snippets.length}/{MAX_SNIPPETS}）。
        </p>
        <div className="form-group">
          <label className="form-label">トリガー語</label>
          <input
            type="text"
            className="form-input"
            placeholder="例: メール署名"
            value={snippetTrigger}
            onChange={(event) => setSnippetTrigger(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">展開する本文</label>
          <textarea
            className="form-input"
            rows={4}
            placeholder="例: よろしくお願いいたします。"
            value={snippetText}
            onChange={(event) => setSnippetText(event.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>
        <button className="btn btn-primary" onClick={addSnippet}>スニペットを追加</button>

        {snippets.length > 0 && (
          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            {snippets.map((snippet, index) => (
              <div key={`${snippet.trigger}-${index}`} style={{ background: '#1a1a1a', borderRadius: 6, padding: 12 }}>
                <div style={{ color: '#8ec5ff', fontSize: 13, marginBottom: 6 }}>{snippet.trigger}</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{snippet.text}</div>
                <button className="btn btn-ghost" onClick={() => removeSnippet(index)} style={{ marginTop: 10, fontSize: 12 }}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">使い方のヒント</div>
        <ul style={{ paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#ccc' }}>
          <li>人名・地名・製品名・技術用語など固有のものを登録</li>
          <li>音声認識で誤認識されやすい単語を登録すると精度が上がる</li>
          <li>例: useEffect, kubectl, PyTorch, 渋谷区, 田中太郎</li>
        </ul>
      </div>
    </div>
  );
}
