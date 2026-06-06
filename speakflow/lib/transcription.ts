const STT_ENDPOINT = 'https://speech.googleapis.com/v2/speech:recognize';

export function getSTTApiKey(): string {
  const key = process.env.GOOGLE_CLOUD_STT_API_KEY;
  if (!key) throw new Error('GOOGLE_CLOUD_STT_API_KEY is not set');
  return key;
}

function mimeTypeToEncoding(mimeType: string): { encoding: string; sampleRateHertz: number } {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('audio/ogg')) return { encoding: 'OGG_OPUS', sampleRateHertz: 48000 };
  // Default: treat all webm and unknown audio formats as WEBM_OPUS (Chrome/Firefox default)
  return { encoding: 'WEBM_OPUS', sampleRateHertz: 48000 };
}

export function buildSTTRequestBody(audio: Buffer, mimeType: string): object {
  const { encoding, sampleRateHertz } = mimeTypeToEncoding(mimeType);
  return {
    config: {
      encoding,
      sampleRateHertz,
      languageCode: 'en-US',
      model: 'latest_long',
      enableAutomaticPunctuation: true,
    },
    audio: {
      content: audio.toString('base64'),
    },
  };
}

export function extractTranscript(responseBody: unknown): string {
  if (
    typeof responseBody !== 'object' ||
    responseBody === null ||
    !Array.isArray((responseBody as Record<string, unknown>).results)
  ) {
    return '';
  }
  const results = (responseBody as { results: unknown[] }).results;
  const parts: string[] = [];
  for (const result of results) {
    if (
      typeof result === 'object' &&
      result !== null &&
      Array.isArray((result as Record<string, unknown>).alternatives) &&
      (result as { alternatives: unknown[] }).alternatives.length > 0
    ) {
      const alt = (result as { alternatives: { transcript?: string }[] }).alternatives[0];
      if (typeof alt.transcript === 'string' && alt.transcript.trim()) {
        parts.push(alt.transcript.trim());
      }
    }
  }
  return parts.join(' ').trim();
}

export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
  const key = getSTTApiKey();
  const body = buildSTTRequestBody(audio, mimeType);

  const res = await fetch(`${STT_ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Cloud STT error ${res.status}: ${text}`);
  }

  const data: unknown = await res.json();
  return extractTranscript(data);
}
