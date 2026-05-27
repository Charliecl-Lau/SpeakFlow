# SpeakFlow Plan 4: Voice Loop Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the real APIs into the UI — replace all mock responses with live Gemma questions, ElevenLabs audio, and browser SpeechRecognition. Implement the complete voice loop, real metrics from transcripts, the `/api/evaluate` feedback card, and all error handling.

**Architecture:** A `lib/useSpeechRecognition.ts` custom hook encapsulates the browser SpeechRecognition API. `page.tsx` is updated to call all three API routes in sequence during a turn. A `messagesRef` ref mirrors the `messages` state so async callbacks always read the latest value without stale closures. `handleTurn()` reads from `messagesRef.current` directly — no parameter needed, no state batching race.

**Tech Stack:** Next.js 14, React 18, Browser SpeechRecognition API, Web Audio API, TypeScript

**Dependency on other plans:** Requires both Plan 2 (UI Shell) and Plan 3 (Backend APIs) to be complete.

---

### Task 1: Implement `lib/useSpeechRecognition.ts`

**Files:**
- Create: `speakflow/lib/useSpeechRecognition.ts`

- [ ] **Step 1: Create the hook**

Create `speakflow/lib/useSpeechRecognition.ts`:

```ts
import { useRef, useCallback } from 'react';

type UseSpeechRecognitionOptions = {
  onResult: (transcript: string, startedAt: number) => void;
  onError:  (error: string) => void;
};

export function useSpeechRecognition({ onResult, onError }: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const startedAtRef   = useRef<number>(0);

  const isSupported = useCallback((): boolean => {
    return typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }, []);

  const start = useCallback(() => {
    if (!isSupported()) {
      onError('SpeechRecognition not supported in this browser.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: new () => SpeechRecognition = (window as any).SpeechRecognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || (window as any).webkitSpeechRecognition;

    const recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';

    startedAtRef.current = Date.now();

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) onResult(transcript, startedAtRef.current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      onError(event.error ?? 'SpeechRecognition error');
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  return { start, stop, isSupported };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

The browser's `lib.dom.d.ts` in TypeScript 5+ includes SpeechRecognition types. Check:

```powershell
cd speakflow && npx tsc --noEmit
```

Expected: no errors. If you get "Cannot find name 'SpeechRecognition'", update `tsconfig.json` to include `"lib": ["dom", "dom.iterable", "esnext"]` in `compilerOptions`.

- [ ] **Step 3: Commit**

```powershell
git add speakflow/lib/useSpeechRecognition.ts
git commit -m "feat: add useSpeechRecognition hook wrapping browser SpeechRecognition API

Encapsulate browser SpeechRecognition start/stop in a React hook. onResult
callback receives the full transcript and the timestamp when recording started
(needed for WPM computation). Handles the webkit prefix and exposes isSupported()
so the caller can disable the mic button in unsupported browsers."
```

---

### Task 2: Add shared types and API client layer

**Files:**
- Create: `speakflow/lib/types.ts`
- Create: `speakflow/lib/api.ts`
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Create `lib/types.ts`**

Create `speakflow/lib/types.ts`:

```ts
export type Role = 'interviewer' | 'user';

export type Message = {
  role:        Role;
  text:        string;
  timestamp:   number;
  isFeedback?: boolean;
};

export type EvaluationResult = {
  overallScore:       number;
  clarityScore:       number;
  confidenceScore:    number;
  structureScore:     number;
  specificityScore:   number;
  fillerWords:        string[];
  strengths:          string[];
  weaknesses:         string[];
  improvedAnswer:     string;
  nextPracticeAdvice: string;
};
```

- [ ] **Step 2: Create `lib/api.ts`**

Create `speakflow/lib/api.ts`:

```ts
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

export async function fetchEvaluation(messages: Message[]): Promise<EvaluationResult> {
  const res = await fetch('/api/evaluate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`/api/evaluate ${res.status}`);
  return res.json() as Promise<EvaluationResult>;
}
```

- [ ] **Step 3: Update `page.tsx` to import shared types**

At the top of `speakflow/app/page.tsx`, remove the local `type Role` and `type Message` definitions and add:

```tsx
import type { Role, Message } from '@/lib/types';
import { fetchInterviewerReply, fetchTts, fetchEvaluation } from '@/lib/api';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import { countFillers, computeWpm, computeConfidence } from '@/lib/metrics';
```

- [ ] **Step 4: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/types.ts speakflow/lib/api.ts speakflow/app/page.tsx
git commit -m "feat: add shared types and API client layer

Extract Message/Role/EvaluationResult into lib/types.ts and all fetch calls
into lib/api.ts. Import them into page.tsx. This decouples network logic from
the component and gives a single place to update API contracts."
```

---

### Task 3: Implement `handleTurn` — the core voice loop

**Files:**
- Modify: `speakflow/app/page.tsx`

The key design: `handleTurn` reads from `messagesRef.current` (a ref that mirrors the `messages` state) instead of the `messages` state directly. This means it never has a stale closure — it always sees the latest messages regardless of when React processes the state update.

- [ ] **Step 1: Add `messagesRef` and `audioRef` inside `Home()`**

Add these two refs alongside the existing refs in `Home()`:

```tsx
  // messagesRef mirrors messages state — used by handleTurn to avoid stale closures
  const messagesRef = useRef<Message[]>([]);
  const audioRef    = useRef<HTMLAudioElement | null>(null);

  // Keep messagesRef in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);
```

- [ ] **Step 2: Add `handleTurn` inside `Home()`, before the `return` statement**

```tsx
  const handleTurn = useCallback(async () => {
    setIsThinking(true);
    setCurrentQuestion('');

    const currentMsgs = messagesRef.current;

    // 1. Fetch question from Gemma
    let question: string;
    try {
      question = await fetchInterviewerReply({
        interviewType,
        questionType,
        difficulty,
        messages: currentMsgs,
      });
    } catch {
      setIsThinking(false);
      addMessage('interviewer', "Sorry, I couldn't generate a question. Try again.");
      return;
    }

    setIsThinking(false);
    setCurrentQuestion(question);

    // Compute question number from interviewer messages so far
    const qNum = currentMsgs.filter(m => m.role === 'interviewer').length + 1;
    setQuestionNumber(qNum);
    addMessage('interviewer', `**Question ${qNum}:** ${question}`);

    // 2. Speak the question via ElevenLabs → fallback to speechSynthesis
    setIsSpeaking(true);
    let blobUrl: string | null = null;
    try {
      blobUrl = await fetchTts(question);
      await new Promise<void>((resolve) => {
        const audio = new Audio(blobUrl!);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {
      // TTS failed — fall back to browser speechSynthesis silently
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(question);
          u.rate  = 0.88;
          u.onend = () => resolve();
          window.speechSynthesis.speak(u);
        });
      }
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      audioRef.current = null;
    }
    setIsSpeaking(false);
    // Mic button is now enabled — user can click to record
  }, [interviewType, questionType, difficulty, addMessage]);
```

- [ ] **Step 3: Update `beginSession` to call `handleTurn`**

In the existing `beginSession`, replace the mock `setTimeout` block:

```tsx
    // Mock question — Plan 4 replaces this with POST /api/interviewer
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      const mockQ = 'Tell me about a time you had to work under significant pressure. How did you handle it?';
      setCurrentQuestion(mockQ);
      addMessage('interviewer', `**Question 1:** ${mockQ}`);
    }, 1200);
```

Replace with:

```tsx
    handleTurn();
```

- [ ] **Step 4: Update `endSession` to cancel audio**

In `endSession`, add at the start of the function body:

```tsx
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
```

- [ ] **Step 5: Test in browser**

With `npm run dev` running at `http://localhost:3000`:

1. Select "Banking & Finance", "Behavioural", "Mid"
2. Click "Start Interview" → countdown → session starts
3. **Expected**: typing indicator appears, then disappears, then a real Gemma question appears in chat AND in the q-card
4. A few seconds later: ElevenLabs audio plays the question aloud
5. After audio finishes: mic button becomes active (not greyed out)
6. Click "End session": session ends, UI returns to idle

- [ ] **Step 6: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: implement handleTurn — Gemma question + ElevenLabs audio

handleTurn() is the core voice loop: fetch question from Gemma, update the
q-card, speak it via ElevenLabs (fallback to speechSynthesis on failure), then
enable the mic. Uses messagesRef.current instead of React state so it always
reads the latest messages regardless of async timing. isSpeaking blocks the
mic button until audio ends — users cannot talk over the AI."
```

---

### Task 4: Wire SpeechRecognition and live metrics

**Files:**
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Add `onResult` and `onError` callbacks, then instantiate the hook**

Add inside `Home()`, before the `return` statement. Place this AFTER the `handleTurn` definition (hooks must be called in a consistent order):

```tsx
  const handleSpeechResult = useCallback((transcript: string, startedAt: number) => {
    const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
    const words          = transcript.trim().split(/\s+/).filter(Boolean);
    const { count, words: fw } = countFillers(transcript);
    const wpmValue  = computeWpm(words.length, elapsedSeconds);
    const confValue = computeConfidence(count);

    setFillerCount(count);
    setFillerList(fw);
    setWpm(wpmValue);
    setConfidence(confValue);
    setIsRecording(false);
    setIsListening(false);

    // Add user message to both state and ref, then immediately trigger next turn
    const userMsg: Message = { role: 'user', text: transcript, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages(prev => [...prev, userMsg]);
    handleTurn();
  }, [countFillers, computeWpm, computeConfidence, handleTurn]);

  const handleSpeechError = useCallback((error: string) => {
    setIsRecording(false);
    setIsListening(false);
    addMessage('interviewer', `Voice input error: ${error}. Please use the text box below.`);
  }, [addMessage]);

  const { start: startRecognition, stop: stopRecognition, isSupported: isSpeechSupported } =
    useSpeechRecognition({ onResult: handleSpeechResult, onError: handleSpeechError });
```

- [ ] **Step 2: Update the mic button `onClick` in the JSX**

Find:
```tsx
              onClick={() => {/* Plan 4 wires SpeechRecognition here */}}
```

Replace with:
```tsx
              onClick={() => {
                if (!isSpeechSupported()) {
                  addMessage('interviewer', 'Voice input not supported in this browser. Use the text box below.');
                  return;
                }
                if (isRecording) {
                  stopRecognition();
                  setIsRecording(false);
                  setIsListening(false);
                } else {
                  setIsRecording(true);
                  setIsListening(true);
                  startRecognition();
                }
              }}
```

- [ ] **Step 3: Update `micDisabled` and `mic-hint` for unsupported browsers**

Replace the existing `micDisabled` line:
```tsx
  const micDisabled = isThinking || isSpeaking;
```

With:
```tsx
  const micDisabled = isThinking || isSpeaking;
  const micUnsupported = typeof window !== 'undefined' && !isSpeechSupported();
```

Update the `mic-hint` JSX:
```tsx
            <div className="mic-hint">
              {micUnsupported
                ? 'Voice input not supported in this browser. Use the text box below.'
                : micDisabled
                  ? (isSpeaking ? 'Listen to the question…' : 'Thinking…')
                  : isRecording
                    ? 'Recording… click again when done'
                    : 'Click mic to start recording your answer'}
            </div>
```

Update the mic button `disabled` prop:
```tsx
              disabled={micDisabled || micUnsupported}
```

- [ ] **Step 4: Update `endSession` to stop recognition**

In `endSession`, add after the audio cancellation:
```tsx
    stopRecognition();
```

- [ ] **Step 5: Test voice recording in Chrome**

Open `http://localhost:3000` in Chrome (best SpeechRecognition support):

1. Start a session and wait for the AI question to finish speaking (mic button becomes active)
2. Click the mic — it turns red, "Recording…" appears
3. Speak for 20–30 seconds, include "um" or "like" at least once
4. Click mic again to stop
5. **Expected**:
   - Your transcript appears as a "You" chat bubble
   - Filler count updates (non-zero if you said "um" etc.)
   - WPM shows a real number (typically 100–180)
   - Confidence ring animates to a new value
   - Typing indicator appears, then next Gemma question appears and is spoken

- [ ] **Step 6: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: wire SpeechRecognition and compute live metrics from real transcripts

Connect useSpeechRecognition to the mic button. onResult computes filler count,
WPM, and confidence from the real browser transcript using lib/metrics.ts. After
each answer, messagesRef is updated synchronously before calling handleTurn() —
this avoids the stale-closure problem where React state updates are async.
Mic button is disabled in unsupported browsers with a text-fallback hint."
```

---

### Task 5: Wire `/api/evaluate` and render feedback card

**Files:**
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Add `handleEndSession` inside `Home()`**

Add before the `return` statement:

```tsx
  const handleEndSession = useCallback(async () => {
    stopRecognition();
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsThinking(true);
    setIsListening(false);
    setIsRecording(false);
    setIsSpeaking(false);

    const transcriptMsgs = messagesRef.current.filter(m => !m.isFeedback);

    try {
      const fb = await fetchEvaluation(transcriptMsgs);

      const feedbackText = [
        `**Overall Score: ${fb.overallScore}/100**`,
        `Clarity: ${fb.clarityScore} · Confidence: ${fb.confidenceScore} · Structure: ${fb.structureScore} · Specificity: ${fb.specificityScore}`,
        '',
        `**Strengths**`,
        fb.strengths.map(s => `• ${s}`).join('\n'),
        '',
        `**Improvements**`,
        fb.weaknesses.map(w => `• ${w}`).join('\n'),
        '',
        `**Improved Answer**`,
        fb.improvedAnswer,
        '',
        `**Next Practice Focus**`,
        fb.nextPracticeAdvice,
        ...(fb.fillerWords.length > 0
          ? ['', `**Filler words detected:** ${fb.fillerWords.join(', ')}`]
          : []),
      ].join('\n');

      setIsThinking(false);
      addMessage('interviewer', feedbackText, true);
    } catch {
      setIsThinking(false);
      addMessage('interviewer', 'Feedback unavailable. Try ending the session again.');
    }

    endSession();
  }, [stopRecognition, endSession, addMessage]);
```

- [ ] **Step 2: Update the "End session" button to call `handleEndSession`**

Find:
```tsx
            <button className="end-btn" onClick={endSession}>End session</button>
```

Replace with:
```tsx
            <button className="end-btn" onClick={handleEndSession} disabled={isThinking}>End session</button>
```

- [ ] **Step 3: Test in browser**

1. Start a session, answer at least one question via voice or text
2. Click "End session"
3. **Expected**:
   - "End session" button is disabled (greyed out) while thinking
   - Typing indicator appears in chat
   - After a few seconds, a green-tinted `.feedback-card` bubble appears with: overall score, 4 sub-scores, strengths (bullet list), improvements (bullet list), improved answer, next practice focus
   - UI returns to idle state (session card visible, metrics bar hidden)
   - Feedback card remains in the chat panel

- [ ] **Step 4: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: wire /api/evaluate and render inline feedback card

On End Session, POST full conversation to /api/evaluate and render the
structured Gemma feedback as a .feedback-card bubble in chat. Uses
messagesRef.current to capture the latest messages (same pattern as handleTurn).
Falls back to error message in chat if evaluate call fails. The feedback card
stays visible after the session ends — no separate page needed."
```

---

### Task 6: Wire text input to `/api/interviewer`

**Files:**
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Update `sendMsg` to call the real API**

Find the mock response block inside `sendMsg`:

```tsx
    // Mock response — Plan 4 replaces with POST /api/interviewer
    setTimeout(() => {
      setIsThinking(false);
      addMessage('interviewer', 'Good point. To strengthen it, try leading with the specific outcome before explaining your approach.');
    }, 1200);
```

Replace with:

```tsx
    // Add user message to ref immediately so handleTurn sees it
    const userMsg: Message = { role: 'user', text: txt, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMsg];

    try {
      const reply = await fetchInterviewerReply({
        interviewType,
        questionType,
        difficulty,
        messages: messagesRef.current,
      });
      setIsThinking(false);
      const aiMsg: Message = { role: 'interviewer', text: reply, timestamp: Date.now() };
      messagesRef.current = [...messagesRef.current, aiMsg];
      addMessage('interviewer', reply);
    } catch {
      setIsThinking(false);
      addMessage('interviewer', "Sorry, I couldn't generate a question. Try again.");
    }
```

- [ ] **Step 2: Test text input in browser**

1. Start a session
2. Type "How do I structure a behavioral answer?" in the text box and press Enter
3. **Expected**: your message appears as a "You" bubble, typing indicator shows, then a real Gemma coaching response appears (not the hardcoded mock)

- [ ] **Step 3: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: wire text input to /api/interviewer for real AI responses

Replace hardcoded mock response in sendMsg() with POST /api/interviewer.
Full conversation history is passed (via messagesRef) so Gemma maintains
context. Text input and voice input now go through the same AI route."
```

---

### Task 7: Final verification — full end-to-end test

**Files:** None created/modified.

- [ ] **Step 1: Run the full test suite**

```powershell
cd speakflow && npm test
```

Expected:
```
PASS lib/gemma.test.ts
PASS lib/elevenlabs.test.ts
PASS lib/metrics.test.ts

Test Suites: 3 passed, 3 total
Tests:       ~16 passed, 16 total
```

- [ ] **Step 2: TypeScript compile check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Full golden-path test in Chrome**

Open `http://localhost:3000` in Chrome and complete the full loop:

1. Select "Software Engineering", "Technical", "Hard"
2. Click "Start Interview" → countdown → session starts
3. ElevenLabs speaks a Gemma technical question aloud
4. Click mic → speak a 30-second answer (say "um" once) → click mic to stop
5. Verify: transcript in chat, WPM shown, filler count = 1, confidence ring updated
6. Hear the next Gemma follow-up question
7. Type a text answer → verify real AI response appears
8. Click "End session" → verify feedback card with all 10 fields appears

- [ ] **Step 4: Test error fallbacks**

4a. **TTS failure fallback**: temporarily change `ELEVENLABS_API_KEY` to `invalid` in `.env.local`, restart dev server, start a session. Expected: question appears in chat and is spoken by browser speechSynthesis. Restore the real key and restart.

4b. **Unsupported browser**: open in Firefox or Safari (SpeechRecognition may not be available). Expected: mic button is disabled, mic-hint shows "Voice input not supported", text input still works.

- [ ] **Step 5: Final commit**

```powershell
git add -A
git commit -m "feat: SpeakFlow integration complete — full voice loop working

All four plan phases complete. Full voice loop: Gemma question → ElevenLabs
speech → browser SpeechRecognition → real transcript → live metrics → next
Gemma turn. Error paths verified: TTS fallback to speechSynthesis, unsupported-
browser text fallback, API failure messages in chat. All 16 tests pass."
```

---

**SpeakFlow is complete.**

## Build summary

| Artifact | Location |
|---|---|
| Full React UI (all states) | `app/page.tsx` |
| CSS from prototype (verbatim) | `app/globals.css` |
| Gemma client + prompt builders | `lib/gemma.ts` |
| ElevenLabs TTS client | `lib/elevenlabs.ts` |
| Metric computation utilities | `lib/metrics.ts` |
| SpeechRecognition hook | `lib/useSpeechRecognition.ts` |
| API client layer | `lib/api.ts` |
| Shared types | `lib/types.ts` |
| `/api/interviewer` route | `app/api/interviewer/route.ts` |
| `/api/tts` route | `app/api/tts/route.ts` |
| `/api/evaluate` route | `app/api/evaluate/route.ts` |

## Execution order

```
Plan 1 (Scaffold)
      ↓
  ┌───┴───┐
Plan 2   Plan 3   ← run in parallel
(UI)    (APIs)
  └───┬───┘
      ↓
Plan 4 (Integration)
```
