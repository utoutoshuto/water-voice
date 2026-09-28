import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  RECORDING_PHASE,
  evaluateRecordedAudio,
  resolveAudioConstraints,
} from '../shared/recorderCore';
import { OUTPUT_MODE, describeOutputResult } from '../shared/outputCore';

const MIME_TYPE_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function getSupportedMimeType() {
  if (!window.MediaRecorder) return '';
  return MIME_TYPE_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('音声データの読み込みに失敗しました。'));
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

// 選択マイクで getUserMedia する。見つからない・使えない場合はシステム既定にフォールバック。
async function openMicrophoneStream(deviceId) {
  let devices = [];
  if (deviceId && navigator.mediaDevices.enumerateDevices) {
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      devices = [];
    }
  }

  const audio = resolveAudioConstraints(deviceId, devices);
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (err) {
    if (audio === true || err?.name === 'NotAllowedError' || err?.name === 'SecurityError') throw err;
    console.warn('Selected microphone unavailable, falling back to default:', err);
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

const RecorderContext = createContext(null);

// 録音ロジック本体。App 直下 (メインウィンドウのみ) に常駐させ、
// どのページを表示していてもホットキーで録音できるようにする。
export function RecorderProvider({ children }) {
  const [isRecording, setIsRecording] = useState(false);
  const [processed, setProcessed] = useState('');
  const [status, setStatus] = useState('idle');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [micPermission, setMicPermission] = useState('unknown');
  const [failedRecordingId, setFailedRecordingId] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const [mode, setMode] = useState(OUTPUT_MODE.DICTATION);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  // getUserMedia 待ちの間に停止/キャンセル要求が来た場合に、開始完了後に適用する
  const pendingActionRef = useRef(null);
  const recordingStartTimeRef = useRef(null);
  const settingsRef = useRef(null);
  const retryingRef = useRef(false);

  const finishSession = () => window.electronAPI.finishRecordingSession();

  const cleanupAudio = () => {
    setAnalyser(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startAudioMeter = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;

    const nextAnalyser = audioCtx.createAnalyser();
    nextAnalyser.fftSize = 256;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(nextAnalyser);
    setAnalyser(nextAnalyser);
  };

  const cancelLocalRecording = (message) => {
    pendingActionRef.current = isStartingRef.current ? 'cancel' : null;

    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.stop();
      }
    }

    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    isRecordingRef.current = false;
    isStoppingRef.current = false;
    setIsRecording(false);
    setStatus('idle');
    setNotice(message);
    cleanupAudio();
  };

  // 文字起こし失敗時、録音データをディスクへ一時保存してからセッションを終了する。
  // これにより「再送信」ボタンから同じ音声データを送り直せる。
  const handleTranscribeFailure = async (base64, mimeType, options, message) => {
    const saved = await window.electronAPI.saveFailedRecording(base64, mimeType, options);
    setErrorMsg(message);
    setFailedRecordingId(saved.success ? saved.id : null);
    setStatus('error');
  };

  const saveResultText = async (text) => {
    setProcessed(text);
    setStatus('done');

    // saveGeneratedText が履歴追加と出力 (自動貼り付け or クリップボード保存) を行う (再送信時も同じ経路)
    const saveResult = await window.electronAPI.saveGeneratedText(text);
    if (saveResult.success) {
      setNotice(describeOutputResult(saveResult));
    } else {
      setNotice('整形は完了しましたが、テキストの出力に失敗しました。');
    }
  };

  const finishRecording = async (recorder) => {
    cleanupAudio();

    let base64 = null;
    let actualMimeType = null;
    let requestOptions = null;
    // saveGeneratedText 成功時は main 側で idle に戻っているので、重ねて終了通知しない
    let sessionClosed = false;

    try {
      const chunks = audioChunksRef.current;
      const durationMs = Date.now() - (recordingStartTimeRef.current || Date.now());

      const lengthCheck = evaluateRecordedAudio({ chunkCount: chunks.length, durationMs });
      if (!lengthCheck.ok) {
        setNotice(lengthCheck.notice);
        setStatus('idle');
        return;
      }

      actualMimeType = recorder.mimeType || getSupportedMimeType() || 'audio/webm';
      const blob = new Blob(chunks, { type: actualMimeType });

      const sizeCheck = evaluateRecordedAudio({ chunkCount: chunks.length, durationMs, blobSize: blob.size });
      if (!sizeCheck.ok) {
        setNotice(sizeCheck.notice);
        setStatus('idle');
        return;
      }

      setStatus('processing');
      base64 = await readBlobAsBase64(blob);
      const currentSettings = settingsRef.current || {};
      requestOptions = {
        removeFillers: currentSettings.removeFillers,
        language: currentSettings.language,
      };

      const result = await window.electronAPI.processAudioWithGemini(
        base64,
        actualMimeType.split(';')[0],
        requestOptions
      );

      if (!result.success) {
        // Command Mode では main が選択テキストを含めたオプションを返すので、それを保存して再送信に使う
        await handleTranscribeFailure(base64, actualMimeType.split(';')[0], result.options || requestOptions, result.error);
        return;
      }

      await saveResultText(result.text);
      sessionClosed = true;
    } catch (err) {
      const message = err.message || '録音処理に失敗しました。';
      if (base64) {
        // Gemini呼び出し以降(ネットワーク断等)の失敗は録音データが残っているので保存する
        await handleTranscribeFailure(base64, actualMimeType.split(';')[0], requestOptions, message);
      } else {
        setErrorMsg(message);
        setStatus('error');
      }
    } finally {
      isStoppingRef.current = false;
      isRecordingRef.current = false;
      setIsRecording(false);
      mediaRecorderRef.current = null;
      // 失敗・短すぎの場合もオーバーレイを閉じて main を idle に戻す
      if (!sessionClosed) await finishSession();
    }
  };

  const stopRecording = () => {
    if (isStartingRef.current) {
      pendingActionRef.current = 'stop';
      return;
    }
    if (!isRecordingRef.current || isStoppingRef.current) return;

    isStoppingRef.current = true;
    isRecordingRef.current = false;
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupAudio();
      isStoppingRef.current = false;
      setStatus('idle');
      finishSession();
      return;
    }

    recorder.onstop = () => finishRecording(recorder);

    if (recorder.state === 'recording' || recorder.state === 'paused') {
      recorder.stop();
    } else {
      finishRecording(recorder);
    }
  };

  const failStart = async (message) => {
    setErrorMsg(message);
    setStatus('error');
    await finishSession();
  };

  const startRecording = async () => {
    if (isRecordingRef.current || isStoppingRef.current || isStartingRef.current) return;

    if (retryingRef.current) {
      setNotice('録音データを再送信中です。完了後にもう一度録音してください。');
      await finishSession();
      return;
    }

    isStartingRef.current = true;
    pendingActionRef.current = null;
    setNotice('');
    setErrorMsg('');
    setProcessed('');
    setFailedRecordingId(null);

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      isStartingRef.current = false;
      await failStart('この環境では音声録音に対応していません。');
      return;
    }

    try {
      // 設定ページでの変更を反映するため、録音開始ごとに最新の設定を読み直す
      settingsRef.current = await window.electronAPI.getSettings();
      const stream = await openMicrophoneStream(settingsRef.current?.microphoneDeviceId);

      if (pendingActionRef.current === 'cancel') {
        stream.getTracks().forEach((track) => track.stop());
        isStartingRef.current = false;
        pendingActionRef.current = null;
        return;
      }

      streamRef.current = stream;
      setMicPermission('granted');
      startAudioMeter(stream);

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.start(100);

      recordingStartTimeRef.current = Date.now();
      isRecordingRef.current = true;
      isStartingRef.current = false;
      setIsRecording(true);
      setStatus('recording');

      if (pendingActionRef.current === 'stop') {
        pendingActionRef.current = null;
        stopRecording();
      }
    } catch (err) {
      console.error('Mic error:', err);
      isStartingRef.current = false;
      pendingActionRef.current = null;
      cleanupAudio();
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setMicPermission('denied');
        await failStart('マイクへのアクセスが拒否されました。OS設定でWater Voiceを許可してください。');
      } else {
        await failStart(`マイクを開始できませんでした。${err?.message || ''}`.trim());
      }
    }
  };

  // IPC リスナから常に最新のハンドラを呼べるよう ref 経由で参照する
  const handlersRef = useRef({});

  useEffect(() => {
    handlersRef.current = { startRecording, stopRecording, cancelLocalRecording };
  });

  useEffect(() => {
    window.electronAPI.checkMicPermission().then(setMicPermission);

    const offState = window.electronAPI.onRecordingState(({ phase, mode: nextMode }) => {
      if (phase !== RECORDING_PHASE.IDLE) setMode(nextMode || OUTPUT_MODE.DICTATION);
      if (phase === RECORDING_PHASE.RECORDING) {
        handlersRef.current.startRecording();
      } else if (phase === RECORDING_PHASE.PROCESSING) {
        handlersRef.current.stopRecording();
      }
    });

    // ユーザー起点のキャンセルのみ main から届く
    const offCancelled = window.electronAPI.onRecordingCancelled(() => {
      handlersRef.current.cancelLocalRecording('録音をキャンセルしました。');
    });

    return () => {
      offState();
      offCancelled();
      cleanupAudio();
    };
  }, []);

  const retryFailedRecording = useCallback(async () => {
    if (!failedRecordingId) return;

    retryingRef.current = true;
    setRetrying(true);
    setStatus('processing');

    let result;
    try {
      result = await window.electronAPI.retryFailedRecording(failedRecordingId);
    } catch (err) {
      result = { success: false, error: err.message || '再送信に失敗しました。' };
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }

    if (!result.success) {
      setErrorMsg(result.error);
      setStatus('error');
      return;
    }

    setFailedRecordingId(null);
    await saveResultText(result.text);
  }, [failedRecordingId]);

  const discardFailedRecording = useCallback(async () => {
    if (!failedRecordingId) return;
    await window.electronAPI.discardFailedRecording(failedRecordingId);
    setFailedRecordingId(null);
    setErrorMsg('');
    setStatus('idle');
  }, [failedRecordingId]);

  const toggleRecording = useCallback(() => window.electronAPI.toggleRecording(), []);
  const clearResult = useCallback(() => setStatus('idle'), []);

  const value = useMemo(() => ({
    isRecording,
    status,
    processed,
    notice,
    errorMsg,
    micPermission,
    failedRecordingId,
    retrying,
    analyser,
    mode,
    toggleRecording,
    retryFailedRecording,
    discardFailedRecording,
    clearResult,
  }), [
    isRecording, status, processed, notice, errorMsg, micPermission,
    failedRecordingId, retrying, analyser, mode, toggleRecording,
    retryFailedRecording, discardFailedRecording, clearResult,
  ]);

  return <RecorderContext.Provider value={value}>{children}</RecorderContext.Provider>;
}

export function useRecorder() {
  const context = useContext(RecorderContext);
  if (!context) {
    throw new Error('useRecorder must be used within RecorderProvider');
  }
  return context;
}
