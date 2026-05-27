import { useRef, useCallback, useEffect } from 'react';

type UseSpeechRecognitionOptions = {
  onResult: (transcript: string, startedAt: number) => void;
  onError:  (error: string) => void;
};

export function useSpeechRecognition({ onResult, onError }: UseSpeechRecognitionOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any | null>(null);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: new () => any = (window as any).SpeechRecognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || (window as any).webkitSpeechRecognition;

    const recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';

    startedAtRef.current = Date.now();

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) onResult(transcript, startedAtRef.current);
    };

    recognition.onerror = (event: any) => {
      onError(event.error ?? 'SpeechRecognition error');
    };

    recognition.onend = () => {
      recognitionRef.current = null;
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
