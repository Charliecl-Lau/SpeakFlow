# SpeakFlow — AI Interview Practice Coach

SpeakFlow is a browser-based interview coach that simulates real interview conversations using AI. You speak your answers aloud, receive instant transcription, and get detailed feedback on your communication after each session.

---

## Features

- Real-time voice recording via browser MediaRecorder API
- AI interviewer powered by Gemma 4 (Google AI Studio) — adapts follow-up questions to your answers
- Six interview types: Banking & Finance, Management Consulting, Software Engineering, Product Management, Marketing & Growth, Data & Analytics
- Three difficulty levels: Easy, Mid, Hard
- Question types: Behavioural, Technical, Case Study
- Question bank seeded from the [Tech Interview Handbook](https://github.com/yangshun/tech-interview-handbook) for contextually relevant questions
- Live metrics during recording: filler word count, words-per-minute, confidence ring
- Text input fallback if microphone is unavailable
- Interviewer questions spoken aloud via Gemini TTS (ElevenLabs optional)
- Hard 2-round session limit — evaluation triggers automatically after your second answer
- Post-session evaluation: overall score, sub-scores, strengths, weaknesses, improved sample answer, next practice advice

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI | React 18, TypeScript |
| AI (interview + evaluation) | Gemma 4 via `@google/genai` |
| AI (TTS) | Gemini 2.5 Flash Preview TTS via `@google/genai` |
| Transcription | Google Cloud Speech-to-Text v1 REST API |
| Audio recording | Browser MediaRecorder API |

---

## Prerequisites

- **Node.js 18 or later** (required for native `fetch` and the Next.js runtime)
- **Google AI Studio API key** — for Gemma 4 (interviewer + evaluator) and Gemini TTS
  → Create one at [aistudio.google.com](https://aistudio.google.com)
- **Google Cloud API key** with the **Cloud Speech-to-Text API** enabled — for voice transcription
  → Create one in [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials, then enable the "Cloud Speech-to-Text API" on your project

---

## Setup

1. **Clone the repository and enter the project directory:**

   ```bash
   git clone <repo-url>
   cd speakflow
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create your environment file:**

   ```bash
   cp .env.local.example .env.local
   ```

4. **Fill in your API keys in `.env.local`:**

   | Variable | Required | Description |
   |---|---|---|
   | `GOOGLE_AI_API_KEY` | Yes | Google AI Studio key — Gemma 4 (interviewer + evaluator) and Gemini TTS |
   | `GOOGLE_CLOUD_STT_API_KEY` | Yes | Google Cloud API key — Speech-to-Text v1 transcription |
   | `ELEVENLABS_API_KEY` | No | ElevenLabs key for higher-quality TTS (falls back to Gemini TTS if absent) |
   | `ELEVENLABS_VOICE_ID` | No | ElevenLabs voice ID |

---

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Use

1. **Choose your interview type** from the left sidebar (e.g. Software Engineering).
2. **Select a question type** (Behavioural / Technical / Case Study) and **difficulty**.
3. Click **Start Interview** and wait for the 5-second countdown.
4. Listen to the interviewer's question (spoken aloud via TTS).
5. Click the **microphone button** and speak your answer, then click again to stop.
6. Your answer is transcribed and live metrics (fillers, WPM, confidence) update in the analysis bar.
7. The AI responds with a follow-up or a new question for round 2.
8. After your **second answer**, evaluation runs automatically.
9. Review your **Overall Score**, sub-scores, strengths, improvements, and a sample improved answer in the chat panel.

> **Tip:** You can also type answers in the text box if your microphone is unavailable.

---

## License

MIT
