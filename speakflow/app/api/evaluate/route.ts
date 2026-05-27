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

  const isMessageArray = (arr: unknown[]): arr is Array<{ role: string; text: string }> =>
    arr.every(
      m =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as Record<string, unknown>).role === 'string' &&
        typeof (m as Record<string, unknown>).text === 'string'
    );

  if (!isMessageArray(messages)) {
    return NextResponse.json(
      { error: 'Each message must have a string role and string text' },
      { status: 400 }
    );
  }

  try {
    const feedback = await generateFeedback(messages);
    return NextResponse.json(feedback);
  } catch (error) {
    console.error('[POST /api/evaluate]', error);
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 });
  }
}
