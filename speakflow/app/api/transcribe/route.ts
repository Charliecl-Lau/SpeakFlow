import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/transcription';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form body' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
  }

  if (audio.size === 0) {
    return NextResponse.json({ error: 'audio file is empty' }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'audio file is too large' }, { status: 413 });
  }

  const mimeType = audio.type || 'audio/webm';
  if (!mimeType.startsWith('audio/')) {
    return NextResponse.json({ error: 'audio must use an audio MIME type' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer());
    const transcript = await transcribeAudio(buffer, mimeType);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('[POST /api/transcribe]', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
