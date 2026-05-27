# SpeakFlow Plan 2: UI Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full React UI in `app/page.tsx` — sidebar, main panel, chat panel, countdown, metrics bar — with mock API responses. No real API calls yet; those come in Plan 4.

**Architecture:** Single `'use client'` page component. CSS extracted verbatim from `../index.html` into `globals.css`. Pure utility functions (`lib/metrics.ts`) are extracted and unit-tested. All UI states (idle, countdown, active, thinking, recording) are driven by React state.

**Tech Stack:** Next.js 14 App Router, React 18 hooks, TypeScript

**Dependency on other plans:** Requires Plan 1 (scaffold) to be complete. Runs in parallel with Plan 3.

---

### Task 1: Extract CSS and update layout

**Files:**
- Create: `speakflow/app/globals.css`
- Modify: `speakflow/app/layout.tsx`

- [ ] **Step 1: Replace globals.css with CSS from the static prototype**

The CSS lives inside the `<style>` tag in `../index.html` (lines 6–495 in the repo root). Copy everything between `<style>` and `</style>` (not including those tags themselves) and write it as the entire content of `speakflow/app/globals.css`.

Run this PowerShell command from the repo root to extract it:

```powershell
$html = Get-Content "index.html" -Raw
$css = [regex]::Match($html, '(?s)<style>(.*?)</style>').Groups[1].Value
Set-Content "speakflow/app/globals.css" $css -Encoding utf8
```

Expected: `speakflow/app/globals.css` exists and starts with `:root {`.

- [ ] **Step 2: Verify the CSS starts correctly**

```powershell
Get-Content "speakflow/app/globals.css" -TotalCount 5
```

Expected output:
```

    :root {
      --bg:          #ffffff;
      --surface:     #f7f7f7;
      --surface-2:   #eeeeee;
```

- [ ] **Step 3: Replace layout.tsx**

Write `speakflow/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpeakFlow — Interview Practice',
  description: 'Practice interviews out loud. Get instant AI feedback.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Start the dev server and verify the page background is white with no default Next.js styles**

```powershell
cd speakflow && npm run dev
```

Open `http://localhost:3000`. The page should be a plain white background (our CSS is active). There should be no Next.js default styles (no blue links, no centered content box).

- [ ] **Step 5: Commit**

```powershell
git add speakflow/app/globals.css speakflow/app/layout.tsx
git commit -m "feat: extract CSS from prototype and configure layout

Copy the complete CSS from the static index.html prototype verbatim into
globals.css. Update layout.tsx to use it with no Tailwind conflict. This
preserves the exact visual design from the prototype without rewriting styles."
```

---

### Task 2: Create metric utility functions and tests

**Files:**
- Create: `speakflow/lib/metrics.ts`
- Create: `speakflow/lib/metrics.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `speakflow/lib/metrics.test.ts`:

```ts
import { countFillers, computeWpm, computeConfidence, FILLERS } from './metrics';

describe('countFillers', () => {
  test('counts a single filler word', () => {
    const result = countFillers('I um went to the store');
    expect(result.count).toBe(1);
    expect(result.words).toContain('um');
  });

  test('counts multiple occurrences of the same filler', () => {
    const result = countFillers('um I um said um like that');
    expect(result.count).toBe(4);
    expect(result.words).toContain('um');
    expect(result.words).toContain('like');
  });

  test('returns 0 for clean transcript', () => {
    const result = countFillers('I performed the analysis and delivered the results.');
    expect(result.count).toBe(0);
    expect(result.words).toHaveLength(0);
  });

  test('is case-insensitive', () => {
    const result = countFillers('UM I said LIKE that');
    expect(result.count).toBe(2);
  });

  test('does not match partial words (like in "likewise")', () => {
    const result = countFillers('likewise I proceeded');
    expect(result.count).toBe(0);
  });
});

describe('computeWpm', () => {
  test('computes WPM correctly', () => {
    expect(computeWpm(150, 60)).toBe(150);
  });

  test('returns 0 for zero elapsed time', () => {
    expect(computeWpm(10, 0)).toBe(0);
  });

  test('rounds to nearest integer', () => {
    expect(computeWpm(100, 60)).toBe(100);
    expect(computeWpm(101, 60)).toBe(101);
  });
});

describe('computeConfidence', () => {
  test('returns 78 for zero fillers', () => {
    expect(computeConfidence(0)).toBe(78);
  });

  test('decreases by 4 per filler', () => {
    expect(computeConfidence(1)).toBe(74);
    expect(computeConfidence(5)).toBe(58);
  });

  test('clamps at minimum 32', () => {
    expect(computeConfidence(20)).toBe(32);
  });

  test('clamps at maximum 97', () => {
    expect(computeConfidence(0)).toBeLessThanOrEqual(97);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (functions don't exist yet)**

First install Jest with TypeScript support:

```powershell
npm install -D jest ts-jest @types/jest
```

Add to `speakflow/package.json` (inside `"scripts"`):
```json
"test": "jest"
```

Add `speakflow/jest.config.js`:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
```

Run:
```powershell
npm test -- --testPathPattern=metrics
```

Expected: FAIL — `Cannot find module './metrics'`

- [ ] **Step 3: Implement `lib/metrics.ts`**

Create `speakflow/lib/metrics.ts`:

```ts
export const FILLERS = ['um','uh','like','you know','sort of','kind of','basically','literally'];

export function countFillers(transcript: string): { count: number; words: string[] } {
  const lower = transcript.toLowerCase();
  let totalCount = 0;
  const foundWords: string[] = [];

  for (const filler of FILLERS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    const matches = lower.match(regex);
    if (matches) {
      totalCount += matches.length;
      if (!foundWords.includes(filler)) foundWords.push(filler);
    }
  }

  return { count: totalCount, words: foundWords };
}

export function computeWpm(wordCount: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  return Math.round((wordCount / elapsedSeconds) * 60);
}

export function computeConfidence(fillerCount: number): number {
  return Math.max(32, Math.min(97, 78 - fillerCount * 4));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
npm test -- --testPathPattern=metrics
```

Expected: all tests PASS, 3 test suites, ~10 tests.

- [ ] **Step 5: Commit**

```powershell
git add speakflow/lib/metrics.ts speakflow/lib/metrics.test.ts speakflow/jest.config.js speakflow/package.json speakflow/package-lock.json
git commit -m "feat: add metric computation utilities with tests

Extract filler-word counting, WPM, and confidence computation into testable
pure functions in lib/metrics.ts. These are fed by real SpeechRecognition
transcripts in Plan 4 (Integration). Tests verify the boundary cases for
clamping and partial-word matching."
```

---

### Task 3: Build page.tsx — types, constants, and state

**Files:**
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Write the initial page.tsx with types, constants, and state skeleton**

Replace the entire contents of `speakflow/app/page.tsx` with:

```tsx
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────
type Role = 'interviewer' | 'user';

type Message = {
  role: Role;
  text: string;
  timestamp: number;
  isFeedback?: boolean;
};

// ── Constants ──────────────────────────────────────────────────
const META: Record<string, { label: string; desc: string }> = {
  banking:    { label: 'Banking & Finance',     desc: 'AI will ask you investment banking, private equity, and capital markets questions with instant scored feedback.' },
  consulting: { label: 'Management Consulting', desc: 'Sharpen case interviews, behavioural rounds, and structured problem-solving for MBB and Big 4.' },
  software:   { label: 'Software Engineering',  desc: 'Nail technical and behavioural rounds at top tech companies — system design, coding, and culture-fit.' },
  product:    { label: 'Product Management',    desc: 'Practice product sense, metrics, and case questions for PM roles at growth-stage and FAANG companies.' },
  marketing:  { label: 'Marketing & Growth',    desc: 'Hone campaign strategy, analytics, and growth thinking for marketing and growth roles.' },
  data:       { label: 'Data & Analytics',      desc: 'Prepare for data science, analytics engineering, and ML engineer interviews with technical and case depth.' },
};

const QTYPES: Record<string, string> = {
  behavioral: 'Behavioural',
  technical:  'Technical',
  case:       'Case Study',
};

const CONF_CIRC = 2 * Math.PI * 18; // circumference for r=18 ≈ 113.1

// ── Component ─────────────────────────────────────────────────
export default function Home() {
  // Session config
  const [interviewType, setInterviewType] = useState('banking');
  const [questionType,  setQuestionType]  = useState('behavioral');
  const [difficulty,    setDifficulty]    = useState('easy');

  // Session state machine
  const [sessionActive,    setSessionActive]    = useState(false);
  const [isThinking,       setIsThinking]       = useState(false);
  const [isSpeaking,       setIsSpeaking]       = useState(false);
  const [isListening,      setIsListening]      = useState(false);
  const [isRecording,      setIsRecording]      = useState(false);

  // UI state
  const [sidebarOpen,      setSidebarOpen]      = useState(true);
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdownNum,     setCountdownNum]     = useState(5);
  const [cdOffset,         setCdOffset]         = useState(0);

  // Session data
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [currentQuestion,  setCurrentQuestion]  = useState('Loading question…');
  const [questionNumber,   setQuestionNumber]   = useState(1);
  const [questionsDone,    setQuestionsDone]    = useState(0);
  const [scores,           setScores]           = useState<number[]>([]);
  const [sessionTime,      setSessionTime]      = useState('0s');

  // Metrics
  const [fillerCount,  setFillerCount]  = useState(0);
  const [fillerList,   setFillerList]   = useState<string[]>([]);
  const [wpm,          setWpm]          = useState<number | null>(null);
  const [confidence,   setConfidence]   = useState<number | null>(null);

  // Text input
  const [chatInput, setChatInput] = useState('');

  // Refs
  const chatMsgsRef      = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const sessionTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef     = useRef<number>(0);

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (chatMsgsRef.current) {
      chatMsgsRef.current.scrollTop = chatMsgsRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const addMessage = useCallback((role: Role, text: string, isFeedback = false) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now(), isFeedback }]);
  }, []);

  // Derived display values
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  const confCircOffset = confidence !== null ? CONF_CIRC * (1 - confidence / 100) : CONF_CIRC;
  const confStroke     = confidence === null ? 'var(--success)'
    : confidence >= 75 ? 'var(--success)'
    : confidence >= 50 ? 'var(--warn)'
    : 'var(--danger)';

  const fillerClass = `metric-val${fillerCount >= 5 ? ' danger' : fillerCount >= 3 ? ' warn' : ''}`;
  const pacePct     = wpm !== null ? Math.min(100, (wpm / 200) * 100) : 0;
  const paceFillBg  = wpm === null          ? 'var(--success)'
    : wpm >= 110 && wpm <= 150 ? 'var(--success)'
    : wpm < 80                 ? 'var(--warn)'
    :                            'var(--danger)';
  const paceClass   = `metric-val${wpm !== null ? (wpm < 80 ? ' warn' : wpm > 170 ? ' danger' : '') : ''}`;
  const micDisabled = isThinking || isSpeaking;

  return <div>TODO: render JSX in next task</div>;
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```powershell
cd speakflow && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: add page.tsx types, constants, and state skeleton

Define the full React state shape for the interview session: config (type/
difficulty), state machine (thinking/speaking/listening), session data
(messages/scores), and live metrics (fillers/WPM/confidence). Constants mirror
the metadata and question-type maps from the static prototype."
```

---

### Task 4: Build page.tsx — full JSX render (sidebar + main + chat)

**Files:**
- Modify: `speakflow/app/page.tsx`

- [ ] **Step 1: Add session lifecycle and interaction handlers to `Home()`**

Inside the `Home()` function, before the `return` statement, add all the handler functions. Replace the existing `return <div>TODO...</div>` and the lines before it starting from `// Refs` downward with the following complete version of the bottom half of `Home()`:

```tsx
  // Refs
  const chatMsgsRef      = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const sessionTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef     = useRef<number>(0);

  useEffect(() => {
    if (chatMsgsRef.current) {
      chatMsgsRef.current.scrollTop = chatMsgsRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const addMessage = useCallback((role: Role, text: string, isFeedback = false) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now(), isFeedback }]);
  }, []);

  // ── Countdown ────────────────────────────────────────────────
  const startCountdown = () => {
    if (sessionActive || countdownVisible) return;
    const C = 2 * Math.PI * 68; // circumference for r=68
    setCountdownVisible(true);
    setCountdownNum(5);
    setCdOffset(0);
    let n = 5;
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        setCountdownNum(n);
        setCdOffset(C * ((5 - n) / 5));
      } else {
        setCountdownNum(0);
        setCdOffset(C);
        clearInterval(tick);
        setTimeout(() => { setCountdownVisible(false); beginSession(); }, 700);
      }
    }, 1000);
  };

  // ── Session lifecycle ────────────────────────────────────────
  const beginSession = useCallback(() => {
    setSessionActive(true);
    setMessages([]);
    setQuestionNumber(1);
    setQuestionsDone(0);
    setScores([]);
    setFillerCount(0);
    setFillerList([]);
    setWpm(null);
    setConfidence(null);
    startedAtRef.current = Date.now();

    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    sessionTimerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const m = Math.floor(sec / 60), ss = sec % 60;
      setSessionTime(m > 0 ? `${m}m ${ss}s` : `${ss}s`);
    }, 1000);

    addMessage('interviewer',
      `Hi! I'm your SpeakFlow AI coach. Let's begin your ${META[interviewType].label} interview — ` +
      `${QTYPES[questionType].toLowerCase()} style, ${difficulty} difficulty.\n\n` +
      `I'll ask you one question at a time. Listen, then click the mic to record your answer.`
    );

    // Mock question — Plan 4 replaces this with POST /api/interviewer
    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);
      const mockQ = 'Tell me about a time you had to work under significant pressure. How did you handle it?';
      setCurrentQuestion(mockQ);
      addMessage('interviewer', `**Question 1:** ${mockQ}`);
    }, 1200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewType, questionType, difficulty, addMessage]);

  const endSession = useCallback(() => {
    setSessionActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsThinking(false);
    setIsRecording(false);
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
  }, []);

  // ── Text input ───────────────────────────────────────────────
  const sendMsg = useCallback(async () => {
    const txt = chatInput.trim();
    if (!txt || isThinking) return;
    setChatInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    addMessage('user', txt);
    setIsThinking(true);
    // Mock response — Plan 4 replaces with POST /api/interviewer
    setTimeout(() => {
      setIsThinking(false);
      addMessage('interviewer', 'Good point. To strengthen it, try leading with the specific outcome before explaining your approach.');
    }, 1200);
  }, [chatInput, isThinking, addMessage]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  };

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 110) + 'px';
  };

  // ── Derived display values ───────────────────────────────────
  const avgScore       = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const confCircOffset = confidence !== null ? CONF_CIRC * (1 - confidence / 100) : CONF_CIRC;
  const confStroke     = confidence === null ? 'var(--success)' : confidence >= 75 ? 'var(--success)' : confidence >= 50 ? 'var(--warn)' : 'var(--danger)';
  const fillerClass    = `metric-val${fillerCount >= 5 ? ' danger' : fillerCount >= 3 ? ' warn' : ''}`;
  const pacePct        = wpm !== null ? Math.min(100, (wpm / 200) * 100) : 0;
  const paceFillBg     = wpm === null ? 'var(--success)' : (wpm >= 110 && wpm <= 150) ? 'var(--success)' : wpm < 80 ? 'var(--warn)' : 'var(--danger)';
  const paceClass      = `metric-val${wpm !== null ? (wpm < 80 ? ' warn' : wpm > 170 ? ' danger' : '') : ''}`;
  const micDisabled    = isThinking || isSpeaking;
```

- [ ] **Step 2: Replace `return <div>TODO...</div>` with the complete JSX**

Replace the `return <div>TODO: render JSX in next task</div>;` line with the following:

```tsx
  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="topbar">
        <div className="logo-mark">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="3" width="6" height="8" rx="3" fill="white"/>
            <path d="M2 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            <line x1="8" y1="14" x2="8" y2="15.5" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="logo-wordmark">Speak<em>Flow</em></span>
      </header>

      <div className={`shell${sidebarOpen ? '' : ' sidebar-off'}`}>

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside className="sidebar">
          <div className="sidebar-head">
            <button
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(o => !o)}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <polyline points="8,1 3,6 8,11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="sidebar-scroll">
            <div className="sidebar-section">
              <div className="sidebar-label">Interview Type</div>
              <div className="type-list">
                {Object.entries(META).map(([key, val]) => (
                  <button
                    key={key}
                    className={`type-btn${interviewType === key ? ' active' : ''}`}
                    onClick={() => { if (!sessionActive) setInterviewType(key); }}
                  >
                    {val.label}
                    <div className="type-dot"/>
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-label">Question Type</div>
              <div className="type-list">
                {Object.entries(QTYPES).map(([key, label]) => (
                  <button
                    key={key}
                    className={`type-btn${questionType === key ? ' active' : ''}`}
                    onClick={() => { if (!sessionActive) setQuestionType(key); }}
                  >
                    {label}
                    <div className="type-dot"/>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="diff-label">Difficulty</div>
            <div className="diff-pills">
              {['easy', 'mid', 'hard'].map(d => (
                <button
                  key={d}
                  className={`pill${difficulty === d ? ' active' : ''}`}
                  onClick={() => { if (!sessionActive) setDifficulty(d); }}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────── */}
        <main className="main">
          {/* Idle state */}
          <div className="idle-wrap" style={{ display: sessionActive ? 'none' : undefined }}>
            <div className="status-badge ready">
              <div className="status-dot"/><span>Ready to practise</span>
            </div>
            <div className="session-card">
              <div className="type-badge">
                <span>{META[interviewType].label}</span>
              </div>
              <div className="session-title">Start your practice session</div>
              <div className="session-desc">{META[interviewType].desc}</div>
              <button className="start-btn" onClick={startCountdown} disabled={countdownVisible}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <polygon points="3,1 13,7 3,13" fill="white"/>
                </svg>
                Start Interview
              </button>
              <div className="session-stats">
                <div className="stat">
                  <div className="stat-val">{questionsDone}</div>
                  <div className="stat-lbl">Questions done</div>
                </div>
                <div className="stat">
                  <div className="stat-val">{avgScore !== null ? String(avgScore) : '—'}</div>
                  <div className="stat-lbl">Avg score</div>
                </div>
                <div className="stat">
                  <div className="stat-val">{sessionTime}</div>
                  <div className="stat-lbl">Session time</div>
                </div>
              </div>
            </div>
          </div>

          {/* Active state */}
          <div className={`active-wrap${sessionActive ? ' show' : ''}`}>
            <div className="status-badge live">
              <div className="status-dot"/><span>Session live</span>
            </div>
            <div className="q-card">
              <div className="q-meta">
                Question {questionNumber}&nbsp;·&nbsp;{QTYPES[questionType]}
              </div>
              <div className="q-text">{currentQuestion}</div>
            </div>
            <div className={`waveform${isListening ? '' : ' idle'}`}>
              {[...Array(7)].map((_, i) => <div key={i} className="w-bar"/>)}
            </div>
            <button
              className={`mic-btn${isRecording ? ' recording' : ''}`}
              onClick={() => {/* Plan 4 wires SpeechRecognition here */}}
              disabled={micDisabled}
              aria-label="Toggle recording"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="6" y="1" width="8" height="11" rx="4" stroke="white" strokeWidth="1.8"/>
                <path d="M3 10c0 3.87 3.13 7 7 7s7-3.13 7-7" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                <line x1="10" y1="17" x2="10" y2="19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="mic-hint">
              {micDisabled
                ? (isSpeaking ? 'Listen to the question…' : 'Thinking…')
                : isRecording
                  ? 'Recording… click again when done'
                  : 'Click mic to start recording your answer'}
            </div>
            <button className="end-btn" onClick={endSession}>End session</button>
          </div>

          {/* Countdown overlay */}
          <div className={`countdown-overlay${countdownVisible ? ' show' : ''}`}>
            <div className="cd-label">Interview starts in</div>
            <div className="cd-ring-wrap">
              <svg className="cd-ring" viewBox="0 0 148 148">
                <circle className="track" cx="74" cy="74" r="68"/>
                <circle
                  className="progress"
                  cx="74" cy="74" r="68"
                  style={{ strokeDashoffset: cdOffset }}
                />
              </svg>
              <div className="cd-num">{countdownNum === 0 ? 'Go' : countdownNum}</div>
            </div>
            <div className="cd-sub">Breathe. You&apos;ve got this.</div>
          </div>
        </main>

        {/* ── CHAT PANEL ──────────────────────────────────────── */}
        <section className="chat-panel">
          <div className="chat-head">
            <div>
              <div className="chat-head-title"><div className="ai-dot"/>AI Interview Coach</div>
              <div className="chat-head-sub">Powered by SpeakFlow AI</div>
            </div>
            <button className="icon-btn" title="Clear chat" onClick={() => setMessages([])}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Live metrics bar */}
          <div className={`metrics-bar${sessionActive ? ' show' : ''}`}>
            <div className="metrics-head">
              <span className="metrics-head-label">Live Analysis</span>
              <div className={`metrics-live-pip${isListening ? '' : ' idle'}`}/>
            </div>
            <div className="metrics-row">
              <div className="metric-cell">
                <div className={fillerClass}>{fillerCount}</div>
                <div className="metric-lbl">Fillers</div>
                <div className="metric-sub">
                  {fillerList.length > 0 ? fillerList.slice(-3).join(', ') : '—'}
                </div>
              </div>
              <div className="metric-cell">
                <div className={paceClass}>{wpm !== null ? String(wpm) : '—'}</div>
                <div className="metric-lbl">WPM</div>
                <div className="pace-bar-wrap">
                  <div className="pace-bar-fill" style={{ width: `${pacePct}%`, background: paceFillBg }}/>
                  <div className="pace-bar-dot" style={{ left: `${pacePct}%` }}/>
                </div>
              </div>
              <div className="metric-cell">
                <div className="conf-ring-wrap">
                  <svg className="conf-ring" viewBox="0 0 40 40">
                    <circle className="cr-track" cx="20" cy="20" r="18"/>
                    <circle
                      className="cr-fill"
                      cx="20" cy="20" r="18"
                      style={{ strokeDashoffset: confCircOffset, stroke: confStroke }}
                    />
                  </svg>
                  <div className="conf-ring-val">
                    {confidence !== null ? `${confidence}%` : '—'}
                  </div>
                </div>
                <div className="metric-lbl">Confidence</div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-msgs" ref={chatMsgsRef}>
            {messages.length === 0 && !isThinking ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="3" width="6" height="8" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M2 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                    <line x1="8" y1="14" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="chat-empty-txt">Start a session to practise with your AI interview coach</div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg}/>
                ))}
                {isThinking && <TypingIndicator/>}
              </>
            )}
          </div>

          {/* Text input */}
          <div className="chat-input-row">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Type your answer or ask for coaching tips…"
              rows={1}
              value={chatInput}
              onChange={e => { setChatInput(e.target.value); resizeTextarea(e.target); }}
              onKeyDown={handleKey}
            />
            <button
              className="send-btn"
              onClick={sendMsg}
              disabled={!chatInput.trim() || isThinking}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M12 6.5L1 1l2.5 5.5L1 12z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isAI = msg.role === 'interviewer';
  const html = msg.text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
  return (
    <div className={`msg ${isAI ? 'ai' : 'user'}`}>
      <div className="msg-from">{isAI ? 'SpeakFlow AI' : 'You'}</div>
      <div
        className={`msg-bubble${msg.isFeedback ? ' feedback-card' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg ai">
      <div className="msg-from">SpeakFlow AI</div>
      <div className="typing-wrap">
        <div className="t-dot"/><div className="t-dot"/><div className="t-dot"/>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors. If you see `React.useCallback` dependency warnings from eslint, those are warnings not errors — ignore for now.

- [ ] **Step 4: Visual verification in browser**

With `npm run dev` running, open `http://localhost:3000` and verify:

1. **Idle state**: sidebar visible, session card shows "Banking & Finance", Start Interview button present
2. **Sidebar toggle**: clicking the chevron button collapses/expands sidebar
3. **Type selection**: clicking "Software Engineering" updates the session card title and description
4. **Difficulty pills**: clicking Mid/Hard highlights the correct pill
5. **Countdown**: clicking "Start Interview" shows the countdown overlay, counts 5→4→3→2→1→Go, then transitions to active state
6. **Active state**: waveform idle bars visible, mic button appears, "Session live" badge shows, chat shows the greeting message and mock question
7. **End session**: clicking "End session" returns to idle state
8. **Chat messages**: messages appear in correct bubbles (interviewer = left, user = right)
9. **Typing indicator**: visible while `isThinking=true` (briefly after session start)
10. **Text input**: typing and pressing Enter sends a message, shows typing indicator, then shows mock AI response
11. **Metrics bar**: appears when session is active, disappears when idle

- [ ] **Step 5: Commit**

```powershell
git add speakflow/app/page.tsx
git commit -m "feat: build full UI shell with React state and mock responses

Port the complete static prototype HTML to React, replacing vanilla JS state
with useState/useRef/useCallback hooks. All UI states are working: idle card,
5-second countdown, active interview panel, chat bubbles, metrics bar. Mock
API responses replace real ones — Plan 4 (Integration) wires the real APIs."
```
