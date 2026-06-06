'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Role, Message } from '@/lib/types';
import { fetchInterviewerReply, fetchTts, fetchEvaluation } from '@/lib/api';
import { useAudioRecorder } from '@/lib/useAudioRecorder';
import { countFillers, computeWpm, computeConfidence } from '@/lib/metrics';

// ── Constants ──────────────────────────────────────────────────
const TOTAL_ROUNDS = 2;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Post-question 5-second countdown
  const [cdVisible,  setCdVisible]  = useState(false);
  const [cdNum,      setCdNum]      = useState(5);
  const [cdOffset,   setCdOffset]   = useState(0);

  // 2-minute answer timer (-1 = not active)
  const [answerTimeLeft, setAnswerTimeLeft] = useState(-1);

  // Session data
  const [messages,         setMessages]         = useState<Message[]>([]);
  const [questionsDone,    setQuestionsDone]    = useState(0);
  const [scores,           setScores]           = useState<number[]>([]);
  const [sessionTime,      setSessionTime]      = useState('0s');

  // Metrics
  const [fillerCount,  setFillerCount]  = useState(0);
  const [fillerList,   setFillerList]   = useState<string[]>([]);
  const [wpm,          setWpm]          = useState<number | null>(null);
  const [confidence,   setConfidence]   = useState<number | null>(null);

  // Round tracking
  const [roundsCompleted, setRoundsCompleted] = useState(0);

  // Refs
  const chatMsgsRef         = useRef<HTMLDivElement>(null);
  const sessionTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef        = useRef<number>(0);
  const messagesRef         = useRef<Message[]>([]);
  const roundsCompletedRef  = useRef(0);
  const handleEndSessionRef = useRef<() => Promise<void>>(async () => {});
  const startAnswerCdRef    = useRef<() => void>(() => {});
  const audioRef            = useRef<HTMLAudioElement | null>(null);

  // Open sidebar by default on desktop
  useEffect(() => {
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // Keep refs in sync with state
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { roundsCompletedRef.current = roundsCompleted; }, [roundsCompleted]);

  useEffect(() => {
    if (chatMsgsRef.current) {
      chatMsgsRef.current.scrollTop = chatMsgsRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const addMessage = useCallback((role: Role, text: string, isFeedback = false) => {
    setMessages(prev => [...prev, { role, text, timestamp: Date.now(), isFeedback }]);
  }, []);

  // ── Answer timer (2 minutes) ─────────────────────────────────
  const startAnswerTimer = useCallback(() => {
    setAnswerTimeLeft(120);
    if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    answerTimerRef.current = setInterval(() => {
      setAnswerTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(answerTimerRef.current!);
          answerTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Voice loop ───────────────────────────────────────────────
  const handleTurn = useCallback(async () => {
    setIsThinking(true);

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
    addMessage('interviewer', question);

    // 2. Speak via ElevenLabs → fallback to speechSynthesis
    setIsSpeaking(true);
    let blobUrl: string | null = null;
    try {
      blobUrl = await fetchTts(question);
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(blobUrl!);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('audio playback failed'));
        audio.play().catch((err) => reject(err));
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
    // Trigger 5-second post-question countdown → auto-starts recording
    startAnswerCdRef.current();
  }, [interviewType, questionType, difficulty, addMessage]);

  const handleSpeechResult = useCallback((transcript: string, startedAt: number) => {
    // Clear 2-min timer when user finishes speaking
    if (answerTimerRef.current) {
      clearInterval(answerTimerRef.current);
      answerTimerRef.current = null;
    }
    setAnswerTimeLeft(-1);

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

    const userMsg: Message = { role: 'user', text: transcript, timestamp: Date.now() };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages(prev => [...prev, userMsg]);

    const newRounds = roundsCompletedRef.current + 1;
    roundsCompletedRef.current = newRounds;
    setRoundsCompleted(newRounds);
    if (newRounds >= TOTAL_ROUNDS) {
      handleEndSessionRef.current();
      return;
    }
    handleTurn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleTurn]);

  const handleSpeechError = useCallback((error: string) => {
    setIsRecording(false);
    setIsListening(false);
    if (error !== 'no-speech') {
      addMessage('interviewer', `Voice input error: ${error}. Please try again.`);
    }
  }, [addMessage]);

  const { start: startRecognition, stop: stopRecognition, isSupported: isSpeechSupported } =
    useAudioRecorder({ onResult: handleSpeechResult, onError: handleSpeechError });

  // ── Post-question 5-second countdown ────────────────────────
  const startAnswerCountdown = useCallback(() => {
    const C = 2 * Math.PI * 68;
    setCdVisible(true);
    setCdNum(5);
    setCdOffset(0);
    let n = 5;
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        setCdNum(n);
        setCdOffset(C * ((5 - n) / 5));
      } else {
        setCdNum(0);
        setCdOffset(C);
        clearInterval(tick);
        setTimeout(() => {
          setCdVisible(false);
          setIsRecording(true);
          setIsListening(true);
          startRecognition();
          startAnswerTimer();
        }, 700);
      }
    }, 1000);
  }, [startRecognition, startAnswerTimer]);

  // Keep startAnswerCdRef in sync
  useEffect(() => { startAnswerCdRef.current = startAnswerCountdown; }, [startAnswerCountdown]);

  // Auto-stop recording when 2-min timer expires
  useEffect(() => {
    if (answerTimeLeft !== 0) return;
    stopRecognition();
    setIsRecording(false);
    setIsListening(false);
    setAnswerTimeLeft(-1);
  }, [answerTimeLeft, stopRecognition]);

  // ── Session lifecycle ────────────────────────────────────────
  const beginSession = useCallback(() => {
    setSessionActive(true);
    setMessages([]);
    setQuestionsDone(0);
    setScores([]);
    setFillerCount(0);
    setFillerList([]);
    setWpm(null);
    setConfidence(null);
    setRoundsCompleted(0);
    roundsCompletedRef.current = 0;
    startedAtRef.current = Date.now();

    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    sessionTimerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const m = Math.floor(sec / 60), ss = sec % 60;
      setSessionTime(m > 0 ? `${m}m ${ss}s` : `${ss}s`);
    }, 1000);

    handleTurn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewType, questionType, difficulty, addMessage, handleTurn]);

  const endSession = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    stopRecognition();
    if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    setAnswerTimeLeft(-1);
    setSessionActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsThinking(false);
    setIsRecording(false);
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
  }, [stopRecognition]);

  // ── Evaluate & feedback ──────────────────────────────────────
  const handleEndSession = useCallback(async () => {
    stopRecognition();
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    setAnswerTimeLeft(-1);
    setIsThinking(true);
    setIsListening(false);
    setIsRecording(false);
    setIsSpeaking(false);

    const transcriptMsgs = messagesRef.current.filter(m => !m.isFeedback);

    try {
      const fb = await fetchEvaluation(transcriptMsgs);

      const metricsLine = [
        fillerCount > 0 ? `Fillers: ${fillerCount}` : null,
        wpm !== null ? `WPM: ${wpm}` : null,
        confidence !== null ? `Confidence: ${confidence}%` : null,
      ].filter(Boolean).join(' · ');

      const feedbackText = [
        `**Overall Score: ${fb.overallScore}/100**`,
        metricsLine ? `*${metricsLine}*` : null,
        `Clarity: ${fb.clarityScore} · Confidence: ${fb.confidenceScore} · Structure: ${fb.structureScore} · Specificity: ${fb.specificityScore}`,
        '',
        '**Strengths**',
        fb.strengths.map(s => `• ${s}`).join('\n'),
        '',
        '**Improvements**',
        fb.weaknesses.map(w => `• ${w}`).join('\n'),
        '',
        '**Improved Answer**',
        fb.improvedAnswer,
        '',
        '**Next Practice Focus**',
        fb.nextPracticeAdvice,
        ...(fb.fillerWords.length > 0
          ? ['', `**Filler words detected:** ${fb.fillerWords.join(', ')}`]
          : []),
      ].filter(line => line !== null).join('\n');

      setIsThinking(false);
      addMessage('interviewer', feedbackText, true);
    } catch {
      setIsThinking(false);
      addMessage('interviewer', 'Feedback unavailable. Try ending the session again.');
    }

    endSession();
  }, [stopRecognition, endSession, addMessage]);

  // Keep handleEndSessionRef in sync so handleSpeechResult can call it without a forward-reference dep
  useEffect(() => { handleEndSessionRef.current = handleEndSession; }, [handleEndSession]);

  // ── Derived display values ───────────────────────────────────
  const avgScore       = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const confCircOffset = confidence !== null ? CONF_CIRC * (1 - confidence / 100) : CONF_CIRC;
  const confStroke     = confidence === null ? 'var(--success)' : confidence >= 75 ? 'var(--success)' : confidence >= 50 ? 'var(--warn)' : 'var(--danger)';
  const fillerClass    = `metric-val${fillerCount >= 5 ? ' danger' : fillerCount >= 3 ? ' warn' : ''}`;
  const pacePct        = wpm !== null ? Math.min(100, (wpm / 200) * 100) : 0;
  const paceFillBg     = wpm === null ? 'var(--success)' : (wpm >= 110 && wpm <= 150) ? 'var(--success)' : wpm < 80 ? 'var(--warn)' : 'var(--danger)';
  const paceClass      = `metric-val${wpm !== null ? (wpm < 80 ? ' warn' : wpm > 170 ? ' danger' : '') : ''}`;
  const micDisabled    = isThinking || isSpeaking;
  const micUnsupported = typeof window !== 'undefined' && !isSpeechSupported();

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="topbar">
        <button
          className="topbar-toggle"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Open settings"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="2" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="2" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="logo-mark">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="3" width="6" height="8" rx="3" fill="white"/>
            <path d="M2 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            <line x1="8" y1="14" x2="8" y2="15.5" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="logo-wordmark">Speak<em>Flow</em></span>
        {sessionActive && (
          <button className="topbar-end-btn" onClick={handleEndSession} disabled={isThinking}>
            End session
          </button>
        )}
      </header>

      {/* Sidebar backdrop (mobile only) */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className={`shell${sidebarOpen ? '' : ' sidebar-off'}`}>

        {/* ── SIDEBAR ─────────────────────────────────────────── */}
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sidebar-head">
            <span className="sidebar-head-title">Settings</span>
          </div>
          <div className="sidebar-scroll">
            <div className="sidebar-section">
              <div className="sidebar-label">Interview Type</div>
              <div className="type-list">
                {Object.entries(META).map(([key, val]) => (
                  <button
                    key={key}
                    className={`type-btn${interviewType === key ? ' active' : ''}`}
                    onClick={() => {
                      if (!sessionActive) {
                        setInterviewType(key);
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }
                    }}
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
                    onClick={() => {
                      if (!sessionActive) {
                        setQuestionType(key);
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }
                    }}
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
                  onClick={() => {
                    if (!sessionActive) {
                      setDifficulty(d);
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }
                  }}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── CHAT PANEL (expanded, full remaining width) ──────── */}
        <section className="chat-panel">

          {/* Header */}
          <div className="chat-head">
            <div>
              <div className="chat-head-title"><div className="ai-dot"/>AI Interview Coach</div>
              <div className="chat-head-sub">Powered by SpeakFlow AI</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isRecording && answerTimeLeft >= 0 && (
                <div className={`answer-timer${answerTimeLeft <= 30 ? ' danger' : answerTimeLeft <= 60 ? ' warn' : ''}`}>
                  <div className="timer-dot"/>
                  {String(Math.floor(answerTimeLeft / 60)).padStart(2, '0')}:{String(answerTimeLeft % 60).padStart(2, '0')}
                </div>
              )}
            </div>
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

          {/* Messages (session) or Idle card (pre-session) */}
          {sessionActive ? (
            <div className="chat-msgs" ref={chatMsgsRef}>
              {messages.length === 0 && !isThinking ? null : (
                <>
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg}/>
                  ))}
                  {isThinking && <TypingIndicator/>}
                </>
              )}
            </div>
          ) : (
            <div className="chat-idle">
              <div className="status-badge ready">
                <div className="status-dot"/><span>Ready to practise</span>
              </div>
              <div className="session-card">
                <div className="type-badge">
                  <span>{META[interviewType].label}</span>
                </div>
                <div className="session-title">Start your practice session</div>
                <div className="session-desc">{META[interviewType].desc}</div>
                <button className="start-btn" onClick={beginSession}>
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
          )}

          {/* Voice input area — only when session active */}
          {sessionActive && (
            <div className="voice-input-area">
              <div className={`waveform${isListening ? '' : ' idle'}`}>
                {[...Array(7)].map((_, i) => <div key={i} className="w-bar"/>)}
              </div>
              <button
                className={`mic-btn${isRecording ? ' recording' : ''}`}
                onClick={() => {
                  if (!isSpeechSupported()) {
                    addMessage('interviewer', 'Voice input not supported in this browser.');
                    return;
                  }
                  if (isRecording) {
                    if (answerTimerRef.current) { clearInterval(answerTimerRef.current); answerTimerRef.current = null; }
                    setAnswerTimeLeft(-1);
                    stopRecognition();
                    setIsRecording(false);
                    setIsListening(false);
                  } else {
                    setIsRecording(true);
                    setIsListening(true);
                    startRecognition();
                    startAnswerTimer();
                  }
                }}
                disabled={micDisabled || micUnsupported}
                aria-label="Toggle recording"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="6" y="1" width="8" height="11" rx="4" stroke="white" strokeWidth="1.8"/>
                  <path d="M3 10c0 3.87 3.13 7 7 7s7-3.13 7-7" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                  <line x1="10" y1="17" x2="10" y2="19.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
              <div className="mic-hint">
                {micUnsupported
                  ? 'Voice input not supported in this browser.'
                  : micDisabled
                    ? (isSpeaking ? 'Listen to the question…' : 'Thinking…')
                    : isRecording
                      ? 'Recording… click again when done'
                      : 'Click mic to start recording your answer'}
              </div>
            </div>
          )}

          {/* Post-question countdown overlay */}
          <div className={`countdown-overlay${cdVisible ? ' show' : ''}`}>
            <div className="cd-label">Get ready to answer</div>
            <div className="cd-ring-wrap">
              <svg className="cd-ring" viewBox="0 0 148 148">
                <circle className="track" cx="74" cy="74" r="68"/>
                <circle
                  className="progress"
                  cx="74" cy="74" r="68"
                  style={{ strokeDashoffset: cdOffset }}
                />
              </svg>
              <div className="cd-num">{cdNum === 0 ? 'Go!' : cdNum}</div>
            </div>
            <div className="cd-sub">Your mic will activate automatically.</div>
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
