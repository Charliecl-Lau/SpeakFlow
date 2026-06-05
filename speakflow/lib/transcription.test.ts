import { getSTTApiKey, buildSTTRequestBody, extractTranscript } from './transcription';

describe('getSTTApiKey', () => {
  const original = process.env.GOOGLE_CLOUD_STT_API_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GOOGLE_CLOUD_STT_API_KEY;
    } else {
      process.env.GOOGLE_CLOUD_STT_API_KEY = original;
    }
  });

  test('returns key when env var is set', () => {
    process.env.GOOGLE_CLOUD_STT_API_KEY = 'test-key-123';
    expect(getSTTApiKey()).toBe('test-key-123');
  });

  test('throws when env var is absent', () => {
    delete process.env.GOOGLE_CLOUD_STT_API_KEY;
    expect(() => getSTTApiKey()).toThrow('GOOGLE_CLOUD_STT_API_KEY is not set');
  });
});

describe('buildSTTRequestBody', () => {
  const audio = Buffer.from('hello');

  test('uses WEBM_OPUS encoding for audio/webm', () => {
    const body = buildSTTRequestBody(audio, 'audio/webm') as {
      config: { encoding: string; sampleRateHertz: number };
      audio: { content: string };
    };
    expect(body.config.encoding).toBe('WEBM_OPUS');
    expect(body.config.sampleRateHertz).toBe(48000);
  });

  test('uses WEBM_OPUS encoding for audio/webm;codecs=opus', () => {
    const body = buildSTTRequestBody(audio, 'audio/webm;codecs=opus') as {
      config: { encoding: string };
    };
    expect(body.config.encoding).toBe('WEBM_OPUS');
  });

  test('uses OGG_OPUS encoding for audio/ogg', () => {
    const body = buildSTTRequestBody(audio, 'audio/ogg') as {
      config: { encoding: string };
    };
    expect(body.config.encoding).toBe('OGG_OPUS');
  });

  test('falls back to WEBM_OPUS for unknown audio types', () => {
    const body = buildSTTRequestBody(audio, 'audio/mp4') as {
      config: { encoding: string };
    };
    expect(body.config.encoding).toBe('WEBM_OPUS');
  });

  test('base64-encodes audio content correctly', () => {
    const buf = Buffer.from('abc');
    const body = buildSTTRequestBody(buf, 'audio/webm') as {
      audio: { content: string };
    };
    expect(body.audio.content).toBe('YWJj');
  });

  test('includes required config fields', () => {
    const body = buildSTTRequestBody(audio, 'audio/webm') as {
      config: { languageCode: string; model: string; enableAutomaticPunctuation: boolean };
    };
    expect(body.config.languageCode).toBe('en-US');
    expect(body.config.model).toBe('latest_long');
    expect(body.config.enableAutomaticPunctuation).toBe(true);
  });
});

describe('extractTranscript', () => {
  test('joins multiple result alternatives into a single string', () => {
    const response = {
      results: [
        { alternatives: [{ transcript: 'Hello world' }] },
        { alternatives: [{ transcript: 'how are you' }] },
      ],
    };
    expect(extractTranscript(response)).toBe('Hello world how are you');
  });

  test('returns empty string for empty results array', () => {
    expect(extractTranscript({ results: [] })).toBe('');
  });

  test('returns empty string when results key is missing', () => {
    expect(extractTranscript({})).toBe('');
  });

  test('returns empty string for null input', () => {
    expect(extractTranscript(null)).toBe('');
  });

  test('skips alternatives with no transcript field', () => {
    const response = {
      results: [
        { alternatives: [{ confidence: 0.9 }] },
        { alternatives: [{ transcript: 'valid text' }] },
      ],
    };
    expect(extractTranscript(response)).toBe('valid text');
  });

  test('trims surrounding whitespace from final result', () => {
    const response = {
      results: [{ alternatives: [{ transcript: '  trimmed  ' }] }],
    };
    expect(extractTranscript(response)).toBe('trimmed');
  });
});
