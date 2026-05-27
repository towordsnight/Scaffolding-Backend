import type { SelectInDiagramStepDef, StepState } from '../../types';
import { CircuitDiagram } from '../CircuitDiagram';

interface SelectInDiagramStepProps {
  step: SelectInDiagramStepDef;
  state: StepState;
}

/**
 * Step 3 & 4: text prompt plus an embedded circuit diagram the student is
 * meant to click. In the static mockup we just render the diagram with the
 * appropriate overlay highlighting the selected element. No real click
 * handling — wiring lives in stage 4.
 */
export function SelectInDiagramStep({ step, state }: SelectInDiagramStepProps) {
  const overlay =
    state === 'filled' ? step.filled.overlay
      : state === 'checked' ? step.checked.overlay
        : 'none';

  return (
    <div className="mt-4 rounded-[10px] border border-[#E5E7EB] bg-white p-2 shadow-sm">
      <CircuitDiagram overlay={overlay} />
    </div>
  );
}
