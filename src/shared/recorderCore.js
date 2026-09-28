// 録音フローの純粋ロジック。main プロセスと renderer の両方から使う。

const RECORDING_PHASE = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
});

// main が受け付ける録音イベント
// - toggle: ホットキー / ホームの録音ボタン
// - cancel: ユーザー起点のキャンセル (Esc / オーバーレイクリック)
// - finish: renderer からのセッション終了通知 (成功・失敗・短すぎ・開始失敗)
// - processing-done: 整形結果の保存完了 (整形中のときだけ idle に戻す)
const RECORDING_EVENT = Object.freeze({
  TOGGLE: 'toggle',
  CANCEL: 'cancel',
  FINISH: 'finish',
  PROCESSING_DONE: 'processing-done',
});

const MIN_RECORDING_DURATION_MS = 700;
const MIN_AUDIO_BLOB_SIZE = 1000;

function nextRecordingPhase(phase, event) {
  switch (event) {
    case RECORDING_EVENT.TOGGLE:
      if (phase === RECORDING_PHASE.IDLE) return RECORDING_PHASE.RECORDING;
      if (phase === RECORDING_PHASE.RECORDING) return RECORDING_PHASE.PROCESSING;
      // 整形中のホットキーは無視する
      return phase;
    case RECORDING_EVENT.CANCEL:
      return phase === RECORDING_PHASE.RECORDING ? RECORDING_PHASE.IDLE : phase;
    case RECORDING_EVENT.FINISH:
      return RECORDING_PHASE.IDLE;
    case RECORDING_EVENT.PROCESSING_DONE:
      return phase === RECORDING_PHASE.PROCESSING ? RECORDING_PHASE.IDLE : phase;
    default:
      return phase;
  }
}

// 録音データが送信に値するかを判定する。blobSize は Blob 生成後に渡す。
function evaluateRecordedAudio({ chunkCount, durationMs, blobSize } = {}) {
  if (!chunkCount || durationMs < MIN_RECORDING_DURATION_MS) {
    return { ok: false, notice: '録音が短すぎました。もう少し長く話してください。' };
  }
  if (typeof blobSize === 'number' && blobSize < MIN_AUDIO_BLOB_SIZE) {
    return { ok: false, notice: '音声がほとんど検出されませんでした。マイク入力を確認してください。' };
  }
  return { ok: true, notice: '' };
}

// getUserMedia に渡す audio 制約を返す。選択デバイスが見つからなければシステム既定。
function resolveAudioConstraints(deviceId, devices = []) {
  if (!deviceId || typeof deviceId !== 'string') return true;
  const exists = devices.some((device) => device?.kind === 'audioinput' && device.deviceId === deviceId);
  return exists ? { deviceId: { exact: deviceId } } : true;
}

module.exports = {
  RECORDING_PHASE,
  RECORDING_EVENT,
  MIN_RECORDING_DURATION_MS,
  MIN_AUDIO_BLOB_SIZE,
  nextRecordingPhase,
  evaluateRecordedAudio,
  resolveAudioConstraints,
};
