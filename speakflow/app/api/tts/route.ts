import { NextRequest, NextResponse } from 'next/server';
import { textToSpeech } from '@/lib/gemini-tts';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text } = body as Record<string, unknown>;

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 });
  }

  try {
    const audioBuffer = await textToSpeech(text.trim());
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[POST /api/tts]', error);
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }
}
