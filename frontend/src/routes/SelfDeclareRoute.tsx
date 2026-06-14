import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, onboarding, type CourseLevel } from '../lib/api';

// Attention section uses a frequency scale; the other four use an agreement scale.
type ScaleType = 'frequency' | 'agreement';

const FREQUENCY_OPTIONS = [
  { value: 'f1', label: 'never',      numeric: 1 },
  { value: 'f2', label: 'rarely',     numeric: 2 },
  { value: 'f3', label: 'sometimes',  numeric: 3 },
  { value: 'f4', label: 'often',      numeric: 4 },
  { value: 'f5', label: 'very often', numeric: 5 },
] as const;

const AGREEMENT_OPTIONS = [
  { value: 'a1', label: 'Strongly Disagree', numeric: 1 },
  { value: 'a2', label: 'Disagree',          numeric: 2 },
  { value: 'a3', label: 'Somewhat Agree',    numeric: 3 },
  { value: 'a4', label: 'Agree',             numeric: 4 },
  { value: 'a5', label: 'Strongly Agree',    numeric: 5 },
] as const;

type FrequencyValue = typeof FREQUENCY_OPTIONS[number]['value'];
type AgreementValue = typeof AGREEMENT_OPTIONS[number]['value'];
type AnswerValue = FrequencyValue | AgreementValue;

interface Question { id: string; text: string }
interface Section { key: string; title: string; scaleType: ScaleType; questions: Question[] }

const SECTIONS: Section[] = [
  {
    key: 'attention',
    title: 'Attention',
    scaleType: 'frequency',
    questions: [
      { id: 'b1_1', text: 'I have difficulty keeping my attention to simple or repetitive coursework.' },
      { id: 'b1_2', text: 'While doing the coursework, I have to repeat steps because I haven\'t paid attention.' },
      { id: 'b1_3', text: 'I do coursework without paying close attention.' },
      { id: 'b1_4', text: 'I find myself paying attention and thinking about something else at the same time.' },
      { id: 'b1_5', text: 'During lectures or other class activities, my mind drifts away from what is happening.' },
    ],
  },
  {
    key: 'autonomy',
    title: 'Autonomy',
    scaleType: 'agreement',
    questions: [
      { id: 'au_1', text: 'I feel that the decisions I make about how to study and solve problems reflect how I want to learn.' },
      { id: 'au_2', text: 'In my coursework, I do learning activities that really interest me.' },
      { id: 'au_3', text: 'I feel that I have choice and freedom in how I approach and complete my homework, projects, and labs.' },
      { id: 'au_4', text: 'I feel that the choices I make about my learning work well for me.' },
    ],
  },
  {
    key: 'competence',
    title: 'Competence',
    scaleType: 'agreement',
    questions: [
      { id: 'co_1', text: 'I feel that I can do well on homework, projects, labs, and other learning activities.' },
      { id: 'co_2', text: 'I feel capable of completing the assignments required in my coursework.' },
      { id: 'co_3', text: 'I feel competent to achieve the learning objectives in my coursework.' },
      { id: 'co_4', text: 'I feel that I can successfully solve challenging problems.' },
    ],
  },
  {
    key: 'self_regulation',
    title: 'Self-Regulation',
    scaleType: 'agreement',
    questions: [
      { id: 'sr_1', text: 'I consider different ways to solve a problem when I get stuck on homework, projects, or labs.' },
      { id: 'sr_2', text: 'I usually make a plan for how I will complete projects and other assignments.' },
      { id: 'sr_3', text: 'I stick to a plan when it is helping me complete my homework, projects, and other activities.' },
      { id: 'sr_4', text: 'When my approach to an assignment is not helping me make progress, I adjust it to stay on track.' },
    ],
  },
  {
    key: 'self_efficacy',
    title: 'Self-Efficacy',
    scaleType: 'agreement',
    questions: [
      { id: 'se_1', text: 'I believe I can understand new and difficult concepts taught in my courses.' },
      { id: 'se_2', text: 'I am confident that I can master the skills needed for my coursework.' },
      { id: 'se_3', text: 'I am certain that I can successfully complete homework, projects, labs, and other learning activities.' },
      { id: 'se_4', text: 'I am confident that I can apply course concepts in hands-on labs, projects, or design tasks.' },
    ],
  },
];

const TOTAL_QUESTIONS = SECTIONS.reduce((n, s) => n + s.questions.length, 0);

function numericFor(sectionKey: string, value: AnswerValue): number {
  if (sectionKey === 'attention') {
    return FREQUENCY_OPTIONS.find(o => o.value === value)?.numeric ?? 0;
  }
  return AGREEMENT_OPTIONS.find(o => o.value === value)?.numeric ?? 0;
}

function deriveConstructScores(answers: Record<string, AnswerValue>): {
  attention_score: number;
  autonomy_score: number;
  competence_score: number;
  self_regulation_score: number;
  self_efficacy_score: number;
} {
  const avg = (section: Section): number => {
    const vals = section.questions
      .map(q => answers[q.id])
      .filter(Boolean)
      .map(v => numericFor(section.key, v));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const byKey = Object.fromEntries(SECTIONS.map(s => [s.key, avg(s)]));

  return {
    attention_score:       byKey['attention'],
    autonomy_score:        byKey['autonomy'],
    competence_score:      byKey['competence'],
    self_regulation_score: byKey['self_regulation'],
    self_efficacy_score:   byKey['self_efficacy'],
  };
}

export function SelfDeclareRoute() {
  const navigate = useNavigate();
  // step 0 = basics, steps 1–5 = survey sections
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [courseLevel, setCourseLevel] = useState<CourseLevel>('intro');
  const [adhdFlag, setAdhdFlag] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAnswered = useMemo(() => Object.keys(answers).length, [answers]);

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const scores = deriveConstructScores(answers);
      await onboarding.declaration({
        adhd_flag: adhdFlag,
        course_level: courseLevel,
        ...scores,
      });
      navigate('/onboarding/diagnostic');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {step === 0 ? (
        <div className="min-h-screen bg-[#F8F9FA] py-12 font-['IBM_Plex_Sans',sans-serif]">
          <div className="mx-auto w-full max-w-3xl px-6">
            <BasicsStep
              courseLevel={courseLevel}
              adhdFlag={adhdFlag}
              onCourseLevel={setCourseLevel}
              onAdhd={setAdhdFlag}
              onNext={() => setStep(1)}
            />

            <p className="mt-6 text-center text-xs text-[#99A1AF]">
              © 2026 Survey Platform. All responses are confidential.
            </p>
          </div>
        </div>
      ) : (
        <SurveyStep
          section={SECTIONS[step - 1]}
          sectionIndex={step - 1}
          answers={answers}
          totalAnswered={totalAnswered}
          onAnswer={setAnswer}
          onPrev={() => setStep((step - 1) as 0 | 1 | 2 | 3 | 4)}
          onNext={() => setStep((step + 1) as 2 | 3 | 4 | 5)}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={error}
          isLast={step === 5}
        />
      )}
    </>
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
  answers: Record<string, AnswerValue>;
  totalAnswered: number;
  onAnswer: (id: string, value: AnswerValue) => void;
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
  const options = section.scaleType === 'frequency' ? FREQUENCY_OPTIONS : AGREEMENT_OPTIONS;
  const sectionAnswered = section.questions.filter((q) => answers[q.id]).length;
  const sectionComplete = sectionAnswered === section.questions.length;

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-[#EFF6FF] to-[#E0E7FF] font-['IBM_Plex_Sans',sans-serif] text-[#101828]">
      <header className="border-b border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.10)]">
        <div className="mx-auto w-full max-w-[1043px] px-6 py-6">
          <h1 className="text-[30px] leading-9 font-medium tracking-[0.01em]">
            Frequency Assessment Survey
          </h1>
          <p className="mt-2 text-base leading-6 tracking-[-0.02em] text-[#4A5565]">
            Help us understand your experiences over the past 6 months
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1043px] flex-1 flex-col gap-8 px-6 py-12">
        <section className="rounded-[10px] bg-white p-8 shadow-[0_10px_15px_rgba(0,0,0,0.10),0_4px_6px_rgba(0,0,0,0.10)]">
          <h2 className="text-xl leading-7 font-medium tracking-[-0.02em] text-[#1E2939]">
            Section {sectionIndex + 1} of {SECTIONS.length}
          </h2>
          <p className="mt-1 text-sm leading-5 tracking-[-0.01em] text-[#6A7282]">
            Overall Progress: {totalAnswered} of {TOTAL_QUESTIONS} questions answered
          </p>
          <div className="mt-6 grid grid-cols-5 gap-2">
            {SECTIONS.map((s, i) => (
              <div
                key={s.key}
                className={[
                  'h-2 rounded-full',
                  i < sectionIndex && 'bg-[#00C950]',
                  i === sectionIndex && 'bg-[#4F39F6]',
                  i > sectionIndex && 'bg-[#E5E7EB]',
                ].filter(Boolean).join(' ')}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[10px] bg-white p-8 shadow-[0_10px_15px_rgba(0,0,0,0.10),0_4px_6px_rgba(0,0,0,0.10)]">
          <h2 className="text-2xl leading-8 font-medium tracking-[0.003em]">
            {section.title}
          </h2>
          <p className="mt-2 text-base leading-6 tracking-[-0.02em] text-[#4A5565]">
            Please read each statement carefully and select the option that best describes your experience.
          </p>
          {section.scaleType === 'frequency' && (
            <p className="mt-8 text-lg leading-7 tracking-[-0.02em] text-[#364153]">
              During the past 6 months,
            </p>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[715px] border-collapse border border-[#D1D5DC] text-base text-[#364153]">
              <thead>
                <tr>
                  <th className="w-[200px] border border-[#D1D5DC] px-4 py-4 text-left font-normal" />
                  {options.map((opt) => (
                    <th
                      key={opt.value}
                      className="border border-[#D1D5DC] px-4 py-4 text-center font-normal"
                    >
                      {opt.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.questions.map((q) => (
                  <tr key={q.id}>
                    <td className="w-[200px] border border-[#D1D5DC] px-4 py-4 leading-6 tracking-[-0.02em]">
                      {q.text}
                    </td>
                    {options.map((opt) => (
                      <td key={opt.value} className="border border-[#D1D5DC] px-4 py-4 text-center">
                        <input
                          type="radio"
                          name={q.id}
                          value={opt.value}
                          checked={answers[q.id] === opt.value}
                          onChange={() => onAnswer(q.id, opt.value as AnswerValue)}
                          className="size-6 cursor-pointer accent-[#364153]"
                          aria-label={`${q.text} - ${opt.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[10px] bg-white p-8 shadow-[0_10px_15px_rgba(0,0,0,0.10),0_4px_6px_rgba(0,0,0,0.10)]">
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onPrev}
              disabled={sectionIndex === 0}
              className="h-[50px] rounded-lg border border-[#D1D5DC] px-6 text-base font-medium text-[#364153] transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <p className="text-center text-sm leading-5 tracking-[-0.01em] text-[#6A7282]">
              {sectionAnswered} of {section.questions.length} questions answered in this section
            </p>
            {isLast ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!sectionComplete || submitting}
                className="h-12 rounded-lg bg-[#00A63E] px-6 text-base font-medium text-white transition hover:bg-[#008236] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Survey'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={!sectionComplete}
                className="h-12 rounded-lg bg-[#4F39F6] px-6 text-base font-medium text-white transition hover:bg-[#432DD7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next Section
              </button>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E5E7EB] bg-white py-6">
        <p className="text-center text-sm leading-5 tracking-[-0.01em] text-[#6A7282]">
          © 2026 Survey Platform. All responses are confidential.
        </p>
      </footer>
    </div>
  );
}
