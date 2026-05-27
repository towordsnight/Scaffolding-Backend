import type { LabeledEquationsStepDef, StepState } from '../../types';

interface LabeledEquationsStepProps {
  step: LabeledEquationsStepDef;
  state: StepState;
}

/**
 * Step 7 (KCL) and step 10 (MESH): a stack of labeled textareas.
 *
 * Step 7 specifically uses progressive reveal — empty state shows 1
 * textarea, filled shows 2 (first one with the equation, second empty),
 * checked shows both filled. We honor whatever shape lives in the fixtures
 * for each state.
 */
export function LabeledEquationsStep({ step, state }: LabeledEquationsStepProps) {
  const equations =
    state === 'filled' ? step.filled.equations
      : state === 'checked' ? step.checked.equations
        : step.empty.equations;

  return (
    <div className="mt-4 space-y-3">
      {equations.map((value, index) => (
        <div key={`${step.prefix}-${index}`}>
          <label className="block text-[12px] font-medium tracking-[0.05em] text-[#5D5D5D] uppercase">
            {step.prefix} {index + 1}:
          </label>
          <textarea
            readOnly
            value={value}
            rows={value ? 2 : 2}
            className={`mt-1.5 w-full resize-none rounded-md border bg-white px-3 py-2 font-mono text-[13px] text-black ${
              value
                ? 'border-[#10B981] outline-2 outline-[#10B98133]'
                : 'border-[#E5E7EB]'
            }`}
          />
        </div>
      ))}
    </div>
  );
}
