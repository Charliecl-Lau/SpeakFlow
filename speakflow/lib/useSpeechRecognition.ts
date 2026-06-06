import { useRef, useCallback, useEffect } from 'react';

type UseSpeechRecognitionOptions = {
  onResult: (transcript: string, startedAt: number) => void;
  onError:  (error: string) => void;
};

type SpeechRecognitionResultLike = {
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function useSpeechRecognition({ onResult, onError }: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef   = useRef<number>(0);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  const isSupported = useCallback((): boolean => {
    return typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) return;

    if (!isSupported()) {
      onError('SpeechRecognition not supported in this browser.');
      return;
    }

    const speechWindow = window as WindowWithSpeechRecognition;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SR) {
      onError('SpeechRecognition not supported in this browser.');
      return;
    }

    const recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';

    startedAtRef.current = Date.now();

    // Track whether a result or error already fired so onend doesn't double-notify.
    let settled = false;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) {
        settled = true;
        onResult(transcript, startedAtRef.current);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      settled = true;
      onError(event.error ?? 'SpeechRecognition error');
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // If recognition ended with no result (silence, timeout, aborted),
      // notify the caller so it can reset recording state.
      if (!settled) onError('no-speech');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  return { start, stop, isSupported };
}
