const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateHistoryId,
  extractCandidateWords,
  formatSavedTime,
  calculateHistoryStats,
} = require('../src/shared/historyUtils');

test('generateHistoryId produces non-empty string with random suffix', () => {
  const id1 = generateHistoryId();
  const id2 = generateHistoryId();

  assert.equal(typeof id1, 'string');
  assert.equal(typeof id2, 'string');
  assert.notEqual(id1, id2);
  assert.match(id1, /^\d+-[a-z0-9]+$/);
});

test('extractCandidateWords extracts new proper noun candidates from difference', () => {
  const oldText = '今日は良い天気ですね。';
  const newText = '今日は良い天気ですね。エルゴノミクスとWaterVoiceと漢字単語を追加。';

  const candidates = extractCandidateWords(oldText, newText);
  assert.deepEqual(candidates, ['エルゴノミクス', 'WaterVoice', '漢字単語', '追加']);
});

test('extractCandidateWords ignores existing words and numbers-only tokens', () => {
  const oldText = 'WaterVoice 123 テスト';
  const newText = 'WaterVoice 123 456 テスト カタカナ';

  const candidates = extractCandidateWords(oldText, newText);
  assert.deepEqual(candidates, ['カタカナ']);
});

test('formatSavedTime formats seconds correctly', () => {
  assert.equal(formatSavedTime(0), '0分');
  assert.equal(formatSavedTime(45), '45秒');
  assert.equal(formatSavedTime(90), '1分30秒');
  assert.equal(formatSavedTime(120), '2分');
  assert.equal(formatSavedTime(3600), '1時間');
  assert.equal(formatSavedTime(3665), '1時間1分5秒');
});

test('calculateHistoryStats calculates total count, chars, today/week counts and saved time', () => {
  const now = new Date('2026-09-28T12:00:00Z'); // 2026-09-28 is a Monday
  const todayStr = '2026-09-28T09:00:00Z';
  const yesterdayStr = '2026-09-27T09:00:00Z'; // Previous week (Sunday)
  const lastWeekStr = '2026-09-20T09:00:00Z';

  const history = [
    { id: '1', timestamp: todayStr, processed: 'あいうえお' }, // 5 chars
    { id: '2', timestamp: todayStr, processed: 'かきくけこさしすせそ' }, // 10 chars
    { id: '3', timestamp: yesterdayStr, processed: '12345' }, // 5 chars
    { id: '4', timestamp: lastWeekStr, processed: 'abcdefghij' }, // 10 chars
  ];

  const stats = calculateHistoryStats(history, now);

  assert.equal(stats.totalCount, 4);
  assert.equal(stats.totalChars, 30);
  assert.equal(stats.todayCount, 2);
  assert.equal(stats.thisWeekCount, 2); // Monday start, yesterday (Sunday) was previous week
  // 30 chars * 1.5s = 45 seconds -> '45秒'
  assert.equal(stats.savedTimeSeconds, 45);
  assert.equal(stats.savedTimeFormatted, '45秒');
});
