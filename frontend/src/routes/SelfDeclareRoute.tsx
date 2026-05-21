import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, onboarding, type CourseLevel } from '../lib/api';

type Likert = 'never' | 'rarely' | 'sometimes' | 'often' | 'very_often';
const LIKERT_OPTIONS: Array<{ value: Likert; label: string }> = [
  { value: 'never',      label: 'never' },
  { value: 'rarely',     label: 'rarely' },
  { value: 'sometimes',  label: 'sometimes' },
  { value: 'often',      label: 'often' },
  { value: 'very_often', label: 'very often' },
];

// `reverse: true` means the statement is positively-framed (high Likert = LOW stress).
interface Question { id: string; text: string; reverse?: boolean }
interface Section { title: string; questions: Question[] }

const SECTIONS: Section[] = [
  {
    title: 'Attention',
    questions: [
      { id: 's1q1', text: 'I felt overwhelmed by work responsibilities' },
      { id: 's1q2', text: 'I had time for personal hobbies and interests', reverse: true },
      { id: 's1q3', text: 'I experienced work-related stress' },
      { id: 's1q4', text: 'I maintained healthy boundaries between work and personal life', reverse: true },
      { id: 's1q5', text: 'I felt burned out from work' },
    ],
  },
  {
    title: 'Health and Wellness',
    questions: [
      { id: 's2q1', text: 'I exercised or engaged in physical activity', reverse: true },
      { id: 's2q2', text: 'I got adequate sleep (7-9 hours)', reverse: true },
      { id: 's2q3', text: 'I ate balanced and nutritious meals', reverse: true },
      { id: 's2q4', text: 'I practiced stress management techniques', reverse: true },
      { id: 's2q5', text: 'I felt energized and well-rested', reverse: true },
    ],
  },
  {
    title: 'Social Connections',
    questions: [
      { id: 's3q1', text: 'I spent quality time with family and friends', reverse: true },
      { id: 's3q2', text: 'I felt supported by my social network', reverse: true },
      { id: 's3q3', text: 'I participated in social activities or events', reverse: true },
      { id: 's3q4', text: 'I felt lonely or isolated' },
      { id: 's3q5', text: 'I made new meaningful connections', reverse: true },
    ],
  },
];

const TOTAL_QUESTIONS = SECTIONS.reduce((n, s) => n + s.questions.length, 0);
const LIKERT_SCORE: Record<Likert, number> = { never: 0, rarely: 1, sometimes: 2, often: 3, very_often: 4 };

function deriveStressBaseline(answers: Record<string, Likert>): 0 | 1 | 2 {
  // Average a 0-4 stress score across Section 1's items (reverse-scored where positive).
  const items = SECTIONS[0].questions;
  let sum = 0;
  let count = 0;
  for (const q of items) {
    const a = answers[q.id];
    if (!a) continue;
    const raw = LIKERT_SCORE[a];
    const score = q.reverse ? 4 - raw : raw;
    sum += score;
    count += 1;
  }
  const avg = count === 0 ? 0 : sum / count;
  if (avg >= 2.7) return 2;
  if (avg >= 1.3) return 1;
  return 0;
}

export function SelfDeclareRoute() {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [courseLevel, setCourseLevel] = useState<CourseLevel>('intro');
  const [adhdFlag, setAdhdFlag] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Likert>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAnswered = useMemo(() => Object.keys(answers).length, [answers]);

  function setAnswer(id: string, value: Likert) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const stressBaseline = deriveStressBaseline(answers);
      await onboarding.declaration({
        adhd_flag: adhdFlag,
        stress_baseline: stressBaseline,
        course_level: courseLevel,
      });
      navigate('/onboarding/diagnostic');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-12 font-['IBM_Plex_Sans',sans-serif]">
      <div className="mx-auto w-full max-w-3xl px-6">
        {step === 0 ? (
          <BasicsStep
            courseLevel={courseLevel}
            adhdFlag={adhdFlag}
            onCourseLevel={setCourseLevel}
            onAdhd={setAdhdFlag}
            onNext={() => setStep(1)}
          />
        ) : (
          <SurveyStep
            section={SECTIONS[step - 1]}
            sectionIndex={step - 1}
            answers={answers}
            totalAnswered={totalAnswered}
            onAnswer={setAnswer}
            onPrev={() => setStep((step - 1) as 0 | 1 | 2)}
            onNext={() => setStep((step + 1) as 2 | 3)}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
            isLast={step === 3}
          />
        )}

        <p className="mt-6 text-center text-xs text-[#99A1AF]">
          © 2026 Survey Platform. All responses are confidential.
        </p>
      </div>
    </div>
  );
}

interface BasicsStepProps {
  courseLevel: CourseLevel;
  adhdFlag: boolean;
  onCourseLevel: (v: CourseLevel) => void;
  onAdhd: (v: boolean) => void;
  onNext: () => void;
}

function BasicsStep({ courseLevel, adhdFlag, onCourseLevel, onAdhd, onNext }: BasicsStepProps) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-10 shadow-sm">
      <h1 className="text-2xl font-bold text-black">A few quick questions</h1>
      <p className="mt-2 text-sm text-[#5D5D5D]">
        Help us tailor the experience to your background.
      </p>

      <div className="mt-8 space-y-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="course-level" className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]">
            Course Level
          </label>
          <select
            id="course-level"
            value={courseLevel}
            onChange={(e) => onCourseLevel(e.target.value as CourseLevel)}
            className="h-[50px] rounded-[10px] border border-[#E5E7EB] bg-[#F9FBFC] px-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
          >
            <option value="intro">Intro</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={adhdFlag}
            onChange={(e) => onAdhd(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-[#E5E7EB] text-[#615FFF] focus:ring-[#615FFF]"
          />
          <span className="text-sm text-black">
            <span className="font-medium">I have ADHD or a similar attention profile.</span>
            <span className="block text-[#5D5D5D]">
              We'll adjust pacing and chunk lengths to suit your needs.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="h-[50px] rounded-[10px] bg-[#615FFF] px-8 text-[15px] font-bold text-white shadow-sm transition hover:bg-[#5350e6]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

interface SurveyStepProps {
  section: Section;
  sectionIndex: number;
  answers: Record<string, Likert>;
  totalAnswered: number;
  onAnswer: (id: string, value: Likert) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  isLast: boolean;
}

function SurveyStep({
  section,
  sectionIndex,
  answers,
  totalAnswered,
  onAnswer,
  onPrev,
  onNext,
  onSubmit,
  submitting,
  error,
  isLast,
}: SurveyStepProps) {
  const sectionAnswered = section.questions.filter((q) => answers[q.id]).length;
  const sectionComplete = sectionAnswered === section.questions.length;

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <header className="border-b border-[#E5E7EB] px-10 py-6">
        <h1 className="text-2xl font-bold text-black">Frequency Assessment Survey</h1>
        <p className="mt-1 text-sm text-[#5D5D5D]">
          Help us understand your experiences over the past 6 months
        </p>
      </header>

      <div className="bg-[#F5F4FF] px-10 py-5">
        <p className="text-sm font-semibold text-black">Section {sectionIndex + 1} of {SECTIONS.length}</p>
        <p className="mt-1 text-xs text-[#5D5D5D]">
          Overall Progress: {totalAnswered} of {TOTAL_QUESTIONS} questions answered
        </p>
        <div className="mt-3 flex gap-2">
          {SECTIONS.map((_, i) => {
            const answeredInSection = SECTIONS[i].questions.filter((q) => answers[q.id]).length;
            const ratio = answeredInSection / SECTIONS[i].questions.length;
            return (
              <div key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div
                  className="h-full bg-[#615FFF] transition-all"
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-10 py-6">
        <h2 className="text-lg font-bold text-black">{section.title}</h2>
        <p className="mt-1 text-sm text-[#5D5D5D]">
          Please read each statement carefully and select the frequency that best describes your experience.
        </p>
        <p className="mt-4 text-sm font-medium text-black">During the past 6 months,</p>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-xs text-[#5D5D5D]">
              <th className="w-1/2"></th>
              {LIKERT_OPTIONS.map((opt) => (
                <th key={opt.value} className="px-2 py-2 text-center font-normal">{opt.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.questions.map((q) => (
              <tr key={q.id} className="border-t border-[#E5E7EB]">
                <td className="py-4 pr-4 text-black">{q.text}</td>
                {LIKERT_OPTIONS.map((opt) => (
                  <td key={opt.value} className="px-2 py-4 text-center">
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.value}
                      checked={answers[q.id] === opt.value}
                      onChange={() => onAnswer(q.id, opt.value)}
                      className="h-4 w-4 accent-[#615FFF]"
                      aria-label={`${q.text} — ${opt.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="px-10 pb-2 text-sm text-red-600">{error}</p>
      )}

      <footer className="flex items-center justify-between border-t border-[#E5E7EB] bg-[#FAFAFB] px-10 py-4">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-md px-4 py-2 text-sm font-medium text-[#5D5D5D] hover:bg-[#E5E7EB]"
        >
          Previous
        </button>
        <p className="text-xs text-[#5D5D5D]">
          {sectionAnswered} of {section.questions.length} questions answered in this section
        </p>
        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!sectionComplete || submitting}
            className="rounded-[10px] bg-[#00C16A] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#00a85a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit Survey'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!sectionComplete}
            className="rounded-[10px] bg-[#615FFF] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#5350e6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next Section
          </button>
        )}
      </footer>
    </div>
  );
}
