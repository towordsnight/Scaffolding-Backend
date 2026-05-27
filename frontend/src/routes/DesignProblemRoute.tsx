import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Scratchpad } from '../design/components/Scratchpad';
import { Sidebar } from '../design/components/Sidebar';
import { StepCard } from '../design/components/StepCard';
import { WorkspaceFrame } from '../design/components/WorkspaceFrame';
import { mockSteps } from '../design/mockSteps';
import type { StepState } from '../design/types';

/**
 * Interactive single-step view of the Homework Set 1 workspace.
 *
 * Drives the workspace UI from local React state:
 *  - `activeIndex` selects which step from the fixtures is shown
 *  - `statesByStep` records the display state per step (defaulting to empty)
 *
 * Pressing the action button advances state along `empty -> filled -> checked`.
 * Previous/Next navigate between steps. Mark complete jumps to the next step.
 *
 * No backend integration — this is the visual contract that stage 4 will
 * wire to `problems.getScaffold` and `problems.submitStep`.
 */
export function DesignProblemRoute() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [statesByStep, setStatesByStep] = useState<Record<number, StepState>>({});

  const step = mockSteps[activeIndex];
  const state: StepState = statesByStep[step.number] ?? 'empty';

  function advanceState() {
    setStatesByStep((prev) => {
      const current = prev[step.number] ?? 'empty';
      const next: StepState =
        current === 'empty' ? 'filled' : current === 'filled' ? 'checked' : 'checked';
      return { ...prev, [step.number]: next };
    });
  }

  function goToStep(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= mockSteps.length) return;
    setActiveIndex(nextIndex);
  }

  function handleMarkComplete() {
    setStatesByStep((prev) => ({ ...prev, [step.number]: 'checked' }));
    goToStep(activeIndex + 1);
  }

  return (
    <WorkspaceFrame
      sidebar={
        <Sidebar
          stepNumber={step.number}
          circuitOverlay={step.circuitOverlay}
          stepCard={<StepCard step={step} state={state} onAction={advanceState} />}
          onPrev={() => goToStep(activeIndex - 1)}
          onNext={() => goToStep(activeIndex + 1)}
          onMarkComplete={handleMarkComplete}
          isFirst={activeIndex === 0}
          isLast={activeIndex === mockSteps.length - 1}
        />
      }
      workspace={<Scratchpad />}
      onBack={() => navigate('/dashboard')}
    />
  );
}
