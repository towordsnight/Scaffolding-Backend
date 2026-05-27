import type { MultiValueStepDef, StepState } from '../../types';

interface MultiValueStepProps {
  step: MultiValueStepDef;
  state: StepState;
}

export function MultiValueStep({ step, state }: MultiValueStepProps) {
  const values =
    state === 'filled' ? step.filled.values
      : state === 'checked' ? step.checked.values
        : step.inputs.map(() => '');

  const filled = state !== 'empty';

  return (
    <div className="mt-4 space-y-3">
      {step.inputs.map((input, index) => (
        <div key={input.label}>
          <label className="block text-[12px] font-medium tracking-[0.05em] text-[#5D5D5D] uppercase">
            {input.label}
          </label>
          <input
            type="text"
            readOnly
            value={values[index] ?? ''}
            placeholder={input.placeholder ?? ''}
            className={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-[14px] text-black ${
              filled ? 'border-[#10B981] outline-2 outline-[#10B98133]' : 'border-[#E5E7EB]'
            }`}
          />
        </div>
      ))}
    </div>
  );
}
