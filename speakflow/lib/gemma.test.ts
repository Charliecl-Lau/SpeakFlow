import {
  buildInterviewerPrompt,
  buildEvaluationPrompt,
  parseEvaluationResponse,
  validateEvaluationFeedback,
} from './gemma';

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

  test('strips leading whitespace and plain markdown code fences before parsing', () => {
    const raw = '  \n```\n{"overallScore": 85}\n```';
    const result = parseEvaluationResponse(raw);
    expect(result).toEqual({ overallScore: 85 });
  });

  test('throws on invalid JSON', () => {
    expect(() => parseEvaluationResponse('not json')).toThrow();
  });
});

describe('validateEvaluationFeedback', () => {
  const validFeedback = {
    overallScore: 85,
    clarityScore: 80,
    confidenceScore: 75,
    structureScore: 70,
    specificityScore: 65,
    fillerWords: ['um'],
    strengths: ['clear example'],
    weaknesses: ['missed result detail'],
    improvedAnswer: 'A stronger answer would quantify the result.',
    nextPracticeAdvice: 'Practice adding measurable outcomes.',
  };

  test('returns valid feedback payloads', () => {
    expect(validateEvaluationFeedback(validFeedback)).toEqual(validFeedback);
  });

  test('throws when required fields are missing', () => {
    expect(() => validateEvaluationFeedback({ overallScore: 85 })).toThrow();
  });

  test('throws when score fields are out of range', () => {
    expect(() => validateEvaluationFeedback({ ...validFeedback, overallScore: 101 })).toThrow();
  });
});
