import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, onboarding } from '../lib/api';
import type { PublicProblem } from '../lib/api';

export function DiagnosticRoute() {
  const navigate = useNavigate();
  const [problems, setProblems]     = useState<PublicProblem[] | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [step, setStep]             = useState(0);               // 0-2 = active problem, 3 = done
  const [answers, setAnswers]       = useState<string[]>(['', '', '']);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stepStartRef                = useRef<number>(Date.now());

  useEffect(() => {
    onboarding.getDiagnosticProblems()
      .then(r => setProblems(r.problems))
      .catch(err => {
        if (err instanceof ApiError && err.status === 409) {
          navigate('/dashboard');
        } else {
          setLoadError(err instanceof ApiError ? err.message : 'Failed to load problems');
        }
      });
  }, [navigate]);

  function handleNext() {
    setStep(s => s + 1);
    stepStartRef.current = Date.now();
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!problems) return;
    const timeForLast = Math.round((Date.now() - stepStartRef.current) / 1000);

    // Collect time per step: use 30s as a fallback for earlier steps (already advanced past them)
    const timings = problems.map((_, i) => i === step ? timeForLast : 30);

    const payload = problems.map((p, i) => ({
      problem_id:       p.id,
      submitted_answer: parseFloat(answers[i]) || 0,
      time_spent_s:     timings[i],
    }));

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onboarding.submitDiagnostic(payload);
      navigate('/dashboard');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] font-['IBM_Plex_Sans',sans-serif]">
        <div className="rounded-xl border border-red-200 bg-white p-10 shadow-sm">
          <p className="text-sm text-red-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!problems) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] font-['IBM_Plex_Sans',sans-serif]">
        <p className="text-sm text-[#99A1AF]">Loading problems…</p>
      </div>
    );
  }

  const problem = problems[step];
  const answer  = answers[step] ?? '';
  const isLast  = step === problems.length - 1;
  const canAdvance = answer.trim() !== '' && !isNaN(parseFloat(answer));

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-12 font-['IBM_Plex_Sans',sans-serif]">
      <div className="mx-auto w-full max-w-2xl px-6">

        {/* Progress */}
        <div className="mb-6 flex items-center gap-3">
          {problems.map((_, i) => (
            <div
              key={i}
              className={[
                'h-2 flex-1 rounded-full transition-colors',
                i < step  ? 'bg-[#00C950]' : '',
                i === step ? 'bg-[#615FFF]' : '',
                i > step  ? 'bg-[#E5E7EB]' : '',
              ].join(' ')}
            />
          ))}
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-10 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]">
            Problem {step + 1} of {problems.length} · {problem.topic.toUpperCase()} · {problem.difficulty}
          </p>

          <h1 className="mt-4 text-2xl font-bold text-black">Diagnostic Assessment</h1>
          <p className="mt-2 text-sm text-[#5D5D5D]">
            Work through the problem below. Show what you know — this helps us calibrate your starting point.
          </p>

          <div className="mt-8 rounded-lg border border-[#E5E7EB] bg-[#F9FBFC] p-6">
            <p className="text-base leading-7 text-[#1E2939] whitespace-pre-wrap">{problem.problem_text}</p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <label htmlFor="answer" className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]">
              Your Answer
            </label>
            <input
              id="answer"
              type="number"
              step="any"
              value={answer}
              onChange={e => {
                const next = [...answers];
                next[step] = e.target.value;
                setAnswers(next);
              }}
              placeholder="Enter a numeric answer"
              className="h-[50px] rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
            />
          </div>

          {submitError && (
            <p role="alert" className="mt-4 text-sm text-red-600">{submitError}</p>
          )}

          <div className="mt-10 flex justify-end">
            {isLast ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canAdvance || submitting}
                className="h-[50px] rounded-[10px] bg-[#00A63E] px-8 text-[15px] font-bold text-white shadow-sm transition hover:bg-[#008236] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Finish Diagnostic'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance}
                className="h-[50px] rounded-[10px] bg-[#615FFF] px-8 text-[15px] font-bold text-white shadow-sm transition hover:bg-[#5350e6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next Problem
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#99A1AF]">
          © 2026 Survey Platform. All responses are confidential.
        </p>
      </div>
    </div>
  );
}
