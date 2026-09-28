import React, { useEffect, useState } from 'react';

// macOS で自動貼り付けに必要なアクセシビリティ権限がない場合の案内。
// 権限付与後に戻ってきたときに消えるよう、ウィンドウのフォーカスごとに再確認する。
export default function AccessibilityNotice({ enabled }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const check = () => window.electronAPI.getAccessibilityStatus().then(setStatus).catch(() => setStatus(null));
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [enabled]);

  if (!enabled || !status?.required || status.trusted) return null;

  return (
    <div className="alert alert-info">
      <div>
        自動貼り付けにはアクセシビリティ権限が必要です。許可されるまで、テキストはクリップボードに保存されます。
        システム設定 &gt; プライバシーとセキュリティ &gt; アクセシビリティ で Water Voice を許可してください。
      </div>
      <button
        className="btn btn-ghost"
        onClick={() => window.electronAPI.openAccessibilitySettings()}
        style={{ marginTop: 10, fontSize: 13 }}
      >
        システム設定を開く
      </button>
    </div>
  );
}
