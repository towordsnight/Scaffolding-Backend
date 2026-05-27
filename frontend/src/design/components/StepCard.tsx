import type { Step, StepState, Feedback as FeedbackData } from '../types';
import { Feedback } from './Feedback';
import { McqStep } from './steps/McqStep';
import { MultiValueStep } from './steps/MultiValueStep';
import { SelectInDiagramStep } from './steps/SelectInDiagramStep';
import { NumericPlainStep } from './steps/NumericPlainStep';
import { NumericUnitStep } from './steps/NumericUnitStep';
import { LabeledEquationsStep } from './steps/LabeledEquationsStep';
import { DrawingTaskStep } from './steps/DrawingTaskStep';
import { PriorsThenInputStep } from './steps/PriorsThenInputStep';

interface StepCardProps {
  step: Step;
  state: StepState;
  onAction?: () => void;
}

/**
 * The "Step output" card body inside the sidebar.
 *
 * Renders the step's bold prompt, optional helper text, the kind-specific
 * input UI, feedback alert (when state === 'checked'), and the action
 * button at the bottom. The action button label comes from the fixtures
 * (`Confirm Selection` / `Check Solution` / `Check Equations` / `Check Drawing`).
 *
 * The button is only shown when there is still an action available — once
 * the step is in the `checked` state the button hides because the feedback
 * banner takes its place visually.
 */
export function StepCard({ step, state, onAction }: StepCardProps) {
  const feedback = pickFeedback(step, state);
  const showAction = state !== 'checked';

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <h2 className="text-[15px] leading-[22px] font-bold whitespace-pre-line text-black">
        {step.prompt}
      </h2>
      {step.helperText && (
        <p className="mt-2 text-[13px] leading-[19px] text-[#6A7282]">{step.helperText}</p>
      )}

      <StepBody step={step} state={state} />

      {feedback && <Feedback feedback={feedback} />}

      {showAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-[48px] w-full rounded-[10px] bg-[#615FFF] text-[15px] font-bold text-white shadow-[0_4px_6px_rgba(0,0,0,0.10)] transition hover:bg-[#5350E6]"
        >
          {step.actionLabel}
        </button>
      )}
    </div>
  );
}

function StepBody({ step, state }: { step: Step; state: StepState }) {
  switch (step.kind) {
    case 'mcq':
      return <McqStep step={step} state={state} />;
    case 'multi_value':
      return <MultiValueStep step={step} state={state} />;
    case 'select_in_diagram':
      return <SelectInDiagramStep step={step} state={state} />;
    case 'numeric_plain':
      return <NumericPlainStep step={step} state={state} />;
    case 'numeric_unit':
      return <NumericUnitStep step={step} state={state} />;
    case 'labeled_equations':
      return <LabeledEquationsStep step={step} state={state} />;
    case 'drawing_task':
      return <DrawingTaskStep />;
    case 'priors_then_input':
      return <PriorsThenInputStep step={step} state={state} />;
  }
}

function pickFeedback(step: Step, state: StepState): FeedbackData | undefined {
  if (state !== 'checked') return undefined;
  return step.checked.feedback;
}
