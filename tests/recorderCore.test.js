const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RECORDING_PHASE: P,
  RECORDING_EVENT: E,
  MIN_RECORDING_DURATION_MS,
  nextRecordingPhase,
  evaluateRecordedAudio,
  resolveAudioConstraints,
} = require('../src/shared/recorderCore');

test('toggle cycles idle -> recording -> processing and is ignored while processing', () => {
  assert.equal(nextRecordingPhase(P.IDLE, E.TOGGLE), P.RECORDING);
  assert.equal(nextRecordingPhase(P.RECORDING, E.TOGGLE), P.PROCESSING);
  assert.equal(nextRecordingPhase(P.PROCESSING, E.TOGGLE), P.PROCESSING);
});

test('cancel only applies while recording', () => {
  assert.equal(nextRecordingPhase(P.RECORDING, E.CANCEL), P.IDLE);
  assert.equal(nextRecordingPhase(P.PROCESSING, E.CANCEL), P.PROCESSING);
  assert.equal(nextRecordingPhase(P.IDLE, E.CANCEL), P.IDLE);
});

test('finish returns to idle from any phase (including start failure while recording)', () => {
  assert.equal(nextRecordingPhase(P.RECORDING, E.FINISH), P.IDLE);
  assert.equal(nextRecordingPhase(P.PROCESSING, E.FINISH), P.IDLE);
  assert.equal(nextRecordingPhase(P.IDLE, E.FINISH), P.IDLE);
});

test('processing-done only resets the processing phase', () => {
  assert.equal(nextRecordingPhase(P.PROCESSING, E.PROCESSING_DONE), P.IDLE);
  // 再送信の保存完了が新しい録音を止めてしまわないこと
  assert.equal(nextRecordingPhase(P.RECORDING, E.PROCESSING_DONE), P.RECORDING);
  assert.equal(nextRecordingPhase(P.IDLE, E.PROCESSING_DONE), P.IDLE);
});

test('unknown events keep the current phase', () => {
  assert.equal(nextRecordingPhase(P.RECORDING, 'unknown'), P.RECORDING);
});

test('evaluateRecordedAudio rejects short or silent recordings', () => {
  assert.equal(evaluateRecordedAudio({ chunkCount: 0, durationMs: 5000 }).ok, false);
  assert.match(
    evaluateRecordedAudio({ chunkCount: 3, durationMs: MIN_RECORDING_DURATION_MS - 1 }).notice,
    /短すぎ/
  );
  assert.match(evaluateRecordedAudio({ chunkCount: 3, durationMs: 2000, blobSize: 10 }).notice, /検出されません/);
  assert.equal(evaluateRecordedAudio({ chunkCount: 3, durationMs: 2000 }).ok, true);
  assert.equal(evaluateRecordedAudio({ chunkCount: 3, durationMs: 2000, blobSize: 5000 }).ok, true);
});

test('resolveAudioConstraints uses the selected device only when it exists', () => {
  const devices = [
    { kind: 'audioinput', deviceId: 'mic-a' },
    { kind: 'videoinput', deviceId: 'cam-a' },
  ];
  assert.deepEqual(resolveAudioConstraints('mic-a', devices), { deviceId: { exact: 'mic-a' } });
  assert.equal(resolveAudioConstraints('mic-missing', devices), true);
  assert.equal(resolveAudioConstraints('cam-a', devices), true);
  assert.equal(resolveAudioConstraints('', devices), true);
  assert.equal(resolveAudioConstraints(undefined), true);
});
