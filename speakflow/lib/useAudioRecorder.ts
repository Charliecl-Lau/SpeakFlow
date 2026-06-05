import { useRef, useCallback, useEffect } from 'react';
import { fetchTranscription } from './api';

type UseAudioRecorderOptions = {
  onResult: (transcript: string, startedAt: number) => void;
  onError:  (error: string) => void;
};

export function useAudioRecorder({ onResult, onError }: UseAudioRecorderOptions) {
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  const isSupported = useCallback((): boolean => {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;

    if (!isSupported()) {
      onError('MediaRecorder not supported in this browser.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError('Microphone access denied.');
      return;
    }

    // Prefer webm/opus; fall back to the browser's default.
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      recorderRef.current = null;

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });

      if (blob.size === 0) {
        onError('no-speech');
        return;
      }

      try {
        const transcript = await fetchTranscription(blob);
        if (transcript) {
          onResult(transcript, startedAtRef.current);
        } else {
          onError('no-speech');
        }
      } catch {
        onError('Transcription failed. Please try again.');
      }
    };

    recorderRef.current = recorder;
    recorder.start();
  }, [isSupported, onResult, onError]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  return { start, stop, isSupported };
}
