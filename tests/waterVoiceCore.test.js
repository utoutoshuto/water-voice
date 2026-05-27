const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_DICTIONARY_WORDS,
  normalizeDictionary,
  normalizeSettings,
  buildGeminiInstruction,
  classifyGeminiError,
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
    removeFillers: 0,
    customDictionary: [' Foo ', 'Foo', 'Bar'],
    legacyOption: 1,
    unknown: 'ignored',
  });

  assert.deepEqual(result, {
    apiKey: 'key',
    hotkey: 'Ctrl+Shift+Space',
    language: 'ja-JP',
    removeFillers: false,
    customDictionary: ['Foo', 'Bar'],
  });
});

test('buildGeminiInstruction includes language, filler policy, and dictionary words', () => {
  const instruction = buildGeminiInstruction({
    language: 'ja-JP',
    removeFillers: true,
    dictionary: ['Water Voice', 'Gemini'],
  });

  assert.match(instruction, /ja-JP/);
  assert.match(instruction, /フィラーワードを除去/);
  assert.match(instruction, /Water Voice, Gemini/);
});

test('classifyGeminiError maps common failures to stable error codes', () => {
  assert.equal(classifyGeminiError({ status: 429 }).errorCode, 'GEMINI_RATE_LIMIT');
  assert.equal(classifyGeminiError({ status: 503 }).errorCode, 'GEMINI_TEMPORARY');
  assert.equal(classifyGeminiError(new Error('Gemini request timeout')).errorCode, 'GEMINI_TIMEOUT');
  assert.equal(classifyGeminiError(new Error('API key not valid')).errorCode, 'GEMINI_AUTH');
});

test('validateAudioPayload rejects empty, oversized, and non-audio payloads', () => {
  assert.throws(() => validateAudioPayload('', 'audio/webm'), /空/);
  assert.throws(() => validateAudioPayload('abc', 'text/plain'), /音声形式/);
});
