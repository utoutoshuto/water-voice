const MAX_HISTORY = 100;
const MAX_DICTIONARY_WORDS = 800;
const MAX_AUDIO_BASE64_LENGTH = 40 * 1024 * 1024;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503, 504]);
const ALLOWED_SETTINGS_KEYS = new Set([
  'apiKey',
  'hotkey',
  'language',
  'removeFillers',
  'customDictionary',
]);

function normalizeDictionary(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const words = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const word = item.trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= MAX_DICTIONARY_WORDS) break;
  }

  return words;
}

function normalizeSettings(settings = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;

    if (key === 'apiKey' || key === 'hotkey' || key === 'language') {
      normalized[key] = typeof value === 'string' ? value.trim() : '';
    } else if (key === 'removeFillers') {
      normalized[key] = Boolean(value);
    } else if (key === 'customDictionary') {
      normalized[key] = normalizeDictionary(value);
    }
  }

  return normalized;
}

function buildGeminiInstruction({ language, removeFillers, dictionary }) {
  let instruction = `あなたは音声文字起こし・テキスト整形アシスタントです。
音声の言語は「${language}」です。その言語として自然な文章に整形してください。
ユーザーから音声データが届いたら、以下のルールに従って処理したテキストのみを返してください。

ルール:
1. 意味を変えずに自然な文章に整形する
2. ${removeFillers ? 'えー、あー、えっと、うーん などのフィラーワードを除去する' : 'フィラーワードはそのまま保持する'}
3. 句読点を適切に追加する。話し言葉らしい自然なトーンを保つ
4. 段落区切りが自然な位置にあれば改行を入れる
5. 整形したテキストのみを返す。説明文、前置き、補足は不要`;

  if (dictionary.length > 0) {
    instruction += `\n\nカスタム辞書（これらの単語を正確に使用すること）:\n${dictionary.join(', ')}`;
  }

  return instruction;
}

function getErrorStatus(error) {
  const status = error?.status || error?.statusCode || error?.code;
  if (typeof status === 'number') return status;

  const message = String(error?.message || '');
  const match = message.match(/\b(429|500|503|504)\b/);
  return match ? Number(match[1]) : null;
}

function classifyGeminiError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || '');

  if (status === 400 || message.includes('API key not valid')) {
    return {
      errorCode: 'GEMINI_AUTH',
      error: 'Gemini APIキーを確認してください。',
    };
  }
  if (status === 429) {
    return {
      errorCode: 'GEMINI_RATE_LIMIT',
      error: 'Gemini APIの利用上限に達しました。少し待ってから再試行してください。',
    };
  }
  if (status === 500 || status === 503 || status === 504) {
    return {
      errorCode: 'GEMINI_TEMPORARY',
      error: 'Gemini APIが一時的に混雑しています。少し待ってから再試行してください。',
    };
  }
  if (message.includes('timeout')) {
    return {
      errorCode: 'GEMINI_TIMEOUT',
      error: 'Gemini APIの応答がタイムアウトしました。通信状態を確認してください。',
    };
  }

  return {
    errorCode: 'GEMINI_ERROR',
    error: message || 'Gemini APIの処理に失敗しました。',
  };
}

function validateAudioPayload(audioBase64, mimeType) {
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    throw Object.assign(new Error('音声データが空です。'), { errorCode: 'INVALID_AUDIO' });
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    throw Object.assign(new Error('音声データが大きすぎます。録音時間を短くしてください。'), {
      errorCode: 'AUDIO_TOO_LARGE',
    });
  }
  if (typeof mimeType !== 'string' || !mimeType.startsWith('audio/')) {
    throw Object.assign(new Error('対応していない音声形式です。'), { errorCode: 'INVALID_AUDIO_TYPE' });
  }
}

module.exports = {
  MAX_HISTORY,
  MAX_DICTIONARY_WORDS,
  MAX_AUDIO_BASE64_LENGTH,
  GEMINI_MODELS,
  RETRYABLE_STATUS_CODES,
  ALLOWED_SETTINGS_KEYS,
  normalizeDictionary,
  normalizeSettings,
  buildGeminiInstruction,
  getErrorStatus,
  classifyGeminiError,
  validateAudioPayload,
};
