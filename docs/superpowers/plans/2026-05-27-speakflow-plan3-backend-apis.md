# SpeakFlow Plan 3: Backend APIs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all three API routes (`/api/interviewer`, `/api/tts`, `/api/evaluate`) and the two library helpers (`lib/gemma.ts`, `lib/elevenlabs.ts`) that they use.

**Architecture:** Each API route is a thin Next.js route handler that validates the request and delegates to a lib function. The lib functions contain all the external API logic and are independently testable. `lib/gemma.ts` wraps Google AI Studio. `lib/elevenlabs.ts` wraps the ElevenLabs REST API.

**Tech Stack:** Next.js 14 Route Handlers, `@google/generative-ai`, ElevenLabs REST API, TypeScript

**Dependency on other plans:** Requires Plan 1 (scaffold) to be complete. Runs in parallel with Plan 2. Plan 4 depends on this being done.

**Prerequisite check:** Confirm `speakflow/.env.local` has real values for `GOOGLE_AI_API_KEY`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` before running smoke tests.

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
import { GoogleGenerativeAI } from '@google/generative-ai';

// Confirm the exact model ID in Google AI Studio console:
// https://aistudio.google.com/app/models
// Common IDs: "gemma-3-27b-it", "gemma-2-27b-it"
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
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

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
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
npm test -- --testPathPattern=gemma
```

Expected: all tests PASS (the unit tests cover pure functions only — no network calls).

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/gemma.ts speakflow/lib/gemma.test.ts
git commit -m "feat: implement Gemma AI client with testable prompt builders

Add lib/gemma.ts wrapping Google AI Studio for question generation and
session evaluation. Prompt-building and response-parsing are pure functions
so they can be unit tested without API calls. generateInterviewerReply()
maps our role convention (interviewer/user) to Gemini's (model/user)."
```

---

### Task 2: Implement `lib/elevenlabs.ts`

**Files:**
- Create: `speakflow/lib/elevenlabs.ts`
- Create: `speakflow/lib/elevenlabs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `speakflow/lib/elevenlabs.test.ts`:

```ts
import { buildTtsRequestBody } from './elevenlabs';

describe('buildTtsRequestBody', () => {
  test('uses eleven_turbo_v2 model', () => {
    const body = buildTtsRequestBody('Hello world');
    expect(body.model_id).toBe('eleven_turbo_v2');
  });

  test('includes the input text', () => {
    const body = buildTtsRequestBody('Tell me about yourself');
    expect(body.text).toBe('Tell me about yourself');
  });

  test('includes required voice settings', () => {
    const body = buildTtsRequestBody('Hello');
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```powershell
npm test -- --testPathPattern=elevenlabs
```

Expected: FAIL — `Cannot find module './elevenlabs'`

- [ ] **Step 3: Implement `lib/elevenlabs.ts`**

Create `speakflow/lib/elevenlabs.ts`:

```ts
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

export function buildTtsRequestBody(text: string): {
  text: string;
  model_id: string;
  voice_settings: { stability: number; similarity_boost: number };
} {
  return {
    text,
    model_id: 'eleven_turbo_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  };
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;

  if (!voiceId || !apiKey) {
    throw new Error('ELEVENLABS_VOICE_ID and ELEVENLABS_API_KEY must be set');
  }

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(buildTtsRequestBody(text)),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
npm test -- --testPathPattern=elevenlabs
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/elevenlabs.ts speakflow/lib/elevenlabs.test.ts
git commit -m "feat: implement ElevenLabs TTS client with testable request builder

Add lib/elevenlabs.ts proxying text to the ElevenLabs eleven_turbo_v2 model.
The request-body builder is a pure function so voice settings can be unit
tested without network calls. textToSpeech() returns a Buffer for the route
handler to stream as audio/mpeg."
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
import { textToSpeech } from '@/lib/elevenlabs';

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
        'Content-Type': 'audio/mpeg',
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
[System.IO.File]::WriteAllBytes("$PWD\test-audio.mp3", $response.Content)
```

Then open `test-audio.mp3` in Windows Media Player or any audio player. You should hear a voice saying "Tell me about yourself."

- [ ] **Step 3: Clean up test file and commit**

```powershell
Remove-Item test-audio.mp3 -ErrorAction SilentlyContinue
git add speakflow/app/api/tts/
git commit -m "feat: implement /api/tts route — ElevenLabs proxy returning audio/mpeg

POST /api/tts proxies the text to ElevenLabs eleven_turbo_v2 and streams back
the audio buffer as audio/mpeg. The client creates a Blob URL and plays it via
the Web Audio API. No-store cache header prevents stale audio between questions."
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
PASS lib/elevenlabs.test.ts
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
