# SpeakFlow Plan 1: Project Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Next.js 14 App Router project with TypeScript, install all dependencies, and confirm the dev server starts.

**Architecture:** Single Next.js 14 project at `speakflow/` subdirectory of the repo root. No Tailwind — CSS comes from extracted `index.html` styles. TypeScript strict mode.

**Tech Stack:** Next.js 14, TypeScript, `@google/generative-ai`, Node 18+

**Dependency on other plans:** None. Run this first. Plans 2 and 3 can start in parallel once this is done.

---

### Task 1: Initialize Next.js project

**Files:**
- Create: `speakflow/` (Next.js project root)
- Create: `speakflow/package.json` (generated)
- Create: `speakflow/tsconfig.json` (generated)

- [ ] **Step 1: Run create-next-app in the repo root**

Open a terminal at `C:\Users\yeekw\Documents\SpeakFlow` and run:

```powershell
npx create-next-app@14 speakflow --typescript --no-tailwind --no-eslint --src-dir=false --import-alias="@/*" --app --yes
```

Expected output: `✓ Installation complete` (or equivalent). The `speakflow/` directory should now exist.

- [ ] **Step 2: Verify the generated structure**

```powershell
ls speakflow
```

Expected: you see `app/`, `lib/` (may not exist yet), `package.json`, `tsconfig.json`, `next.config.js` (or `next.config.mjs`).

- [ ] **Step 3: Commit the scaffold**

```powershell
cd speakflow
git add -A
git commit -m "chore: scaffold Next.js 14 App Router project

Initialize the speakflow/ Next.js 14 project with TypeScript and App Router.
No Tailwind — custom CSS will be extracted from the static prototype. This
scaffold is the foundation that Plans 2 (UI) and 3 (APIs) build on in parallel."
```

---

### Task 2: Install dependencies and configure environment

**Files:**
- Modify: `speakflow/package.json`
- Create: `speakflow/.env.local`
- Create: `speakflow/.env.local.example`

- [ ] **Step 1: Install the Google AI and other runtime dependencies**

From `speakflow/` directory:

```powershell
npm install @google/generative-ai
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Create `.env.local` with your real keys**

Create `speakflow/.env.local`:

```
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id_here
```

Replace the placeholder values with your real keys from:
- Google AI Studio: https://aistudio.google.com/app/apikey
- ElevenLabs: https://elevenlabs.io/app/settings/api-keys (voice ID from Voices tab)

- [ ] **Step 3: Create `.env.local.example` (safe to commit)**

Create `speakflow/.env.local.example`:

```
GOOGLE_AI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

- [ ] **Step 4: Ensure `.env.local` is gitignored**

Check `speakflow/.gitignore` already contains `.env.local` (create-next-app adds this). If missing, append it:

```powershell
# verify it's there
Select-String -Pattern "\.env\.local" speakflow/.gitignore
```

Expected: at least one match. If no match, add `.env.local` to `.gitignore`.

- [ ] **Step 5: Commit**

```powershell
git add speakflow/.env.local.example speakflow/package.json speakflow/package-lock.json
git commit -m "chore: install @google/generative-ai and add env template

Add the Google Generative AI SDK needed for Gemma inference. Add .env.local.example
as a committed template so future contributors know which keys are required.
The actual .env.local with real keys is gitignored."
```

---

### Task 3: Verify dev server starts

**Files:** None created/modified.

- [ ] **Step 1: Start the dev server**

```powershell
cd speakflow
npm run dev
```

Expected output includes: `▲ Next.js 14.x.x` and `Local: http://localhost:3000`

- [ ] **Step 2: Verify the default page loads**

Open a browser to `http://localhost:3000`. You should see the default Next.js welcome page (with the Next.js logo). This confirms the scaffold is working.

- [ ] **Step 3: Stop the dev server**

Press `Ctrl+C` in the terminal.

- [ ] **Step 4: Confirm TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no output (zero errors). If there are errors, they are from the generated scaffold — fix them before continuing.

---

**Scaffold complete. Plans 2 (UI Shell) and 3 (Backend APIs) can now start in parallel.**
