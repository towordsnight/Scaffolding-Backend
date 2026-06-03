import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  problems,
  sessions,
  type ProblemScaffold,
  type PublicProblem,
  type ScaffoldStep,
  type StepSubmitResult,
} from '../lib/api';

const FALLBACK_OPTIONS = [
  { key: 'A', text: 'Voltage source with a series resistance' },
  { key: 'B', text: 'Current source with a series resistance' },
  { key: 'C', text: 'Current source with a parallel resistance' },
  { key: 'D', text: 'Voltage source with a parallel resistance' },
];

export function ProblemRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const setName: string = (location.state as { setName?: string } | null)?.setName ?? 'Homework Set';

  const [problem, setProblem] = useState<PublicProblem | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scaffold, setScaffold] = useState<ProblemScaffold | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, StepSubmitResult>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    if (!id) {
      setError('Problem id is missing.');
      setLoading(false);
      return;
    }

    const problemId = id;
    let active = true;

    async function loadProblem() {
      setLoading(true);
      setError(null);
      try {
        const [problemResult, sessionResult] = await Promise.all([
          problems.get(problemId),
          sessions.create({ problem_id: problemId }),
        ]);
        if (!active) return;

        setProblem(problemResult);
        setSessionId(sessionResult.session_id);

        try {
          const scaffoldResult = await problems.getScaffold(problemId, sessionResult.session_id);
          if (!active) return;
          setScaffold(scaffoldResult);
          const restoredIndex = scaffoldResult.current_step_id
            ? scaffoldResult.steps.findIndex((s) => s.id === scaffoldResult.current_step_id)
            : 0;
          setActiveIndex(restoredIndex >= 0 ? restoredIndex : 0);
        } catch {
          // scaffold unavailable — problem still renders with no steps
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Unable to load this problem.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProblem();
    return () => { active = false; };
  }, [id]);

  // Heartbeat every 30 s + end session on unmount.
  useEffect(() => {
    const interval = setInterval(() => {
      const sid = sessionIdRef.current;
      if (sid) sessions.heartbeat(sid).catch(() => {});
    }, 30_000);

    return () => {
      clearInterval(interval);
      const sid = sessionIdRef.current;
      if (sid) sessions.end(sid).catch(() => {});
    };
  }, []);

  const steps = scaffold?.steps ?? [];
  const activeStep = steps[activeIndex] ?? null;
  const activeAnswer = activeStep ? answers[activeStep.id] ?? '' : '';
  const activeResult = activeStep ? results[activeStep.id] ?? null : null;
  const completedCount = useMemo(() => Object.keys(results).length, [results]);
  const progress = steps.length === 0 ? 0 : ((activeIndex + 1) / steps.length) * 100;

  function setAnswer(stepId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
    setResults((prev) => {
      if (!(stepId in prev)) return prev;
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || !sessionId || !activeStep) return;

    const value = valueForSubmit(activeStep, activeAnswer);
    if (value === null) {
      setError('Choose or enter a response before checking this step.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await problems.submitStep(id, activeStep.id, {
        session_id: sessionId,
        submitted_value: value,
        time_spent_s: 30,
      });
      setResults((prev) => ({ ...prev, [activeStep.id]: result }));
      // Do NOT auto-advance — let the user read the feedback first, then press Next.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit this step.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete() {
    if (sessionId) {
      try { await sessions.end(sessionId); } catch { /* cleanup effect also fires on unmount */ }
    }
    navigate('/dashboard');
  }

  if (!id) {
    return (
      <ProblemShell>
        <EmptyState title="Problem not found" message="The problem URL is missing an id." />
      </ProblemShell>
    );
  }

  return (
    <ProblemShell
      title={setName}
      onBack={handleComplete}
      onComplete={handleComplete}
    >
      {loading ? (
        <EmptyState title="Loading workspace" message="Preparing the problem and scratchpad..." />
      ) : error && !problem ? (
        <EmptyState title="Unable to load problem" message={error} />
      ) : (
        <div className="flex min-h-[calc(100vh-73px)] overflow-hidden">
          <aside className="flex w-full max-w-[490px] shrink-0 flex-col border-r border-[#E1E1E1] bg-[#F8F9FA]">
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-sm font-medium tracking-[0.05em] text-[#5D5D5D] uppercase">
                  Step {steps.length === 0 ? 0 : activeIndex + 1}/{steps.length || 1}
                </p>
                <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-[#E5E7EB]">
                  <div className="h-full rounded-full bg-[#615FFF]" style={{ width: `${progress}%` }} />
                </div>
              </div>
              <button
                type="button"
                onClick={handleComplete}
                className="h-[38px] rounded-lg bg-[#615FFF] px-4 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#5350E6]"
              >
                Mark complete
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              <SidebarSection title="Problem">
                <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-3 shadow-sm">
                  <CircuitDiagram />
                </div>
                <div className="mt-3 rounded-[10px] border border-[#E5E7EB] bg-white p-3 shadow-sm">
                  <p className="text-xs font-bold tracking-[-0.02em] uppercase">
                    Goal
                    <span className="font-normal normal-case text-[#1E2939]">
                      : {problem?.problem_text || 'Find the Thevenin equivalent at terminals a, b.'}
                    </span>
                  </p>
                </div>
              </SidebarSection>

              <SidebarSection title="Step output">
                <form
                  onSubmit={handleSubmit}
                  className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
                >
                  {activeStep ? (
                    <>
                      <h2 className="text-base leading-6 font-bold text-black">
                        {displayStepPrompt(activeStep)}
                      </h2>
                      <p className="mt-3 text-sm leading-[19.5px] text-[#6A7282]">
                        {activeStep.step_type === 'mcq'
                          ? 'Choose the circuit that fulfills the requirements for this scaffold step.'
                          : 'Use the workspace, then submit your response when you are ready.'}
                      </p>

                      <StepAnswer
                        step={activeStep}
                        value={activeAnswer}
                        onChange={(next) => setAnswer(activeStep.id, next)}
                      />

                      {activeResult && (
                        <Feedback result={activeResult} />
                      )}

                      {error && (
                        <p role="alert" className="mt-3 text-sm text-red-600">
                          {error}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={submitting || valueForSubmit(activeStep, activeAnswer) === null}
                        className="mt-4 h-[50px] w-full rounded-[10px] bg-[#615FFF] text-[15px] font-bold text-white shadow-[0_4px_6px_rgba(0,0,0,0.10)] transition hover:bg-[#5350E6] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? 'Checking...' : activeResult ? 'Check Again' : 'Confirm Selection'}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-[#5D5D5D]">
                      No scaffold steps are available for this problem yet.
                    </p>
                  )}
                </form>
              </SidebarSection>
            </div>

            <div className="border-t border-[#E1E1E1] bg-[#F8F9FA] px-8 py-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                  disabled={activeIndex === 0}
                  className="h-[43px] rounded-[10px] border border-[#E1E1E1] bg-white text-sm font-semibold text-[#364153] shadow-sm transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextId = activeResult?.next_step_id;
                    if (nextId) {
                      const idx = steps.findIndex((s) => s.id === nextId);
                      if (idx >= 0) { setActiveIndex(idx); return; }
                    }
                    setActiveIndex((index) => Math.min(steps.length - 1, index + 1));
                  }}
                  disabled={steps.length === 0 || activeIndex >= steps.length - 1}
                  className="h-[43px] rounded-[10px] border border-[#E1E1E1] bg-white text-sm font-semibold text-[#364153] shadow-sm transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </aside>

          <Scratchpad completedCount={completedCount} totalCount={steps.length} />
        </div>
      )}
    </ProblemShell>
  );
}

function ProblemShell({
  children,
  title = 'Homework Set',
  onBack,
  onComplete,
}: {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  onComplete?: () => void;
}) {
  return (
    <div className="min-h-screen bg-white font-['IBM_Plex_Sans',sans-serif] text-black">
      <header className="flex h-[73px] items-center justify-between border-b border-[#E1E1E1] bg-white px-4">
        <div>
          <p className="text-[13px] leading-[19.5px] tracking-[0.025em] text-[#5D5D5D] uppercase">
            Task Workspace
          </p>
          <h1 className="text-[22px] leading-[33px] font-bold">{title}</h1>
        </div>
        <div className="flex gap-2">
          <TopButton onClick={onBack}>Back</TopButton>
          <TopButton>References</TopButton>
          <button
            type="button"
            onClick={onComplete}
            className="h-[40px] rounded-lg border border-[#615FFF] bg-white px-4 text-[15px] font-medium text-[#615FFF] transition hover:bg-[#F5F4FF]"
          >
            Open reflection
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-[#F8F9FA] px-6">
      <div className="max-w-md rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-[#5D5D5D]">{message}</p>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="size-4 rounded-full border border-[#62748E]" />
        <h2 className="text-sm font-semibold text-[#364153]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StepAnswer({
  step,
  value,
  onChange,
}: {
  step: ScaffoldStep;
  value: string;
  onChange: (value: string) => void;
}) {
  if (step.step_type === 'mcq') {
    const options = step.options && step.options.length > 0 ? step.options : FALLBACK_OPTIONS;
    return (
      <div className="mt-4 grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={[
              'min-h-[138px] rounded-lg border-2 bg-white p-3 text-left transition',
              value === option.key
                ? 'border-[#615FFF] shadow-[0_0_0_3px_rgba(97,95,255,0.12)]'
                : 'border-[#D1D5DC] hover:border-[#99A1AF]',
            ].join(' ')}
          >
            <span
              className={[
                'flex size-[13px] items-center justify-center rounded-full border',
                value === option.key ? 'border-[#615FFF]' : 'border-[#99A1AF]',
              ].join(' ')}
            >
              {value === option.key && <span className="size-[7px] rounded-full bg-[#615FFF]" />}
            </span>
            <CircuitOption index={index} label={option.text} />
          </button>
        ))}
      </div>
    );
  }

  if (step.step_type === 'numeric') {
    return (
      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]">Numeric answer</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 h-[50px] w-full rounded-[10px] border border-[#D1D5DC] bg-white px-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
          placeholder="Enter your answer"
        />
      </label>
    );
  }

  return (
    <label className="mt-4 block">
      <span className="text-xs font-bold uppercase tracking-[0.05em] text-[#99A1AF]">Response</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 min-h-28 w-full rounded-[10px] border border-[#D1D5DC] bg-white p-4 text-[15px] focus:border-[#615FFF] focus:outline-none focus:ring-2 focus:ring-[#615FFF]/20"
        placeholder={step.step_type === 'planning' ? 'Acknowledge your plan or note the approach you will use.' : 'Write your response here.'}
      />
    </label>
  );
}

function Feedback({ result }: { result: StepSubmitResult }) {
  const message = result.ungraded
    ? 'Saved. Keep going when you are ready.'
    : result.correct
      ? 'Nice work. This step is accepted.'
      : incorrectFeedbackMessage(result.attempts_remaining ?? 0);
  const tone = result.correct === false
    ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]'
    : 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]';

  return (
    <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {message}
    </p>
  );
}

function incorrectFeedbackMessage(attemptsRemaining: number) {
  const n = Math.max(0, attemptsRemaining);
  return `Not quite yet. ${n} ${n === 1 ? 'attempt' : 'attempts'} remaining.`;
}

type ScratchpadTool = 'pen' | 'eraser';

function Scratchpad({ completedCount, totalCount }: { completedCount: number; totalCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [activeTool, setActiveTool] = useState<ScratchpadTool>('pen');

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    function resizeCanvas() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const previous = document.createElement('canvas');
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext('2d')?.drawImage(canvas, 0, 0);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (previous.width > 0 && previous.height > 0) {
        ctx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, canvas.width, canvas.height);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function getPoint(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawPoint(point: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#111827';
    ctx.beginPath();
    ctx.arc(point.x, point.y, activeTool === 'eraser' ? 11 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#111827';
    ctx.lineWidth = activeTool === 'eraser' ? 22 : 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const point = getPoint(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = point;
    drawPoint(point);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const point = getPoint(e);
    const prev = lastPointRef.current;
    if (!point || !prev) return;
    drawLine(prev, point);
    lastPointRef.current = point;
  }

  function stopDrawing(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  return (
    <main className="min-w-0 flex-1 bg-[#F8F9FA] p-4">
      <div className="flex h-full min-h-[720px] flex-col rounded-t-xl border border-[#E1E1E1] bg-white shadow-sm">
        <header className="flex h-[48px] items-center justify-between border-b border-[#E1E1E1] px-4">
          <div className="flex items-center gap-2">
            <span className="size-4 rounded bg-[#EFF6FF]" />
            <h2 className="text-[15px] font-bold">Scratchpad</h2>
          </div>
          <p className="text-xs text-[#6A7282]">
            {completedCount}/{totalCount || 0} steps checked
          </p>
        </header>
        <div className="flex h-[52px] items-center gap-2 border-b border-[#E1E1E1] px-4">
          {(['pen', 'eraser'] as const).map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => setActiveTool(tool)}
              className={[
                'flex h-8 min-w-16 items-center justify-center rounded-lg px-3 text-xs font-medium text-[#62748E] transition hover:bg-[#F8F9FA]',
                activeTool === tool ? 'bg-[#EFF6FF] text-[#615FFF]' : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={activeTool === tool}
            >
              {tool === 'pen' ? 'Pen' : 'Eraser'}
            </button>
          ))}
          <button
            type="button"
            onClick={clearCanvas}
            className="flex h-8 min-w-16 items-center justify-center rounded-lg px-3 text-xs font-medium text-[#62748E] transition hover:bg-[#F8F9FA]"
          >
            Clear
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden bg-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle,#E5E7EB_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
          <canvas
            ref={canvasRef}
            aria-label="Scratchpad drawing canvas"
            className="absolute inset-0 touch-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
        </div>
      </div>
    </main>
  );
}

function CircuitDiagram() {
  return (
    <svg viewBox="0 0 375 192" role="img" aria-label="Circuit diagram" className="h-48 w-full">
      <rect width="375" height="192" fill="white" />
      <path d="M70 45h215v105H70z" fill="none" stroke="black" strokeWidth="2" />
      <path d="M70 96h44m36 0h55m0-51v105M205 96h55m25 0h28" fill="none" stroke="black" strokeWidth="2" />
      <circle cx="70" cy="96" r="16" fill="white" stroke="black" strokeWidth="2" />
      <circle cx="260" cy="96" r="16" fill="white" stroke="black" strokeWidth="2" />
      <path d="M114 96l6-8 8 16 8-16 8 16 6-8M205 82l8 6-16 8 16 8-16 8 8 6M285 82l8 6-16 8 16 8-16 8 8 6" fill="none" stroke="black" strokeWidth="2" />
      <text x="53" y="100" fontSize="12">9V</text>
      <text x="120" y="85" fontSize="12">5 ohm</text>
      <text x="196" y="75" fontSize="12">25 ohm</text>
      <text x="276" y="75" fontSize="12">60 ohm</text>
      <text x="220" y="42" fontSize="12">1.8 A</text>
      <text x="220" y="168" fontSize="12">10 ohm</text>
      <text x="318" y="100" fontSize="13">a</text>
      <text x="318" y="154" fontSize="13">b</text>
      <text x="178" y="40" fontSize="12">20 ohm</text>
      <path d="M205 150h80" fill="none" stroke="black" strokeWidth="2" />
    </svg>
  );
}

function CircuitOption({ index, label }: { index: number; label: string }) {
  const isVoltage = index === 0 || index === 3;
  const isSeries = index === 0 || index === 1;
  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <svg viewBox="0 0 150 92" aria-hidden="true" className="h-20 w-full">
        {isSeries ? (
          <>
            <path d="M24 65h90M24 28h30m42 0h18M75 28v37" stroke="black" strokeWidth="1.5" fill="none" />
            <SourceSymbol x={24} y={46} voltage={isVoltage} />
            <Resistor x={56} y={28} horizontal />
            <text x="58" y="19" fontSize="10">{isVoltage ? 'RTH' : 'RN'}</text>
            <text x="15" y="49" fontSize="10">{isVoltage ? 'vTH' : 'iN'}</text>
          </>
        ) : (
          <>
            <path d="M32 20h92M32 72h92M72 20v52M98 20v52" stroke="black" strokeWidth="1.5" fill="none" />
            <SourceSymbol x={32} y={46} voltage={isVoltage} />
            <Resistor x={98} y={27} />
            <text x="104" y="51" fontSize="10">{isVoltage ? 'RTH' : 'RN'}</text>
            <text x="18" y="49" fontSize="10">{isVoltage ? 'vTH' : 'iN'}</text>
          </>
        )}
      </svg>
      <p className="line-clamp-2 text-center text-xs leading-4 text-[#364153]">{label}</p>
    </div>
  );
}

function SourceSymbol({ x, y, voltage }: { x: number; y: number; voltage: boolean }) {
  return (
    <>
      <circle cx={x} cy={y} r="12" fill="white" stroke="black" strokeWidth="1.5" />
      {voltage ? (
        <path d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`} stroke="black" strokeWidth="1.2" />
      ) : (
        <path d={`M${x} ${y + 7}V${y - 7}m-5 5 5-5 5 5`} fill="none" stroke="black" strokeWidth="1.2" />
      )}
    </>
  );
}

function Resistor({ x, y, horizontal }: { x: number; y: number; horizontal?: boolean }) {
  if (horizontal) {
    return <path d={`M${x} ${y}l5-7 5 14 5-14 5 14 5-14 5 7`} fill="none" stroke="black" strokeWidth="1.5" />;
  }
  return <path d={`M${x} ${y}l-7 5 14 5-14 5 14 5-14 5 7 5`} fill="none" stroke="black" strokeWidth="1.5" />;
}

function TopButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[40px] rounded-lg border border-[#5D5D5D] bg-white px-4 text-[15px] font-medium text-[#0A0A0A] transition hover:bg-[#F8F9FA]"
    >
      {children}
    </button>
  );
}

function displayStepPrompt(step: ScaffoldStep) {
  return step.prompt_text;
}

function valueForSubmit(step: ScaffoldStep, value: string) {
  if (step.step_type === 'planning') return value.trim() || 'acknowledged';
  if (step.step_type === 'open') return value.trim() || null;
  if (step.step_type === 'numeric') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return value || null;
}
