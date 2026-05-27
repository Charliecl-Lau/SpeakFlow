'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Role, Message } from '@/lib/types';
import { fetchInterviewerReply, fetchTts, fetchEvaluation } from '@/lib/api';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import { countFillers, computeWpm, computeConfidence } from '@/lib/metrics';

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
  // messagesRef mirrors messages state — used by handleTurn to avoid stale closures
  const messagesRef      = useRef<Message[]>([]);
  const audioRef         = useRef<HTMLAudioElement | null>(null);

  // Keep messagesRef in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  // ── Voice loop ───────────────────────────────────────────────
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

    const qNum = currentMsgs.filter(m => m.role === 'interviewer').length + 1;
    setQuestionNumber(qNum);
    addMessage('interviewer', `**Question ${qNum}:** ${question}`);

    // 2. Speak via ElevenLabs → fallback to speechSynthesis
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
  }, [interviewType, questionType, difficulty, addMessage]);

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

    handleTurn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewType, questionType, difficulty, addMessage, handleTurn]);

  const endSession = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
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
