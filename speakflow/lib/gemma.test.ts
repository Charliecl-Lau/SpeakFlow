import { buildInterviewerPrompt, buildEvaluationPrompt, parseEvaluationResponse } from './gemma';

describe('buildInterviewerPrompt', () => {
  test('includes interview type and difficulty in system prompt', () => {
    const prompt = buildInterviewerPrompt('banking', 'behavioral', 'hard');
    expect(prompt).toContain('banking');
    expect(prompt).toContain('behavioral');
    expect(prompt).toContain('hard');
  });

  test('includes instruction to ask one question at a time', () => {
    const prompt = buildInterviewerPrompt('software', 'technical', 'mid');
    expect(prompt.toLowerCase()).toContain('one question at a time');
  });
});

describe('buildEvaluationPrompt', () => {
  test('includes all required JSON field names', () => {
    const prompt = buildEvaluationPrompt();
    const requiredFields = [
      'overallScore', 'clarityScore', 'confidenceScore',
      'structureScore', 'specificityScore', 'fillerWords',
      'strengths', 'weaknesses', 'improvedAnswer', 'nextPracticeAdvice'
    ];
    for (const field of requiredFields) {
      expect(prompt).toContain(field);
    }
  });

  test('instructs to return JSON only', () => {
    const prompt = buildEvaluationPrompt();
    expect(prompt.toLowerCase()).toContain('json');
    expect(prompt.toLowerCase()).toContain('no markdown');
  });
});

describe('parseEvaluationResponse', () => {
  test('parses clean JSON', () => {
    const raw = JSON.stringify({ overallScore: 85, clarityScore: 80 });
    const result = parseEvaluationResponse(raw);
    expect(result).toEqual({ overallScore: 85, clarityScore: 80 });
  });

  test('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"overallScore": 85}\n```';
    const result = parseEvaluationResponse(raw);
    expect(result).toEqual({ overallScore: 85 });
  });

  test('throws on invalid JSON', () => {
    expect(() => parseEvaluationResponse('not json')).toThrow();
  });
});
