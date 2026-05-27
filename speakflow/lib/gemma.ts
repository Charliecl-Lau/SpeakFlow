import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_ID = process.env.GEMMA_MODEL_ID ?? 'gemma-3-27b-it';

function getGenAI() {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }
  return new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
}

export function buildInterviewerPrompt(
  interviewType: string,
  questionType: string,
  difficulty: string
): string {
  return `You are a professional interview coach conducting a ${interviewType} interview.
Question type: ${questionType}. Difficulty: ${difficulty}.

Ask one question at a time. Keep responses under 3 sentences.
If the user's answer is vague or incomplete, ask one targeted follow-up.
If the answer is complete, move to the next question.
Do not give scores or feedback yet. Act like a real interviewer.`;
}

export function buildEvaluationPrompt(): string {
  return `You are an interview communication evaluator.
Analyse the full interview transcript below.
Return valid JSON only - no markdown, no explanation.

Fields required:
overallScore (0-100), clarityScore, confidenceScore, structureScore, specificityScore,
fillerWords (string[]), strengths (string[]), weaknesses (string[]),
improvedAnswer (string), nextPracticeAdvice (string).

Evaluate use of STAR structure: Situation, Task, Action, Result.`;
}

export function parseEvaluationResponse(raw: string): object {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function generateInterviewerReply(params: {
  interviewType: string;
  questionType: string;
  difficulty: string;
  messages: Array<{ role: string; text: string }>;
}): Promise<string> {
  const { interviewType, questionType, difficulty, messages } = params;
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

  const systemInstruction = buildInterviewerPrompt(interviewType, questionType, difficulty);

  const contents = messages.map(m => ({
    role: m.role === 'interviewer' ? 'model' as const : 'user' as const,
    parts: [{ text: m.text }],
  }));

  const safeContents = contents.length > 0 && contents[0].role === 'user'
    ? contents
    : [{ role: 'user' as const, parts: [{ text: 'Begin the interview.' }] }, ...contents];

  const result = await model.generateContent({
    systemInstruction,
    contents: safeContents,
  });

  return result.response.text().trim();
}

export async function generateFeedback(
  messages: Array<{ role: string; text: string }>
): Promise<object> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

  const transcript = messages
    .map(m => `${m.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
    .join('\n\n');

  const result = await model.generateContent({
    systemInstruction: buildEvaluationPrompt(),
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
  });

  return parseEvaluationResponse(result.response.text());
}
