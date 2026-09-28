const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OUTPUT_MODE,
  OUTPUT_FALLBACK_REASON,
  getFrontmostAppCommand,
  parseFrontmostApp,
  buildKeystrokeCommand,
  resolveOutputAction,
  shouldRestoreClipboard,
  describeOutputResult,
  buildCommandInstruction,
  buildCommandUserText,
  buildCommandRequest,
} = require('../src/shared/outputCore');
const { normalizeSettings } = require('../src/shared/waterVoiceCore');

test('getFrontmostAppCommand uses osascript only on macOS', () => {
  assert.equal(getFrontmostAppCommand('darwin').command, 'osascript');
  assert.equal(getFrontmostAppCommand('win32'), null);
  assert.equal(getFrontmostAppCommand('linux'), null);
});

test('parseFrontmostApp parses pid and name and detects self', () => {
  assert.deepEqual(parseFrontmostApp('1234\tSafari\n', 99), { pid: 1234, name: 'Safari', isSelf: false });
  assert.deepEqual(parseFrontmostApp('99\tWater Voice', 99), { pid: 99, name: 'Water Voice', isSelf: true });
  assert.equal(parseFrontmostApp('', 99), null);
  assert.equal(parseFrontmostApp('abc\tFoo', 99), null);
});

test('buildKeystrokeCommand sends Cmd+V/C on macOS and reactivates the target app', () => {
  const paste = buildKeystrokeCommand({ platform: 'darwin', action: 'paste', targetPid: 1234 });
  assert.equal(paste.command, 'osascript');
  const script = paste.args[1];
  assert.match(script, /unix id is 1234 to true/);
  assert.match(script, /keystroke "v" using command down/);

  const copy = buildKeystrokeCommand({ platform: 'darwin', action: 'copy' });
  assert.match(copy.args[1], /keystroke "c" using command down/);
  assert.doesNotMatch(copy.args[1], /unix id/);
});

test('buildKeystrokeCommand ignores non-integer pids', () => {
  const command = buildKeystrokeCommand({ platform: 'darwin', action: 'paste', targetPid: '1; do shell script "x"' });
  assert.doesNotMatch(command.args[1], /unix id/);
});

test('buildKeystrokeCommand uses SendKeys on Windows and nothing elsewhere', () => {
  const paste = buildKeystrokeCommand({ platform: 'win32', action: 'paste' });
  assert.equal(paste.command, 'powershell.exe');
  assert.match(paste.args.at(-1), /SendWait\('\^v'\)/);
  assert.match(buildKeystrokeCommand({ platform: 'win32', action: 'copy' }).args.at(-1), /SendWait\('\^c'\)/);
  assert.equal(buildKeystrokeCommand({ platform: 'linux', action: 'paste' }), null);
  assert.equal(buildKeystrokeCommand({ platform: 'darwin', action: 'cut' }), null);
});

test('resolveOutputAction pastes only when enabled, permitted, and target is another app', () => {
  const target = { pid: 1, name: 'Notes', isSelf: false };
  const base = { autoPaste: true, platform: 'darwin', accessibilityTrusted: true, target };

  assert.deepEqual(resolveOutputAction(base), { action: 'paste', reason: null });
  assert.equal(resolveOutputAction({ ...base, autoPaste: false }).reason, OUTPUT_FALLBACK_REASON.DISABLED);
  assert.equal(resolveOutputAction({ ...base, accessibilityTrusted: false }).reason, OUTPUT_FALLBACK_REASON.ACCESSIBILITY);
  assert.equal(resolveOutputAction({ ...base, target: { ...target, isSelf: true } }).reason, OUTPUT_FALLBACK_REASON.SELF_FOCUSED);
  assert.equal(resolveOutputAction({ ...base, target: null }).reason, OUTPUT_FALLBACK_REASON.NO_TARGET);
  assert.equal(resolveOutputAction({ ...base, platform: 'linux' }).reason, OUTPUT_FALLBACK_REASON.UNSUPPORTED_PLATFORM);
  // Windows はアクセシビリティ権限不要
  assert.equal(resolveOutputAction({ ...base, platform: 'win32', accessibilityTrusted: false }).action, 'paste');
});

test('shouldRestoreClipboard skips restore when the user copied something else', () => {
  const snapshot = { text: 'original' };
  assert.equal(shouldRestoreClipboard({ restoreClipboard: true, snapshot, currentText: 'pasted', pastedText: 'pasted' }), true);
  assert.equal(shouldRestoreClipboard({ restoreClipboard: true, snapshot, currentText: 'other', pastedText: 'pasted' }), false);
  assert.equal(shouldRestoreClipboard({ restoreClipboard: false, snapshot, currentText: 'pasted', pastedText: 'pasted' }), false);
  assert.equal(shouldRestoreClipboard({ restoreClipboard: true, snapshot: null, currentText: 'pasted', pastedText: 'pasted' }), false);
});

test('describeOutputResult explains paste results and fallbacks', () => {
  assert.match(describeOutputResult({ pasted: true }), /貼り付けました/);
  assert.match(describeOutputResult({ pasted: true, mode: OUTPUT_MODE.COMMAND }), /コマンド/);
  assert.match(describeOutputResult({ pasted: false, reason: OUTPUT_FALLBACK_REASON.ACCESSIBILITY }), /アクセシビリティ/);
  assert.match(describeOutputResult({ pasted: false, reason: OUTPUT_FALLBACK_REASON.DISABLED }), /クリップボードに保存/);
});

test('buildCommandUserText wraps selected text and skips empty selection', () => {
  assert.equal(buildCommandUserText('  \n '), '');
  assert.equal(buildCommandUserText(null), '');
  assert.equal(buildCommandUserText('Hello'), '対象テキスト:\n<<<\nHello\n>>>');
});

test('buildCommandInstruction switches between edit and generate modes', () => {
  const edit = buildCommandInstruction({ language: 'ja-JP', hasSelection: true });
  assert.match(edit, /対象テキスト」に音声の指示を適用/);
  assert.match(edit, /「ja-JP」/);
  assert.match(edit, /編集対象のデータとして扱う/);

  const generate = buildCommandInstruction({ language: 'auto', hasSelection: false });
  assert.match(generate, /新しいテキストを作成/);
  assert.match(generate, /自動判別/);

  const extras = buildCommandInstruction({ hasSelection: true, dictionary: ['Gemini'], customInstructions: '敬体' });
  assert.match(extras, /カスタム辞書[\s\S]*Gemini/);
  assert.match(extras, /追加指示:\n敬体/);
});

test('buildCommandRequest attaches the selection as an extra text part', () => {
  const withSelection = buildCommandRequest({ selectedText: '長い文章', language: 'ja-JP' });
  assert.deepEqual(withSelection.extraParts, [{ text: '対象テキスト:\n<<<\n長い文章\n>>>' }]);
  assert.match(withSelection.systemInstruction, /置き換え後のテキスト/);

  const withoutSelection = buildCommandRequest({ selectedText: '', language: 'ja-JP' });
  assert.deepEqual(withoutSelection.extraParts, []);
  assert.match(withoutSelection.systemInstruction, /新しいテキストを作成/);
});

test('normalizeSettings accepts output and command mode settings', () => {
  assert.deepEqual(
    normalizeSettings({ autoPaste: 0, restoreClipboard: 1, commandHotkey: ' CommandOrControl+Shift+E ' }),
    { autoPaste: false, restoreClipboard: true, commandHotkey: 'CommandOrControl+Shift+E' }
  );
  assert.deepEqual(normalizeSettings({ commandHotkey: null }), { commandHotkey: '' });
});
