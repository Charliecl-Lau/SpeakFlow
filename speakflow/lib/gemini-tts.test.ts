import { buildWavHeader, buildWavBuffer } from './gemini-tts';

describe('buildWavHeader', () => {
  test('produces a 44-byte WAV header', () => {
    const header = buildWavHeader(1000);
    expect(header.byteLength).toBe(44);
  });

  test('starts with RIFF marker', () => {
    const header = buildWavHeader(1000);
    const view = new DataView(header);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe('RIFF');
  });

  test('embeds PCM data size in chunk size field', () => {
    const pcmLength = 2048;
    const header = buildWavHeader(pcmLength);
    const view = new DataView(header);
    // Bytes 4-7: total file size - 8
    expect(view.getUint32(4, true)).toBe(pcmLength + 44 - 8);
  });
});

describe('buildWavBuffer', () => {
  test('returns a Buffer whose length is 44 + pcm length', () => {
    const pcm = Buffer.alloc(512);
    const wav = buildWavBuffer(pcm);
    expect(wav.length).toBe(44 + 512);
  });
});
