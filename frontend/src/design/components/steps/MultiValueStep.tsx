import { MathAnswerInput } from '../../../components/MathAnswerInput';
import type { MultiValueStepDef, StepState } from '../../types';

interface MultiValueStepProps {
  step: MultiValueStepDef;
  state: StepState;
  values?: string[];
  onChange?: (index: number, value: string) => void;
}

export function MultiValueStep({ step, state, values: controlledValues, onChange }: MultiValueStepProps) {
  const values = controlledValues ?? (
    state === 'filled' ? step.filled.values
      : state === 'checked' ? step.checked.values
        : step.inputs.map(() => '')
  );

  const filled = state !== 'empty';

  return (
    <div className="mt-4 space-y-3">
      {step.inputs.map((input, index) => (
        <div key={input.label}>
          <MathAnswerInput
            value={values[index] ?? ''}
            onChange={(next) => onChange?.(index, next)}
            label={input.label}
            labelClassName="block text-[12px] font-medium tracking-[0.05em] text-[#5D5D5D] uppercase"
            placeholder={input.placeholder ?? ''}
            inputClassName={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-[14px] text-black ${
              filled ? 'border-[#10B981] outline-2 outline-[#10B98133]' : 'border-[#E5E7EB]'
            }`}
            renderClassName="pointer-events-none absolute inset-x-0 bottom-0 top-1.5 flex items-center overflow-x-auto rounded-md px-3 text-[14px] text-black"
          />
        </div>
      ))}
    </div>
  );
}
