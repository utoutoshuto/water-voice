const MAX_HISTORY = 100;
const MAX_DICTIONARY_WORDS = 800;
const MAX_SNIPPETS = 100;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 2000;
const MAX_AUDIO_BASE64_LENGTH = 40 * 1024 * 1024;
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash'];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503, 504]);
const ALLOWED_SETTINGS_KEYS = new Set([
  'apiKey',
  'hotkey',
  'language',
  'model',
  'removeFillers',
  'customDictionary',
  'customInstructions',
  'outputLanguage',
  'snippets',
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

function normalizeSnippets(value) {
  if (!Array.isArray(value)) return [];

  const snippets = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const trigger = typeof item.trigger === 'string' ? item.trigger.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!trigger || !text) continue;
    snippets.push({ trigger, text });
    if (snippets.length >= MAX_SNIPPETS) break;
  }
  return snippets;
}

function normalizeOutputLanguage(value) {
  const language = typeof value === 'string' ? value.trim() : '';
  if (language === 'same') return language;
  return /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language) ? language : 'same';
}

function getGeminiModelOrder(model) {
  const selected = GEMINI_MODELS.includes(model) ? model : DEFAULT_GEMINI_MODEL;
  return [selected, ...GEMINI_MODELS.filter((item) => item !== selected)];
}

function normalizeSettings(settings = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;

    if (key === 'apiKey' || key === 'hotkey' || key === 'language') {
      normalized[key] = typeof value === 'string' ? value.trim() : '';
    } else if (key === 'model') {
      normalized[key] = GEMINI_MODELS.includes(value) ? value : DEFAULT_GEMINI_MODEL;
    } else if (key === 'removeFillers') {
      normalized[key] = Boolean(value);
    } else if (key === 'customDictionary') {
      normalized[key] = normalizeDictionary(value);
    } else if (key === 'customInstructions') {
      normalized[key] = typeof value === 'string' ? value.trim().slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH) : '';
    } else if (key === 'outputLanguage') {
      normalized[key] = normalizeOutputLanguage(value);
    } else if (key === 'snippets') {
      normalized[key] = normalizeSnippets(value);
    }
  }

  return normalized;
}

function buildGeminiInstruction({ language, removeFillers, dictionary = [], customInstructions = '', outputLanguage = 'same', snippets = [] }) {
  const inputLanguageInstruction = language === 'auto'
    ? '音声の言語は自動判別してください。多言語が混在している場合も、そのまま正確に扱ってください。'
    : `音声の言語は「${language}」です。その言語として自然な文章に整形してください。`;
  const outputLanguageInstruction = outputLanguage === 'same'
    ? '話された言語のまま出力する'
    : `出力は「${outputLanguage}」に翻訳する`;
  let instruction = `あなたは音声文字起こし・テキスト整形アシスタントです。
${inputLanguageInstruction}
ユーザーから音声データが届いたら、以下のルールに従って処理したテキストのみを返してください。

ルール:
1. 意味を変えずに自然な文章に整形する
2. ${removeFillers ? 'えー、あー、えっと、うーん などのフィラーワードを除去する' : 'フィラーワードはそのまま保持する'}
3. 句読点を適切に追加する。話し言葉らしい自然なトーンを保つ
4. 段落区切りが自然な位置にあれば改行を入れる
5. ${outputLanguageInstruction}
6. 整形したテキストのみを返す。説明文、前置き、補足は不要`;

  if (dictionary.length > 0) {
    instruction += `\n\nカスタム辞書（これらの単語を正確に使用すること）:\n${dictionary.join(', ')}`;
  }

  if (snippets.length > 0) {
    instruction += `\n\nスニペット: 音声中でトリガー語が話された場合、対応する本文に展開してください。\n${snippets.map(({ trigger, text }) => `- ${trigger}: ${text}`).join('\n')}`;
  }

  if (customInstructions) {
    instruction += `\n\n追加指示:\n${customInstructions}`;
  }

  return instruction;
}

function getErrorStatus(error) {
  const status = error?.status || error?.statusCode || error?.code;
  if (typeof status === 'number') return status;

  const message = String(error?.message || '');
  const match = message.match(/\b(400|401|403|404|429|500|503|504)\b/);
  return match ? Number(match[1]) : null;
}

function classifyGeminiError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || '');

  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(message)) {
    return {
      errorCode: 'GEMINI_AUTH',
      error: 'Gemini APIキーを確認してください。',
    };
  }
  if (status === 404) {
    return {
      errorCode: 'GEMINI_MODEL_NOT_FOUND',
      error: '選択したGeminiモデルが見つかりません。別のモデルをお試しください。',
    };
  }
  if (status === 400) {
    return {
      errorCode: 'GEMINI_INVALID_REQUEST',
      error: 'Gemini APIへのリクエストが不正です。音声形式と設定を確認してください。',
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

function shouldFallbackGeminiError(error) {
  const { errorCode } = classifyGeminiError(error);
  return errorCode !== 'GEMINI_AUTH' && errorCode !== 'GEMINI_INVALID_REQUEST';
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
  MAX_SNIPPETS,
  MAX_CUSTOM_INSTRUCTIONS_LENGTH,
  MAX_AUDIO_BASE64_LENGTH,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  RETRYABLE_STATUS_CODES,
  ALLOWED_SETTINGS_KEYS,
  normalizeDictionary,
  normalizeSnippets,
  normalizeOutputLanguage,
  normalizeSettings,
  getGeminiModelOrder,
  buildGeminiInstruction,
  getErrorStatus,
  classifyGeminiError,
  shouldFallbackGeminiError,
  validateAudioPayload,
};
