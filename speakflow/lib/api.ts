import type { Message, EvaluationResult } from './types';

export async function fetchInterviewerReply(params: {
  interviewType: string;
  questionType:  string;
  difficulty:    string;
  messages:      Message[];
}): Promise<string> {
  const res = await fetch('/api/interviewer', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`/api/interviewer ${res.status}`);
  const data = await res.json() as { reply: string };
  return data.reply;
}

export async function fetchTts(text: string): Promise<string> {
  const res = await fetch('/api/tts', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchTranscription(audio: Blob): Promise<string> {
  const form = new FormData();
  const extension = audio.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('audio', audio, `answer.${extension}`);

  const res = await fetch('/api/transcribe', {
    method: 'POST',
    body:   form,
  });
  if (!res.ok) throw new Error(`/api/transcribe ${res.status}`);
  const data = await res.json() as { transcript?: string };
  return data.transcript?.trim() ?? '';
}

export async function fetchEvaluation(messages: Message[]): Promise<EvaluationResult> {
  const res = await fetch('/api/evaluate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`/api/evaluate ${res.status}`);
  return res.json() as Promise<EvaluationResult>;
}
