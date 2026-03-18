import React, { useState, useEffect } from 'react';
import Home from './pages/Home';
import Settings from './pages/Settings';
import History from './pages/History';
import Dictionary from './pages/Dictionary';
import Overlay from './pages/Overlay';
import './styles/global.css';

export default function App() {
  const [page, setPage] = useState('home');
  const [isOverlay, setIsOverlay] = useState(false);

  useEffect(() => {
    window.electronAPI.isOverlay().then((result) => {
      setIsOverlay(result);
    });
  }, []);

  if (isOverlay) {
    return <Overlay />;
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="app-title">
          <span className="app-icon">🎙️</span>
          <span>Aqua Voice</span>
        </div>
        <ul className="nav-list">
          <li
            className={`nav-item ${page === 'home' ? 'active' : ''}`}
            onClick={() => setPage('home')}
          >
            🏠 ホーム
          </li>
          <li
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            ⚙️ 設定
          </li>
          <li
            className={`nav-item ${page === 'history' ? 'active' : ''}`}
            onClick={() => setPage('history')}
          >
            📋 履歴
          </li>
          <li
            className={`nav-item ${page === 'dictionary' ? 'active' : ''}`}
            onClick={() => setPage('dictionary')}
          >
            📖 辞書
          </li>
        </ul>
      </nav>
      <main className="content">
        {page === 'home' && <Home />}
        {page === 'settings' && <Settings />}
        {page === 'history' && <History />}
        {page === 'dictionary' && <Dictionary />}
      </main>
    </div>
  );
}
