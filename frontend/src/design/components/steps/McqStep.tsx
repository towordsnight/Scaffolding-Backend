import type { McqStepDef, StepState } from '../../types';
import { CircuitChoiceTile } from '../OptionCircuit';

interface McqStepProps {
  step: McqStepDef;
  state: StepState;
  selectedOptionIndex?: number;
  onSelect?: (index: number) => void;
}

export function McqStep({ step, state, selectedOptionIndex, onSelect }: McqStepProps) {
  const fixtureSelectedIndex =
    state === 'filled' ? step.filled.selectedIndex
      : state === 'checked' ? step.checked.selectedIndex
        : undefined;
  const selectedIndex = selectedOptionIndex ?? fixtureSelectedIndex;

  return (
    <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))' }}>
      {step.options.map((option, index) => (
        <CircuitChoiceTile
          key={option.key}
          kind={option.kind}
          selected={selectedIndex === index}
          ariaLabel={`Select answer choice ${option.key}`}
          onClick={() => onSelect?.(index)}
        />
      ))}
    </div>
  );
}
