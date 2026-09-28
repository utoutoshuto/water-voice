import React, { useEffect, useState } from 'react';
import Home from './pages/Home';
import FileTranscribe from './pages/FileTranscribe';
import Settings from './pages/Settings';
import History from './pages/History';
import Dictionary from './pages/Dictionary';
import Overlay from './pages/Overlay';
import { RecorderProvider } from './hooks/useRecorder';
import './styles/global.css';

const NAV_ITEMS = [
  { id: 'home', label: 'ホーム' },
  { id: 'file', label: 'ファイル' },
  { id: 'settings', label: '設定' },
  { id: 'history', label: '履歴' },
  { id: 'dictionary', label: '辞書' },
];

export default function App() {
  const [page, setPage] = useState('home');
  // null = 判定中。判定前にメイン UI (録音ロジック) をオーバーレイ窓でマウントしないようにする
  const [isOverlay, setIsOverlay] = useState(null);

  useEffect(() => {
    window.electronAPI.isOverlay().then(setIsOverlay);
  }, []);

  if (isOverlay === null) {
    return null;
  }

  if (isOverlay) {
    return <Overlay />;
  }

  return (
    <RecorderProvider>
      <div className="app">
        <nav className="sidebar">
          <div className="app-title">
            <span className="app-icon">●</span>
            <span>Water Voice</span>
          </div>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li
                key={item.id}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </nav>
        <main className="content">
          {page === 'home' && <Home />}
          {page === 'file' && <FileTranscribe />}
          {page === 'settings' && <Settings />}
          {page === 'history' && <History />}
          {page === 'dictionary' && <Dictionary />}
        </main>
      </div>
    </RecorderProvider>
  );
}
