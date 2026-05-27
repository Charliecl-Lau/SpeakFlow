import { GoogleGenAI } from '@google/genai';

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
// Aoede is a natural-sounding en-US voice available on Gemini TTS.
// Full voice list: https://ai.google.dev/gemini-api/docs/speech-generation
const VOICE_NAME = 'Aoede';
const SAMPLE_RATE = 24000;

export function buildWavHeader(pcmDataLength: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmDataLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);      // PCM subchunk size
  view.setUint16(20, 1, true);       // PCM format
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true);       // block align
  view.setUint16(34, 16, true);      // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, pcmDataLength, true);
  return buffer;
}

export function buildWavBuffer(pcmBuffer: Buffer): Buffer {
  const header = Buffer.from(buildWavHeader(pcmBuffer.length));
  return Buffer.concat([header, pcmBuffer]);
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error('Gemini TTS returned no audio data');

  const pcm = Buffer.from(audioData, 'base64');
  return buildWavBuffer(pcm);
}
