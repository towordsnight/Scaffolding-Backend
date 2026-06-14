// Constraint #4: answer comparison is numeric + relative tolerance, never string
// match, enforced in the application layer. Single grader shared by full-problem
// submit, the onboarding diagnostic, and scaffold numeric steps.

export function isAnswerCorrect(
  submitted: number,
  groundTruth: number,
  tolerance: number,
): boolean {
  if (!Number.isFinite(submitted)) return false;

  // Relative tolerance is undefined at zero — require an exact zero.
  if (groundTruth === 0) return submitted === 0;

  // abs() on the denominator: negative ground truths (reversed currents,
  // negative node voltages) must not flip the inequality.
  return Math.abs(submitted - groundTruth) / Math.abs(groundTruth) <= tolerance;
}
