export type Role = 'interviewer' | 'user';

export type Message = {
  role:        Role;
  text:        string;
  timestamp:   number;
  isFeedback?: boolean;
};

export type EvaluationResult = {
  overallScore:       number;
  clarityScore:       number;
  confidenceScore:    number;
  structureScore:     number;
  specificityScore:   number;
  fillerWords:        string[];
  strengths:          string[];
  weaknesses:         string[];
  improvedAnswer:     string;
  nextPracticeAdvice: string;
};
