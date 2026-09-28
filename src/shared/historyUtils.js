/**
 * 履歴関連の純粋ユーティリティ関数
 */

function generateHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 修正前後のテキスト差分から、新しく出現した固有名詞候補（カタカナ語・英数字語・漢字連続など）を抽出する
 */
function extractCandidateWords(oldText = '', newText = '') {
  if (typeof newText !== 'string' || !newText.trim()) return [];
  const safeOldText = typeof oldText === 'string' ? oldText : '';

  // 抽出パターン:
  // - 英数字・ハイフン・アンダースコア (2文字以上)
  // - カタカナ連続・長音 (2文字以上)
  // - 漢字連続 (2文字以上)
  const pattern = /[A-Za-z0-9_-]{2,}|[\u30A1-\u30FC]{2,}|[\u4E00-\u9FFF]{2,}/g;
  const matches = newText.match(pattern) || [];

  const candidates = [];
  const seen = new Set();

  for (const rawWord of matches) {
    const word = rawWord.trim();
    if (!word) continue;
    // 数字のみは固有名詞候補から除外
    if (/^\d+$/.test(word)) continue;

    // 修正前テキストに含まれていない単語を抽出
    if (!safeOldText.includes(word) && !seen.has(word)) {
      seen.add(word);
      candidates.push(word);
    }
  }

  return candidates;
}

/**
 * 秒数を「X分」「X分Y秒」「X時間Y分」等の表示形式にフォーマットする
 */
function formatSavedTime(totalSeconds) {
  if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds <= 0) {
    return '0分';
  }

  const seconds = Math.round(totalSeconds);
  if (seconds < 60) {
    return `${seconds}秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;

  if (minutes < 60) {
    if (remSec === 0) {
      return `${minutes}分`;
    }
    return `${minutes}分${remSec}秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;

  let result = `${hours}時間`;
  if (remMin > 0) result += `${remMin}分`;
  if (remSec > 0) result += `${remSec}秒`;
  return result;
}

/**
 * 履歴から利用統計を計算する
 * タイピング速度: 40文字/分 = 1文字あたり1.5秒 (60 / 40)
 */
function calculateHistoryStats(history = [], now = new Date()) {
  const list = Array.isArray(history) ? history : [];
  const totalCount = list.length;

  let totalChars = 0;
  let todayCount = 0;
  let thisWeekCount = 0;

  const refDate = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();

  // 今日の開始 (00:00:00.000)
  const todayStart = new Date(refDate);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  // 今日の終了 (23:59:59.999)
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayEndMs = todayEnd.getTime();

  // 今週の開始 (月曜 00:00:00.000)
  const weekStart = new Date(todayStart);
  const dayOfWeek = weekStart.getDay(); // 0: 日曜, 1: 月曜, ...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  const weekStartMs = weekStart.getTime();

  for (const item of list) {
    const text = typeof item?.processed === 'string' && item.processed
      ? item.processed
      : (typeof item?.raw === 'string' ? item.raw : '');
    totalChars += text.length;

    if (item?.timestamp) {
      const itemTime = new Date(item.timestamp).getTime();
      if (!isNaN(itemTime)) {
        if (itemTime >= todayStartMs && itemTime < todayEndMs) {
          todayCount += 1;
        }
        if (itemTime >= weekStartMs && itemTime < todayEndMs) {
          thisWeekCount += 1;
        }
      }
    }
  }

  // 40文字/分 (1文字あたり1.5秒)
  const savedTimeSeconds = totalChars * 1.5;
  const savedTimeFormatted = formatSavedTime(savedTimeSeconds);

  return {
    totalCount,
    totalChars,
    todayCount,
    thisWeekCount,
    savedTimeSeconds,
    savedTimeFormatted,
  };
}

module.exports = {
  generateHistoryId,
  extractCandidateWords,
  formatSavedTime,
  calculateHistoryStats,
};
