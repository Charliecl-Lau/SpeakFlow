import { NextRequest, NextResponse } from 'next/server';
import { generateInterviewerReply } from '@/lib/gemma';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { interviewType, questionType, difficulty, messages } = body as Record<string, unknown>;

  if (
    typeof interviewType !== 'string' ||
    typeof questionType !== 'string' ||
    typeof difficulty !== 'string'
  ) {
    return NextResponse.json(
      { error: 'interviewType, questionType, and difficulty are required strings' },
      { status: 400 }
    );
  }

  const safeMessages = Array.isArray(messages)
    ? (messages as Array<{ role: string; text: string }>)
    : [];

  try {
    const reply = await generateInterviewerReply({
      interviewType,
      questionType,
      difficulty,
      messages: safeMessages,
    });
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('[POST /api/interviewer]', error);
    return NextResponse.json({ error: 'Failed to generate question' }, { status: 500 });
  }
}
