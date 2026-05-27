import { NextRequest, NextResponse } from 'next/server';
import { generateFeedback } from '@/lib/gemma';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages } = body as Record<string, unknown>;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages must be a non-empty array' },
      { status: 400 }
    );
  }

  try {
    const feedback = await generateFeedback(
      messages as Array<{ role: string; text: string }>
    );
    return NextResponse.json(feedback);
  } catch (error) {
    console.error('[POST /api/evaluate]', error);
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 });
  }
}
