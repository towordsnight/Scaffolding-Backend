import { Scratchpad } from '../design/components/Scratchpad';
import { Sidebar } from '../design/components/Sidebar';
import { StepCard } from '../design/components/StepCard';
import { WorkspaceFrame } from '../design/components/WorkspaceFrame';
import { mockSteps } from '../design/mockSteps';
import type { Step, StepState } from '../design/types';

/**
 * Design review artifact: every step in the fixtures rendered in every
 * state (empty, filled, checked) as a grid of scaled-down workspace frames.
 *
 * Each frame is rendered at the natural 1440x900 size in its own scaling
 * container so the grid layout matches the Figma overview screenshot.
 * This page is not a real screen — it exists so a designer or stakeholder
 * can walk through all 36 frames at once and compare against Figma.
 */
export function DesignShowcaseRoute() {
  const STATES: StepState[] = ['empty', 'filled', 'checked'];

  return (
    <div className="min-h-screen bg-[#2A2A2A] p-8 font-['IBM_Plex_Sans',sans-serif]">
      <div className="mx-auto max-w-[1400px] text-white">
        <header className="mb-6">
          <p className="text-[12px] tracking-[0.18em] text-[#A4A1FF] uppercase">
            Figma to code mockup
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Homework Set 1 — all 12 steps, every state
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-[#D1D5DB]">
            Each row is one step from the Thévenin problem; each column is one
            display state. Use this view to compare against the Figma file
            side-by-side. For an interactive single-step view see{' '}
            <a className="text-[#A4A1FF] underline" href="/design/problem">
              /design/problem
            </a>
            .
          </p>
        </header>

        <div className="space-y-10">
          {mockSteps.map((step) => (
            <section key={step.number}>
              <h2 className="mb-3 text-sm font-semibold text-[#D1D5DB]">
                Step {step.number} — {step.kind.replaceAll('_', ' ')}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {STATES.map((state) => (
                  <FrameThumbnail key={state} step={step} state={state} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a single 1440x900 workspace frame scaled down to fit one column of
 * the showcase grid.
 *
 * `transform: scale(...)` shrinks the underlying full-size frame so the
 * layout, font sizes, and spacing all stay pixel-identical to the live
 * `/design/problem` view — we are just zooming out.
 */
function FrameThumbnail({ step, state }: { step: Step; state: StepState }) {
  const FRAME_WIDTH = 1440;
  const FRAME_HEIGHT = 900;
  const SCALE = 440 / FRAME_WIDTH;

  return (
    <div>
      <p className="mb-1.5 text-[11px] tracking-[0.1em] text-[#9CA3AF] uppercase">
        {state}
      </p>
      <div
        className="overflow-hidden rounded-md border border-[#4B5563] bg-white shadow-lg"
        style={{ width: FRAME_WIDTH * SCALE, height: FRAME_HEIGHT * SCALE }}
      >
        <div
          style={{
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            transform: `scale(${SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          <WorkspaceFrame
            sidebar={
              <Sidebar
                stepNumber={step.number}
                circuitOverlay={step.circuitOverlay}
                stepCard={<StepCard step={step} state={state} />}
                isFirst={step.number === 1}
                isLast={step.number === mockSteps.length}
              />
            }
            workspace={<Scratchpad />}
          />
        </div>
      </div>
    </div>
  );
}
