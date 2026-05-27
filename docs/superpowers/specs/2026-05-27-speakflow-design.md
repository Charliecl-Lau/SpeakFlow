# SpeakFlow — Design Spec
**Date:** 2026-05-27

---

## Overview

SpeakFlow is a voice-first AI interview coach. The user speaks answers to interview questions, receives spoken AI follow-ups, and gets a scored feedback report at the end. The entire session lives in the browser with no login or database.

**Tagline:** Practice interviews out loud. Get instant AI feedback.

---

## Scope

### In
- Interview type + question type + difficulty selection
- Voice recording via Browser SpeechRecognition API
- AI interviewer questions and follow-ups (Gemma 4 31B, Google AI Studio)
- ElevenLabs voice playback of AI questions
- Live metrics: filler word count, WPM, confidence ring (computed from transcript)
- Full conversation transcript stored in React state
- End session → inline AI feedback card in chat panel
- Text chat input as fallback (also routed through `/api/interviewer`)

### Out
- Login / user accounts
- Database / persistent history
- Resume upload
- Real-time interruption / barge-in
- Separate feedback page

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Existing `index.html` CSS extracted to `globals.css` |
| LLM | Gemma 4 31B via Google AI Studio (`@google/generative-ai`, model ID to confirm in AI Studio console) |
| TTS | ElevenLabs REST API (`eleven_turbo_v2`) |
| STT | Browser `SpeechRecognition` API |
| State | React `useState` + `useRef` |
| Audio playback | Web `Audio` API (Blob URL) |

---

## Project Structure

```
speakflow/
  app/
    page.tsx                   # Single interview page (all UI)
    api/
      interviewer/route.ts     # Gemma question + follow-up generation
      tts/route.ts             # ElevenLabs TTS proxy
      evaluate/route.ts        # Gemma end-of-session feedback
    globals.css                # CSS extracted verbatim from index.html
    layout.tsx
  lib/
    gemma.ts                   # Google AI Studio client + prompt helpers
    elevenlabs.ts              # ElevenLabs fetch helper
  .env.local
    GOOGLE_AI_API_KEY
    ELEVENLABS_API_KEY
    ELEVENLABS_VOICE_ID
```

---

## UI Integration Strategy

The `index.html` CSS is extracted verbatim into `globals.css` — no Tailwind conflict, no rewrites. The JSX in `page.tsx` reproduces the HTML structure using the same class names. JavaScript that was inline in the HTML becomes React event handlers and `useEffect` hooks.

The existing mock implementations that get replaced:

| Old (mock) | New (real) |
|---|---|
| `speakText()` via `window.speechSynthesis` | `POST /api/tts` → ElevenLabs → Audio Blob |
| `QUESTIONS[type][qtype]` hardcoded array | `POST /api/interviewer` → Gemma reply |
| `SAMPLE_ANSWERS` random pick | Browser `SpeechRecognition` transcript |
| `FEEDBACK` random pick | `POST /api/evaluate` → Gemma feedback JSON |
| `COACH_REPLIES` random pick | `POST /api/interviewer` (same route, chat mode) |

Everything else — sidebar, metrics bar, countdown, waveform, chat bubbles, typing indicator — is kept exactly as designed.

---

## Data Types

```ts
type Role = "interviewer" | "user";

type Message = {
  role: Role;
  text: string;
  timestamp: number;
};

type InterviewState = {
  interviewType: string;   // "banking" | "consulting" | "software" | "product" | "marketing" | "data"
  questionType: string;    // "behavioral" | "technical" | "case"
  difficulty: string;      // "easy" | "mid" | "hard"
  messages: Message[];
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
};
```

---

## Voice Loop

```
1. POST /api/interviewer  →  question text          [isThinking = true]
2. POST /api/tts          →  audio blob → play      [isSpeaking = true]
3. audio.onended          →  enable mic button      [isSpeaking = false]
4. user clicks mic        →  SpeechRecognition.start() [isListening = true]
5. onresult               →  transcript string      [isListening = false]
6. compute filler + WPM from transcript
7. append user Message, update chat
8. repeat from step 1     (or evaluate on End Session)
```

The mic button is **disabled** during steps 1–3. It becomes active only after audio playback ends. This prevents the user from talking over the AI.

---

## State Machine

| State | `isThinking` | `isSpeaking` | `isListening` | Mic enabled |
|---|---|---|---|---|
| Idle | false | false | false | false |
| Thinking | true | false | false | false |
| Speaking | false | true | false | false |
| Listening | false | false | true | true (recording) |

---

## API Routes

### `POST /api/interviewer`

**Request:**
```json
{
  "interviewType": "banking",
  "questionType": "behavioral",
  "difficulty": "mid",
  "messages": [{ "role": "interviewer", "text": "...", "timestamp": 0 }]
}
```

**Response:**
```json
{ "reply": "Tell me about a time you analysed complex financial data under pressure." }
```

**Gemma system prompt:**
```
You are a professional interview coach conducting a {interviewType} interview.
Question type: {questionType}. Difficulty: {difficulty}.

Ask one question at a time. Keep responses under 3 sentences.
If the user's answer is vague or incomplete, ask one targeted follow-up.
If the answer is complete, move to the next question.
Do not give scores or feedback yet. Act like a real interviewer.
```

---

### `POST /api/tts`

**Request:**
```json
{ "text": "Tell me about a time you analysed complex financial data." }
```

**Response:** `audio/mpeg` stream

Proxies to ElevenLabs `POST /v1/text-to-speech/{ELEVENLABS_VOICE_ID}` with:
- `model_id: "eleven_turbo_v2"`
- `voice_settings: { stability: 0.5, similarity_boost: 0.75 }`

The client receives the binary response, creates a `Blob` URL, and plays it via `new Audio(blobUrl)`.

---

### `POST /api/evaluate`

**Request:**
```json
{ "messages": [{ "role": "interviewer", "text": "...", "timestamp": 0 }] }
```

**Response:**
```json
{
  "overallScore": 84,
  "clarityScore": 80,
  "confidenceScore": 78,
  "structureScore": 88,
  "specificityScore": 82,
  "fillerWords": ["um", "like"],
  "strengths": ["Clear STAR structure", "Specific outcome cited"],
  "weaknesses": ["Result section too brief"],
  "improvedAnswer": "...",
  "nextPracticeAdvice": "Focus on quantifying your results."
}
```

**Gemma system prompt:**
```
You are an interview communication evaluator.
Analyse the full interview transcript below.
Return valid JSON only — no markdown, no explanation.

Fields required:
overallScore (0-100), clarityScore, confidenceScore, structureScore, specificityScore,
fillerWords (string[]), strengths (string[]), weaknesses (string[]),
improvedAnswer (string), nextPracticeAdvice (string).

Evaluate use of STAR structure: Situation, Task, Action, Result.
```

The response is parsed with `JSON.parse()`. If parsing fails, a fallback error message is shown in chat.

---

## Live Metrics

Computed from the real SpeechRecognition transcript string (not simulated timers):

- **Filler words:** count occurrences of `["um","uh","like","you know","sort of","kind of","basically","literally"]` in transcript
- **WPM:** `(wordCount / elapsedSeconds) * 60`, where elapsed is tracked from `SpeechRecognition.start()` to `onresult`
- **Confidence:** `max(32, min(97, 78 - fillerCount * 4))` — same formula as original, but now fed by real filler count

---

## Feedback Display

When the user clicks "End session":

1. `isThinking = true`, typing indicator shown in chat
2. `POST /api/evaluate` with full `messages` array
3. Response rendered as a `.feedback-card` bubble in the chat panel
4. UI returns to idle state (session card visible, metrics bar hidden)

No separate page. No `sessionStorage`. The feedback is just another chat message.

---

## Error Handling

- `/api/tts` failure → fall back to `window.speechSynthesis` silently; session continues
- `/api/interviewer` failure → show "Sorry, I couldn't generate a question. Try again." in chat
- `/api/evaluate` failure → show "Feedback unavailable. Try ending the session again." in chat
- `SpeechRecognition` not supported → disable mic button, show "Voice input not supported in this browser. Use the text box below."

---

## Build Order

1. Extract CSS from `index.html` → `globals.css`, scaffold Next.js project
2. Port HTML structure to `page.tsx` with React state wiring
3. Implement Browser `SpeechRecognition` hook
4. Implement `/api/interviewer` + connect to Gemma
5. Implement `/api/tts` + connect to ElevenLabs, wire audio playback
6. Wire full `handleTurn()` voice loop
7. Implement `/api/evaluate` + render inline feedback card
8. Polish: loading states, error handling, filler/WPM from real transcript
