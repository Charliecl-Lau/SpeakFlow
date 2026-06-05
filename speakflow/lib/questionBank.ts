const HANDBOOK_BASE =
  'https://raw.githubusercontent.com/yangshun/tech-interview-handbook/main/contents';

const HANDBOOK_FILES = {
  behavioral: `${HANDBOOK_BASE}/behavioral-interview-questions.md`,
  systemDesign: `${HANDBOOK_BASE}/system-design.md`,
  coding: `${HANDBOOK_BASE}/coding-interview-techniques.md`,
} as const;

// Which handbook files feed each SpeakFlow interview type
const TYPE_TO_SOURCES: Record<string, Array<keyof typeof HANDBOOK_FILES>> = {
  software:   ['behavioral', 'coding'],
  product:    ['behavioral', 'systemDesign'],
  data:       ['behavioral', 'coding'],
  banking:    ['behavioral'],
  consulting: ['behavioral'],
  marketing:  ['behavioral'],
};

// Stable per-type offsets so different types get different question slices
const TYPE_OFFSET: Record<string, number> = {
  software: 0, product: 5, data: 10, banking: 15, consulting: 20, marketing: 25,
};

const QUESTIONS_PER_TYPE = 4;
const MAX_PER_FILE = 50;

type ParsedFiles = Partial<Record<keyof typeof HANDBOOK_FILES, string[]>>;
type QuestionBank = Map<string, string[]>;

let initPromise: Promise<QuestionBank> | null = null;

async function fetchMarkdown(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch {
    console.warn(`[questionBank] Failed to fetch ${url}`);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export function parseQuestionsFromMarkdown(markdown: string): string[] {
  const questions: string[] = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    // Match bullet or numbered list items ending with ?
    const match = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+\?)$/);
    if (match) {
      const q = match[1].replace(/[*_`]/g, '').trim();
      if (q.length > 10) questions.push(q);
    }
    if (questions.length >= MAX_PER_FILE) break;
  }
  return questions;
}

async function initQuestionBank(): Promise<QuestionBank> {
  const [behavioralMd, systemDesignMd, codingMd] = await Promise.all([
    fetchMarkdown(HANDBOOK_FILES.behavioral),
    fetchMarkdown(HANDBOOK_FILES.systemDesign),
    fetchMarkdown(HANDBOOK_FILES.coding),
  ]);

  const parsed: ParsedFiles = {
    behavioral:  parseQuestionsFromMarkdown(behavioralMd),
    systemDesign: parseQuestionsFromMarkdown(systemDesignMd),
    coding:      parseQuestionsFromMarkdown(codingMd),
  };

  const bank: QuestionBank = new Map();
  for (const [type, sources] of Object.entries(TYPE_TO_SOURCES)) {
    const pool: string[] = [];
    for (const src of sources) {
      pool.push(...(parsed[src] ?? []));
    }
    const offset = TYPE_OFFSET[type] ?? 0;
    const selected = pool.slice(offset, offset + QUESTIONS_PER_TYPE);
    // Fallback: wrap around if offset exceeded pool length
    if (selected.length < QUESTIONS_PER_TYPE && pool.length > 0) {
      selected.push(...pool.slice(0, QUESTIONS_PER_TYPE - selected.length));
    }
    bank.set(type, selected);
  }
  return bank;
}

export async function getQuestionsForType(interviewType: string): Promise<string[]> {
  if (!initPromise) {
    initPromise = initQuestionBank().catch((err) => {
      console.warn('[questionBank] Init failed:', err);
      initPromise = null;
      return new Map();
    });
  }
  const bank = await initPromise;
  return bank.get(interviewType) ?? [];
}
