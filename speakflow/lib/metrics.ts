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
