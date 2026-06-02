import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MathAnswerInput } from '../components/MathAnswerInput';
import { ResizableSplitPane } from '../components/ResizableSplitPane';
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
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<PublicProblem | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scaffold, setScaffold] = useState<ProblemScaffold | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, StepSubmitResult>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProblem() {
      setLoading(true);
      setError(null);
      try {
        const problemId = id ?? (await problems.next()).id;
        if (!active) return;

        if (!id) {
          navigate(`/problems/${problemId}`, { replace: true });
          return;
        }

        const [problemResult, sessionResult] = await Promise.all([
          problems.get(problemId),
          sessions.create({ problem_id: problemId }),
        ]);
        if (!active) return;

        const scaffoldResult = await problems.getScaffold(problemId, sessionResult.session_id);
        if (!active) return;

        setProblem(problemResult);
        setSessionId(sessionResult.session_id);
        setScaffold(scaffoldResult);

        const restoredIndex = scaffoldResult.current_step_id
          ? scaffoldResult.steps.findIndex((step) => step.id === scaffoldResult.current_step_id)
          : 0;
        setActiveIndex(restoredIndex >= 0 ? restoredIndex : 0);
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Unable to load this problem.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProblem();
    return () => {
      active = false;
    };
  }, [id, navigate]);

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
      if (result.correct !== false && result.next_step_id) {
        const nextIndex = steps.findIndex((step) => step.id === result.next_step_id);
        if (nextIndex >= 0) setActiveIndex(nextIndex);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit this step.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProblemShell
      title="Homework Set 1"
      onBack={() => navigate('/dashboard')}
      onComplete={() => navigate('/dashboard')}
    >
      {loading ? (
        <EmptyState title="Loading workspace" message="Preparing the problem and scratchpad..." />
      ) : error && !problem ? (
        <EmptyState title="Unable to load problem" message={error} />
      ) : (
        <ResizableSplitPane
          defaultSidebarWidth={490}
          className="min-h-[calc(100vh-73px)]"
          sidebar={
            <>
              <div className="flex items-center px-4 py-4">
                <div>
                  <p className="text-sm font-medium tracking-[0.05em] text-[#5D5D5D] uppercase">
                    Step {steps.length === 0 ? 0 : activeIndex + 1}/{steps.length || 1}
                  </p>
                  <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-[#E5E7EB]">
                    <div className="h-full rounded-full bg-[#615FFF]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
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
                    onClick={() => setActiveIndex((index) => Math.min(steps.length - 1, index + 1))}
                    disabled={steps.length === 0 || activeIndex >= steps.length - 1}
                    className="h-[43px] rounded-[10px] border border-[#E1E1E1] bg-white text-sm font-semibold text-[#364153] shadow-sm transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          }
          workspace={<Scratchpad completedCount={completedCount} totalCount={steps.length} />}
        />
      )}
    </ProblemShell>
  );
}

function ProblemShell({
  children,
  title = 'Homework Set 1',
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
      <div className="mt-4">
        <MathAnswerInput
          label="Numeric answer"
          inputType="number"
          value={value}
          onChange={onChange}
          mathPreview={false}
          placeholder="Enter your answer"
        />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <MathAnswerInput
        label="Response"
        value={value}
        onChange={onChange}
        multiline
        placeholder={step.step_type === 'planning' ? 'Acknowledge your plan or note the approach you will use.' : 'Write your response here.'}
      />
    </div>
  );
}

function Feedback({ result }: { result: StepSubmitResult }) {
  const message = result.ungraded
    ? 'Saved. Keep going when you are ready.'
    : result.correct
      ? 'Nice work. This step is accepted.'
      : incorrectFeedbackMessage(result.attempts_remaining ?? 0);
  const tone = result.correct === false ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]' : 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]';

  return (
    <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {message}
    </p>
  );
}

function incorrectFeedbackMessage(attemptsRemaining: number) {
  const attempts = Math.max(0, attemptsRemaining);
  return `Incorrect: You have ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} left.`;
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
    const drawingCanvas = canvas;
    const drawingContainer = container;

    function resizeCanvas() {
      const rect = drawingContainer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const previous = document.createElement('canvas');
      previous.width = drawingCanvas.width;
      previous.height = drawingCanvas.height;
      previous.getContext('2d')?.drawImage(drawingCanvas, 0, 0);

      const dpr = window.devicePixelRatio || 1;
      drawingCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
      drawingCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
      drawingCanvas.style.width = `${rect.width}px`;
      drawingCanvas.style.height = `${rect.height}px`;

      const context = drawingCanvas.getContext('2d');
      if (!context) return;

      context.setTransform(1, 0, 0, 1, 0, 0);
      if (previous.width > 0 && previous.height > 0) {
        context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, drawingCanvas.width, drawingCanvas.height);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(drawingContainer);

    return () => observer.disconnect();
  }, []);

  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function drawPoint(point: { x: number; y: number }) {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    context.save();
    context.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    context.fillStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#111827';
    context.beginPath();
    context.arc(point.x, point.y, activeTool === 'eraser' ? 11 : 1.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#111827';
    context.lineWidth = activeTool === 'eraser' ? 22 : 3;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = point;
    drawPoint(point);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    const point = getPoint(event);
    const previousPoint = lastPointRef.current;
    if (!point || !previousPoint) return;

    drawLine(previousPoint, point);
    lastPointRef.current = point;
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const dpr = window.devicePixelRatio || 1;
    context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
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
                activeTool === tool && 'bg-[#EFF6FF] text-[#615FFF]',
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
        <>
          <path d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`} stroke="black" strokeWidth="1.2" />
        </>
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
  if (step.step_order === 1 && step.step_type === 'mcq') {
    return 'Recall: What does the Thevenin equivalent model look like?';
  }
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
