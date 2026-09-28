const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DICTIONARY_WORDS,
  MAX_SNIPPETS,
  MAX_CUSTOM_INSTRUCTIONS_LENGTH,
  DEFAULT_GEMINI_MODEL,
  normalizeDictionary,
  normalizeSnippets,
  normalizeSettings,
  getGeminiModelOrder,
  getThinkingConfig,
  buildGeminiInstruction,
  classifyGeminiError,
  shouldFallbackGeminiError,
  validateAudioPayload,
} = require('../src/shared/waterVoiceCore');

test('normalizeDictionary trims, deduplicates, drops invalid values, and caps size', () => {
  const manyWords = Array.from({ length: MAX_DICTIONARY_WORDS + 10 }, (_, index) => `word-${index}`);
  const result = normalizeDictionary([' foo ', 'foo', '', null, 'bar', ...manyWords]);

  assert.deepEqual(result.slice(0, 3), ['foo', 'bar', 'word-0']);
  assert.equal(result.length, MAX_DICTIONARY_WORDS);
});

test('normalizeSettings only accepts known keys and normalizes types', () => {
  const result = normalizeSettings({
    apiKey: ' key ',
    hotkey: ' Ctrl+Shift+Space ',
    language: ' ja-JP ',
    model: 'gemini-2.5-flash',
    removeFillers: 0,
    customDictionary: [' Foo ', 'Foo', 'Bar'],
    microphoneDeviceId: ' mic-1 ',
    customInstructions: '  丁寧語にする  ',
    outputLanguage: ' en-US ',
    snippets: [{ trigger: '署名', text: ' よろしくお願いします。 ' }],
    legacyOption: 1,
    unknown: 'ignored',
  });

  assert.deepEqual(result, {
    apiKey: 'key',
    hotkey: 'Ctrl+Shift+Space',
    language: 'ja-JP',
    model: 'gemini-2.5-flash',
    removeFillers: false,
    customDictionary: ['Foo', 'Bar'],
    microphoneDeviceId: 'mic-1',
    customInstructions: '丁寧語にする',
    outputLanguage: 'en-US',
    snippets: [{ trigger: '署名', text: 'よろしくお願いします。' }],
  });
});

test('normalizeSettings limits custom instructions and falls back to supported values', () => {
  const result = normalizeSettings({
    model: 'unsupported',
    outputLanguage: 'not a language',
    customInstructions: 'a'.repeat(MAX_CUSTOM_INSTRUCTIONS_LENGTH + 100),
  });

  assert.equal(result.model, DEFAULT_GEMINI_MODEL);
  assert.equal(result.outputLanguage, 'same');
  assert.equal(result.customInstructions.length, MAX_CUSTOM_INSTRUCTIONS_LENGTH);
});

test('normalizeSnippets drops invalid entries and caps size', () => {
  const manySnippets = Array.from({ length: MAX_SNIPPETS + 10 }, (_, index) => ({
    trigger: `trigger-${index}`,
    text: `text-${index}`,
  }));
  const result = normalizeSnippets([{ trigger: ' 署名 ', text: ' 本文 ' }, { trigger: '', text: 'ignored' }, ...manySnippets]);

  assert.deepEqual(result[0], { trigger: '署名', text: '本文' });
  assert.equal(result.length, MAX_SNIPPETS);
});

test('getGeminiModelOrder starts with the selected model and defaults invalid values', () => {
  assert.deepEqual(getGeminiModelOrder('gemini-2.5-flash'), [
    'gemini-2.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
  ]);
  assert.equal(getGeminiModelOrder('unknown')[0], DEFAULT_GEMINI_MODEL);
});

test('buildGeminiInstruction handles a fixed language, same-language output, and dictionary words', () => {
  const instruction = buildGeminiInstruction({
    language: 'ja-JP',
    removeFillers: true,
    dictionary: ['Water Voice', 'Gemini'],
  });

  assert.match(instruction, /ja-JP/);
  assert.match(instruction, /フィラーワードを除去/);
  assert.match(instruction, /Water Voice, Gemini/);
  assert.match(instruction, /話された言語のまま出力/);
});

test('buildGeminiInstruction handles auto detection, translation, snippets, custom instructions, and filler retention', () => {
  const instruction = buildGeminiInstruction({
    language: 'auto',
    removeFillers: false,
    outputLanguage: 'en-US',
    snippets: [{ trigger: '署名', text: 'Best regards,' }],
    customInstructions: '簡潔に整形する',
  });

  assert.match(instruction, /自動判別/);
  assert.match(instruction, /多言語が混在/);
  assert.match(instruction, /フィラーワードはそのまま保持/);
  assert.match(instruction, /「en-US」に翻訳/);
  assert.match(instruction, /署名: Best regards,/);
  assert.match(instruction, /追加指示:\n簡潔に整形する/);
});

test('classifyGeminiError maps common failures to stable error codes', () => {
  assert.equal(classifyGeminiError({ status: 429 }).errorCode, 'GEMINI_RATE_LIMIT');
  assert.equal(classifyGeminiError({ status: 503 }).errorCode, 'GEMINI_TEMPORARY');
  assert.equal(classifyGeminiError({ status: 400 }).errorCode, 'GEMINI_INVALID_REQUEST');
  assert.equal(classifyGeminiError({ status: 401 }).errorCode, 'GEMINI_AUTH');
  assert.equal(classifyGeminiError({ status: 403 }).errorCode, 'GEMINI_AUTH');
  assert.equal(classifyGeminiError({ status: 404 }).errorCode, 'GEMINI_MODEL_NOT_FOUND');
  assert.equal(classifyGeminiError(new Error('Gemini request timeout')).errorCode, 'GEMINI_TIMEOUT');
  assert.equal(classifyGeminiError(new Error('API_KEY_INVALID')).errorCode, 'GEMINI_AUTH');
  assert.equal(classifyGeminiError(new Error('API key not valid')).errorCode, 'GEMINI_AUTH');
});

test('shouldFallbackGeminiError skips authentication and invalid requests but tries another missing model', () => {
  assert.equal(shouldFallbackGeminiError({ status: 401 }), false);
  assert.equal(shouldFallbackGeminiError({ status: 400 }), false);
  assert.equal(shouldFallbackGeminiError({ status: 404 }), true);
});

test('validateAudioPayload rejects empty, oversized, and non-audio payloads', () => {
  assert.throws(() => validateAudioPayload('', 'audio/webm'), /空/);
  assert.throws(() => validateAudioPayload('abc', 'text/plain'), /音声形式/);
});

test('getThinkingConfig uses thinkingLevel for Gemini 3 and thinkingBudget for 2.x', () => {
  assert.deepEqual(getThinkingConfig('gemini-3.5-flash-lite'), { thinkingLevel: 'MINIMAL' });
  assert.deepEqual(getThinkingConfig('gemini-3.6-flash'), { thinkingLevel: 'MINIMAL' });
  assert.deepEqual(getThinkingConfig('gemini-2.5-flash'), { thinkingBudget: 0 });
});
