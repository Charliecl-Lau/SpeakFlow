import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMMA_MODEL_ID = 'gemma-4-31b-it';

export type EvaluationFeedback = {
  overallScore: number;
  clarityScore: number;
  confidenceScore: number;
  structureScore: number;
  specificityScore: number;
  fillerWords: string[];
  strengths: string[];
  weaknesses: string[];
  improvedAnswer: string;
  nextPracticeAdvice: string;
};

export function getGemmaModelId(): string {
  return process.env.GEMMA_MODEL_ID ?? DEFAULT_GEMMA_MODEL_ID;
}

function getAI() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }
  return new GoogleGenAI({ apiKey });
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
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function validateEvaluationFeedback(value: unknown): EvaluationFeedback {
  if (!isRecord(value)) {
    throw new Error('Evaluation response must be a JSON object');
  }

  const scoreFields = [
    'overallScore',
    'clarityScore',
    'confidenceScore',
    'structureScore',
    'specificityScore',
  ] as const;
  for (const field of scoreFields) {
    if (!isScore(value[field])) {
      throw new Error(`Evaluation response field ${field} must be a number from 0 to 100`);
    }
  }

  const listFields = ['fillerWords', 'strengths', 'weaknesses'] as const;
  for (const field of listFields) {
    if (!isStringArray(value[field])) {
      throw new Error(`Evaluation response field ${field} must be a string array`);
    }
  }

  if (typeof value.improvedAnswer !== 'string') {
    throw new Error('Evaluation response field improvedAnswer must be a string');
  }
  if (typeof value.nextPracticeAdvice !== 'string') {
    throw new Error('Evaluation response field nextPracticeAdvice must be a string');
  }

  return value as EvaluationFeedback;
}

export async function generateInterviewerReply(params: {
  interviewType: string;
  questionType: string;
  difficulty: string;
  messages: Array<{ role: string; text: string }>;
}): Promise<string> {
  const { interviewType, questionType, difficulty, messages } = params;
  const ai = getAI();

  const systemInstruction = buildInterviewerPrompt(interviewType, questionType, difficulty);

  const contents = messages.map(m => ({
    role: m.role === 'interviewer' ? 'model' as const : 'user' as const,
    parts: [{ text: m.text }],
  }));

  const safeContents = contents.length > 0 && contents[0].role === 'user'
    ? contents
    : [{ role: 'user' as const, parts: [{ text: 'Begin the interview.' }] }, ...contents];

  const result = await ai.models.generateContent({
    model: getGemmaModelId(),
    contents: safeContents,
    config: { systemInstruction },
  });

  return (result.text ?? '').trim();
}

export async function generateFeedback(
  messages: Array<{ role: string; text: string }>
): Promise<EvaluationFeedback> {
  const ai = getAI();

  const transcript = messages
    .map(m => `${m.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
    .join('\n\n');

  const result = await ai.models.generateContent({
    model: getGemmaModelId(),
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    config: {
      systemInstruction: buildEvaluationPrompt(),
      responseMimeType: 'application/json',
    },
  });

  return validateEvaluationFeedback(parseEvaluationResponse(result.text ?? ''));
}
