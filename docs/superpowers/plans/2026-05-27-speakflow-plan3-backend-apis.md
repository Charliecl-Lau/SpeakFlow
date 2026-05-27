# SpeakFlow Plan 3: Backend APIs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all three API routes (`/api/interviewer`, `/api/tts`, `/api/evaluate`) and the two library helpers (`lib/gemma.ts`, `lib/gemini-tts.ts`) that they use. Speech-to-text is handled entirely client-side via the Browser `SpeechRecognition` API — no backend STT route is needed.

**Architecture:** Each API route is a thin Next.js route handler that validates the request and delegates to a lib function. The lib functions contain all the external API logic and are independently testable. `lib/gemma.ts` wraps Google AI Studio for chat and evaluation. `lib/gemini-tts.ts` wraps the Gemini 2.5 Flash TTS model (also via Google AI Studio) for audio generation.

**Tech Stack:** Next.js 14 Route Handlers, `@google/genai`, Gemini 2.5 Flash TTS, Browser SpeechRecognition API (frontend only), TypeScript

**Dependency on other plans:** Requires Plan 1 (scaffold) to be complete. Runs in parallel with Plan 2. Plan 4 depends on this being done.

**Prerequisite check:** Confirm `speakflow/.env.local` has a real value for `GOOGLE_AI_API_KEY` before running smoke tests. No separate TTS API key is required — TTS shares the same Google AI key. No STT key is required — it uses the browser's native `window.SpeechRecognition`.

---

### Task 1: Implement `lib/gemma.ts`

**Files:**
- Create: `speakflow/lib/gemma.ts`
- Create: `speakflow/lib/gemma.test.ts`

- [ ] **Step 1: Write the failing test**

Create `speakflow/lib/gemma.test.ts`:

```ts
import { buildInterviewerPrompt, buildEvaluationPrompt, parseEvaluationResponse } from './gemma';

describe('buildInterviewerPrompt', () => {
  test('includes interview type and difficulty in system prompt', () => {
    const prompt = buildInterviewerPrompt('banking', 'behavioral', 'hard');
    expect(prompt).toContain('banking');
    expect(prompt).toContain('behavioral');
    expect(prompt).toContain('hard');
  });

  test('includes instruction to ask one question at a time', () => {
    const prompt = buildInterviewerPrompt('software', 'technical', 'mid');
    expect(prompt.toLowerCase()).toContain('one question at a time');
  });
});

describe('buildEvaluationPrompt', () => {
  test('includes all required JSON field names', () => {
    const prompt = buildEvaluationPrompt();
    const requiredFields = [
      'overallScore', 'clarityScore', 'confidenceScore',
      'structureScore', 'specificityScore', 'fillerWords',
      'strengths', 'weaknesses', 'improvedAnswer', 'nextPracticeAdvice'
    ];
    for (const field of requiredFields) {
      expect(prompt).toContain(field);
    }
  });

  test('instructs to return JSON only', () => {
    const prompt = buildEvaluationPrompt();
    expect(prompt.toLowerCase()).toContain('json');
    expect(prompt.toLowerCase()).toContain('no markdown');
  });
});

describe('parseEvaluationResponse', () => {
  test('parses clean JSON', () => {
    const raw = JSON.stringify({ overallScore: 85, clarityScore: 80 });
    const result = parseEvaluationResponse(raw);
    expect(result).toEqual({ overallScore: 85, clarityScore: 80 });
  });

  test('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"overallScore": 85}\n```';
    const result = parseEvaluationResponse(raw);
    expect(result).toEqual({ overallScore: 85 });
  });

  test('throws on invalid JSON', () => {
    expect(() => parseEvaluationResponse('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
cd speakflow && npm test -- --testPathPattern=gemma
```

Expected: FAIL — `Cannot find module './gemma'`

- [ ] **Step 3: Implement `lib/gemma.ts`**

Create `speakflow/lib/gemma.ts`:

```ts
import { GoogleGenAI } from '@google/genai';

// gemini-2.5-flash: lower latency, better instruction-following, and more
// reliable JSON output than Gemma hosted models for this MVP use case.
const MODEL_ID = process.env.GEMMA_MODEL_ID ?? 'gemini-2.5-flash';

function getAI() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');
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
Return valid JSON only — no markdown, no explanation.

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
  const ai = getAI();

  const systemInstruction = buildInterviewerPrompt(interviewType, questionType, difficulty);

  // Map our message roles to Gemini roles ('model' | 'user')
  const contents = messages.map(m => ({
    role: m.role === 'interviewer' ? 'model' as const : 'user' as const,
    parts: [{ text: m.text }],
  }));

  // Gemini requires the conversation to start with a user turn
  const safeContents = contents.length > 0 && contents[0].role === 'user'
    ? contents
    : [{ role: 'user' as const, parts: [{ text: 'Begin the interview.' }] }, ...contents];

  const result = await ai.models.generateContent({
    model: MODEL_ID,
    contents: safeContents,
    config: { systemInstruction },
  });

  return (result.text ?? '').trim();
}

export async function generateFeedback(
  messages: Array<{ role: string; text: string }>
): Promise<object> {
  const ai = getAI();

  const transcript = messages
    .map(m => `${m.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${m.text}`)
    .join('\n\n');

  // responseMimeType enforces JSON output at the API level, eliminating
  // markdown fence wrapping without relying solely on prompt engineering.
  const result = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    config: {
      systemInstruction: buildEvaluationPrompt(),
      responseMimeType: 'application/json',
    },
  });

  return parseEvaluationResponse(result.text ?? '');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
npm test -- --testPathPattern=gemma
```

Expected: all tests PASS (the unit tests cover pure functions only — no network calls).

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/gemma.ts speakflow/lib/gemma.test.ts
git commit -m "feat: implement Gemini 2.5 Flash AI client with testable prompt builders

Add lib/gemma.ts wrapping Google AI Studio (gemini-2.5-flash) for question
generation and session evaluation. Uses the modern @google/genai GoogleGenAI
client and ai.models.generateContent() API. Prompt-building and response-parsing
are pure functions unit-tested without API calls. generateFeedback() sets
responseMimeType:'application/json' to enforce structured output at the API
level rather than relying solely on prompt engineering."
```

---

### Task 2: Implement `lib/gemini-tts.ts`

**Files:**
- Create: `speakflow/lib/gemini-tts.ts`
- Create: `speakflow/lib/gemini-tts.test.ts`

**How Gemini TTS works:** The Gemini 2.5 Flash TTS model returns raw PCM audio (LINEAR16, 24 kHz, mono) encoded as base64 in the `inlineData` of the response. We wrap the PCM bytes in a minimal WAV header so browsers can play it without extra decoding steps. The WAV wrapping is a pure, testable function.

- [ ] **Step 1: Write the failing test**

Create `speakflow/lib/gemini-tts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npm test -- --testPathPattern=gemini-tts
```

Expected: FAIL — `Cannot find module './gemini-tts'`

- [ ] **Step 3: Implement `lib/gemini-tts.ts`**

Create `speakflow/lib/gemini-tts.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
npm test -- --testPathPattern=gemini-tts
```

Expected: all 3 tests in `buildWavHeader` and 1 in `buildWavBuffer` PASS (pure functions, no network calls).

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/gemini-tts.ts speakflow/lib/gemini-tts.test.ts
git commit -m "feat: implement Gemini 2.5 Flash TTS client

Add lib/gemini-tts.ts using the Gemini 2.5 Flash TTS model via Google AI
Studio (same GOOGLE_AI_API_KEY, no extra credential). The API returns raw
PCM audio; buildWavBuffer() wraps it in a 44-byte WAV header so browsers
can decode it natively. WAV helpers are pure functions and unit-tested
without network calls."
```

---

### Task 3: Implement `/api/interviewer` route

**Files:**
- Create: `speakflow/app/api/interviewer/route.ts`

- [ ] **Step 1: Create the directory and route file**

Create `speakflow/app/api/interviewer/route.ts`:

```ts
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
    typeof questionType  !== 'string' ||
    typeof difficulty    !== 'string'
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
```

- [ ] **Step 2: Start the dev server and smoke test with curl**

```powershell
cd speakflow && npm run dev
```

In a second terminal:

```powershell
$body = '{"interviewType":"banking","questionType":"behavioral","difficulty":"mid","messages":[]}'
Invoke-WebRequest -Uri http://localhost:3000/api/interviewer -Method POST -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
```

Expected: a JSON response like `{"reply":"Tell me about a time you..."}`. The reply should be a relevant interview question from Gemma.

- [ ] **Step 3: Test missing field validation**

```powershell
$body = '{"interviewType":"banking"}'
Invoke-WebRequest -Uri http://localhost:3000/api/interviewer -Method POST -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Select-Object StatusCode, Content
```

Expected: `StatusCode: 400`, content contains `"error"`.

- [ ] **Step 4: Commit**

```powershell
git add speakflow/app/api/interviewer/
git commit -m "feat: implement /api/interviewer route handler

POST /api/interviewer validates the request shape then delegates to
lib/gemma.generateInterviewerReply(). Returns { reply: string } on success
or { error } on validation/API failure. Messages array defaults to empty
so the first call starts a fresh interview."
```

---

### Task 4: Implement `/api/tts` route

**Files:**
- Create: `speakflow/app/api/tts/route.ts`

- [ ] **Step 1: Create the route file**

Create `speakflow/app/api/tts/route.ts`:

```ts
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
    return new NextResponse(audioBuffer, {
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
```

- [ ] **Step 2: Smoke test — save audio to a file and verify it plays**

With the dev server running:

```powershell
$body = '{"text":"Tell me about yourself."}'
$response = Invoke-WebRequest -Uri http://localhost:3000/api/tts -Method POST -Body $body -ContentType "application/json"
[System.IO.File]::WriteAllBytes("$PWD\test-audio.wav", $response.Content)
```

Then open `test-audio.wav` in Windows Media Player or any audio player. You should hear a voice saying "Tell me about yourself."

- [ ] **Step 3: Clean up test file and commit**

```powershell
Remove-Item test-audio.wav -ErrorAction SilentlyContinue
git add speakflow/app/api/tts/
git commit -m "feat: implement /api/tts route — Gemini TTS proxy returning audio/wav

POST /api/tts proxies the text to Gemini 2.5 Flash TTS (same GOOGLE_AI_API_KEY,
no extra credential). The response PCM is wrapped in a WAV header by gemini-tts.ts
so the browser can decode it natively. The client creates a Blob URL and plays it
via the HTML Audio API. No-store cache header prevents stale audio between questions."
```

---

### Task 5: Implement `/api/evaluate` route

**Files:**
- Create: `speakflow/app/api/evaluate/route.ts`

- [ ] **Step 1: Create the route file**

Create `speakflow/app/api/evaluate/route.ts`:

```ts
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
```

- [ ] **Step 2: Smoke test with a sample transcript**

With the dev server running:

```powershell
$body = @'
{
  "messages": [
    {"role": "interviewer", "text": "Tell me about a time you worked under pressure."},
    {"role": "user", "text": "In my last role I had to deliver a financial model overnight before a board presentation. I prioritised the key assumptions, worked through the night, and delivered on time. The CFO used it directly in the meeting."}
  ]
}
'@
Invoke-WebRequest -Uri http://localhost:3000/api/evaluate -Method POST -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
```

Expected: a JSON object containing `overallScore`, `clarityScore`, `strengths`, `weaknesses`, etc. All ten required fields should be present.

- [ ] **Step 3: Verify JSON parsing is robust (test with Gemma markdown fences)**

If Gemma wraps its response in ` ```json ... ``` `, the `parseEvaluationResponse` function strips them. Verify the smoke test above returns valid JSON (not a string with backticks). If it fails with a parse error, check `parseEvaluationResponse` in `lib/gemma.ts`.

- [ ] **Step 4: Commit**

```powershell
git add speakflow/app/api/evaluate/
git commit -m "feat: implement /api/evaluate route — Gemma session feedback

POST /api/evaluate passes the full conversation transcript to Gemma with a
structured evaluation prompt. The response is parsed from JSON (stripping any
markdown fences Gemma might add). Returns all ten feedback fields defined in
the spec: scores, fillerWords, strengths, weaknesses, improvedAnswer, and advice."
```

---

### Task 6: Run all tests

**Files:** None created/modified.

- [ ] **Step 1: Run the full test suite**

```powershell
cd speakflow && npm test
```

Expected output:
```
PASS lib/gemma.test.ts
PASS lib/gemini-tts.test.ts
PASS lib/metrics.test.ts

Test Suites: 3 passed, 3 total
Tests:       ~16 passed, 16 total
```

If any tests fail, fix them before proceeding to Plan 4.

- [ ] **Step 2: Run TypeScript compile check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit if there are any fixes**

If step 1 or 2 required fixes:

```powershell
git add -A
git commit -m "fix: resolve test or type errors in backend API layer

Address any failing tests or TypeScript errors found during the final
verification pass of the backend API implementation."
```

---

**Backend APIs complete. Plan 4 (Integration) can now start.**
