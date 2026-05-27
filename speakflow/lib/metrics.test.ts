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
