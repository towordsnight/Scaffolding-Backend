import { MathAnswerInput } from '../../../components/MathAnswerInput';
import type { NumericPlainStepDef, StepState } from '../../types';

interface NumericPlainStepProps {
  step: NumericPlainStepDef;
  state: StepState;
  value?: string;
  onChange?: (value: string) => void;
}

export function NumericPlainStep({ step, state, value: controlledValue, onChange }: NumericPlainStepProps) {
  const value = controlledValue ?? (
    state === 'filled' ? step.filled.value
      : state === 'checked' ? step.checked.value
        : ''
  );
  const filled = state !== 'empty';

  return (
    <div className="mt-3">
      {step.fieldLabel && (
        <p className="text-[14px] font-bold text-black">{step.fieldLabel}</p>
      )}
      <MathAnswerInput
        value={value}
        onChange={(next) => onChange?.(next)}
        mathPreview={false}
        inputClassName={`mt-2 h-10 w-32 rounded-md border bg-white px-3 text-[14px] text-black ${
          filled ? 'border-[#10B981] outline-2 outline-[#10B98133]' : 'border-[#E5E7EB]'
        }`}
      />
    </div>
  );
}
