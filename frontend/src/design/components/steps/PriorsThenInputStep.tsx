import { MathAnswerInput } from '../../../components/MathAnswerInput';
import type { PriorsThenInputStepDef, StepState } from '../../types';

interface PriorsThenInputStepProps {
  step: PriorsThenInputStepDef;
  state: StepState;
  value?: string;
  onChange?: (value: string) => void;
}

/** Step 12: shows the previously-found values (Vth, Isc) above a final numeric input. */
export function PriorsThenInputStep({ step, state, value: controlledValue, onChange }: PriorsThenInputStepProps) {
  const value = controlledValue ?? (
    state === 'filled' ? step.filled.value
      : state === 'checked' ? step.checked.value
        : ''
  );
  const filled = state !== 'empty';

  return (
    <div className="mt-3">
      <div className="space-y-0.5">
        {step.priors.map((prior) => (
          <p key={prior} className="font-mono text-[14px] font-semibold text-black">
            {prior}
          </p>
        ))}
      </div>
      <p className="mt-3 text-[14px] font-bold text-black">{step.fieldLabel}</p>
      <div className="mt-2 flex items-start gap-2">
        <span className="pt-2 text-[14px] font-semibold text-black">{step.leftLabel}</span>
        <div className="min-w-0 flex-1">
          <MathAnswerInput
            value={value}
            onChange={(next) => onChange?.(next)}
            mathPreview={false}
            placeholder={step.placeholder ?? '0.00'}
            inputClassName={`h-10 w-full rounded-md border bg-white px-3 text-[14px] text-black ${
              filled ? 'border-[#10B981] outline-2 outline-[#10B98133]' : 'border-[#E5E7EB]'
            }`}
          />
        </div>
        <span className="pt-2 text-[14px] text-[#1E2939]">{step.unit}</span>
      </div>
    </div>
  );
}
