import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Scratchpad } from '../design/components/Scratchpad';
import { Sidebar } from '../design/components/Sidebar';
import { StepCard } from '../design/components/StepCard';
import { WorkspaceFrame } from '../design/components/WorkspaceFrame';
import { mockSteps } from '../design/mockSteps';
import type { Feedback as FeedbackData, Step, StepState } from '../design/types';

const ATTEMPT_BUDGET = 5;

type TextInputStep = Extract<
  Step,
  {
    kind:
      | 'multi_value'
      | 'numeric_plain'
      | 'numeric_unit'
      | 'labeled_equations'
      | 'priors_then_input';
  }
>;

/**
 * Interactive single-step view of the Homework Set 1 workspace.
 *
 * Drives the workspace UI from local React state:
 *  - `activeIndex` selects which step from the fixtures is shown
 *  - `statesByStep` records the display state per step (defaulting to empty)
 *
 * Pressing the action button validates MCQ selections, or advances other steps
 * along `empty -> filled -> checked`. Previous/Next navigate between steps.
 *
 * No backend integration — this is the visual contract that stage 4 will
 * wire to `problems.getScaffold` and `problems.submitStep`.
 */
export function DesignProblemRoute() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [statesByStep, setStatesByStep] = useState<Record<number, StepState>>({});
  const [mcqSelectionsByStep, setMcqSelectionsByStep] = useState<Record<number, number>>({});
  const [mcqFeedbackByStep, setMcqFeedbackByStep] = useState<Record<number, FeedbackData>>({});
  const [textAnswersByStep, setTextAnswersByStep] = useState<Record<number, string[]>>({});
  const [textFeedbackByStep, setTextFeedbackByStep] = useState<Record<number, FeedbackData>>({});
  const [incorrectAttemptsByStep, setIncorrectAttemptsByStep] = useState<Record<number, number>>({});

  const step = mockSteps[activeIndex];
  const state: StepState = statesByStep[step.number] ?? 'empty';
  const selectedOptionIndex = step.kind === 'mcq' ? mcqSelectionsByStep[step.number] : undefined;
  const mcqFeedback = step.kind === 'mcq' ? mcqFeedbackByStep[step.number] : undefined;
  const textAnswers = isTextInputStep(step)
    ? textAnswersByStep[step.number] ?? emptyTextAnswers(step)
    : undefined;
  const textFeedback = isTextInputStep(step) ? textFeedbackByStep[step.number] : undefined;
  const feedbackOverride = mcqFeedback ?? textFeedback;

  function advanceState() {
    if (step.kind === 'mcq') {
      submitMcqSelection();
      return;
    }

    if (isTextInputStep(step)) {
      submitTextAnswers();
      return;
    }

    setStatesByStep((prev) => {
      const current = prev[step.number] ?? 'empty';
      const next: StepState =
        current === 'empty' ? 'filled' : current === 'filled' ? 'checked' : 'checked';
      return { ...prev, [step.number]: next };
    });
  }

  function selectMcqOption(index: number) {
    if (step.kind !== 'mcq') return;

    setMcqSelectionsByStep((prev) => ({ ...prev, [step.number]: index }));
    setMcqFeedbackByStep((prev) => {
      const next = { ...prev };
      delete next[step.number];
      return next;
    });
    setStatesByStep((prev) => ({ ...prev, [step.number]: 'filled' }));
  }

  function submitMcqSelection() {
    if (step.kind !== 'mcq') return;
    if (selectedOptionIndex === undefined) return;

    const correct = selectedOptionIndex === step.checked.selectedIndex;
    const feedback = correct ? step.checked.feedback : recordIncorrectAttempt(step.number);
    setMcqFeedbackByStep((prev) => ({
      ...prev,
      [step.number]: feedback,
    }));
    setStatesByStep((prev) => ({ ...prev, [step.number]: correct ? 'checked' : 'filled' }));
  }

  function changeTextAnswer(index: number, value: string) {
    if (!isTextInputStep(step)) return;

    setTextAnswersByStep((prev) => {
      const nextValues = [...(prev[step.number] ?? emptyTextAnswers(step))];
      nextValues[index] = value;
      return { ...prev, [step.number]: nextValues };
    });
    setTextFeedbackByStep((prev) => {
      const next = { ...prev };
      delete next[step.number];
      return next;
    });
    setStatesByStep((prev) => ({ ...prev, [step.number]: 'filled' }));
  }

  function submitTextAnswers() {
    if (!isTextInputStep(step) || !textAnswers || !hasRequiredTextAnswers(step, textAnswers)) return;

    const correct = textAnswersAreCorrect(step, textAnswers);
    const feedback = correct ? step.checked.feedback : recordIncorrectAttempt(step.number);
    setTextFeedbackByStep((prev) => ({
      ...prev,
      [step.number]: feedback,
    }));
    setStatesByStep((prev) => ({ ...prev, [step.number]: correct ? 'checked' : 'filled' }));
  }

  function recordIncorrectAttempt(stepNumber: number): FeedbackData {
    const attemptsUsed = (incorrectAttemptsByStep[stepNumber] ?? 0) + 1;
    setIncorrectAttemptsByStep((prev) => ({ ...prev, [stepNumber]: attemptsUsed }));
    return incorrectAttemptFeedback(attemptsUsed);
  }

  function goToStep(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= mockSteps.length) return;
    setActiveIndex(nextIndex);
  }

  return (
    <WorkspaceFrame
      sidebar={
        <Sidebar
          stepNumber={step.number}
          circuitOverlay={step.circuitOverlay}
          stepCard={
            <StepCard
              step={step}
              state={state}
              selectedOptionIndex={selectedOptionIndex}
              answerValues={textAnswers}
              feedbackOverride={feedbackOverride}
              actionDisabled={
                (step.kind === 'mcq' && selectedOptionIndex === undefined)
                || (isTextInputStep(step) && (!textAnswers || !hasRequiredTextAnswers(step, textAnswers)))
              }
              onOptionSelect={selectMcqOption}
              onTextAnswerChange={changeTextAnswer}
              onAction={advanceState}
            />
          }
          onPrev={() => goToStep(activeIndex - 1)}
          onNext={() => goToStep(activeIndex + 1)}
          isFirst={activeIndex === 0}
          isLast={activeIndex === mockSteps.length - 1}
        />
      }
      workspace={<Scratchpad />}
      onBack={() => navigate('/dashboard')}
    />
  );
}

function isTextInputStep(step: Step): step is TextInputStep {
  return [
    'multi_value',
    'numeric_plain',
    'numeric_unit',
    'labeled_equations',
    'priors_then_input',
  ].includes(step.kind);
}

function emptyTextAnswers(step: TextInputStep): string[] {
  return expectedTextAnswers(step).map(() => '');
}

function expectedTextAnswers(step: TextInputStep): string[] {
  switch (step.kind) {
    case 'multi_value':
      return step.checked.values;
    case 'labeled_equations':
      return step.checked.equations;
    case 'numeric_plain':
    case 'numeric_unit':
    case 'priors_then_input':
      return [step.checked.value];
  }
}

function hasRequiredTextAnswers(step: TextInputStep, values: string[]) {
  return expectedTextAnswers(step).every((_, index) => values[index]?.trim());
}

function textAnswersAreCorrect(step: TextInputStep, values: string[]) {
  switch (step.kind) {
    case 'multi_value':
      return step.checked.values.every((expected, index) => (
        normalizeText(values[index]) === normalizeText(expected)
      ));
    case 'labeled_equations':
      return step.checked.equations.every((expected, index) => (
        normalizeEquation(values[index]) === normalizeEquation(expected)
      ));
    case 'numeric_plain':
    case 'numeric_unit':
    case 'priors_then_input': {
      const submitted = Number(values[0]);
      const expected = Number(step.checked.value);
      return Number.isFinite(submitted)
        && Number.isFinite(expected)
        && Math.abs(submitted - expected) < 1e-9;
    }
  }
}

function normalizeText(value: string | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEquation(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, '');
}

function incorrectAttemptFeedback(attemptsUsed: number): FeedbackData {
  const attemptsRemaining = Math.max(0, ATTEMPT_BUDGET - attemptsUsed);
  return {
    tone: 'error',
    title: 'Incorrect',
    body: `You have ${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} left.`,
  };
}
