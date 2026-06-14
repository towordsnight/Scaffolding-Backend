import { isAnswerCorrect } from './answer-checker';

describe('isAnswerCorrect', () => {
  it('accepts an answer within relative tolerance', () => {
    expect(isAnswerCorrect(10.05, 10, 0.01)).toBe(true);
  });

  it('rejects an answer outside relative tolerance', () => {
    expect(isAnswerCorrect(10.2, 10, 0.01)).toBe(false);
  });

  // The pre-fix formula divided by a signed ground truth, so any negative
  // ground truth graded every submission as correct.
  it('rejects wrong answers against a negative ground truth', () => {
    expect(isAnswerCorrect(42, -5, 0.01)).toBe(false);
    expect(isAnswerCorrect(5, -5, 0.01)).toBe(false);
  });

  it('accepts in-tolerance answers against a negative ground truth', () => {
    expect(isAnswerCorrect(-5.04, -5, 0.01)).toBe(true);
  });

  it('requires exact zero when ground truth is zero', () => {
    expect(isAnswerCorrect(0, 0, 0.01)).toBe(true);
    expect(isAnswerCorrect(0.001, 0, 0.01)).toBe(false);
  });

  it('rejects non-numeric submissions', () => {
    expect(isAnswerCorrect(Number('abc'), 10, 0.01)).toBe(false);
    expect(isAnswerCorrect(Infinity, 10, 0.01)).toBe(false);
  });
});
