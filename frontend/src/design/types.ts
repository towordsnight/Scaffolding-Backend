/**
 * Type contract for the Homework Set 1 mockup.
 *
 * This file is the eventual API contract for the backend scaffold endpoint.
 * Stage 4 of the conversion plan swaps the static fixtures import for
 * `problems.getScaffold(id)` and the runtime types should line up directly.
 *
 * Each `Step` is a discriminated union member keyed by `kind`. Every step
 * carries its three display states (empty / filled / checked) inline so the
 * showcase and interactive routes can render the same record three ways.
 */

export type StepState = 'empty' | 'filled' | 'checked';

export type FeedbackTone = 'success' | 'warning' | 'error';

export interface Feedback {
  tone: FeedbackTone;
  title: string;
  body: string;
}

export type CircuitOptionKind =
  | 'voltage_series'
  | 'current_series'
  | 'current_parallel'
  | 'voltage_parallel';

export interface McqOption {
  key: string;
  kind: CircuitOptionKind;
}

/** Highlight overlay drawn on top of the circuit diagram for a given step. */
export type CircuitOverlay =
  | 'none'
  | 'highlight_node_va'
  | 'highlight_terminals_ab'
  | 'mesh_loops'
  | 'mesh_loop_1';

export interface CommonStep {
  number: number;
  prompt: string;
  helperText?: string;
  actionLabel: string;
  circuitOverlay?: CircuitOverlay;
}

export interface McqStepDef extends CommonStep {
  kind: 'mcq';
  options: McqOption[];
  filled: { selectedIndex: number };
  checked: { selectedIndex: number; feedback: Feedback };
}

export interface MultiValueStepDef extends CommonStep {
  kind: 'multi_value';
  inputs: Array<{ label: string; placeholder?: string }>;
  filled: { values: string[] };
  checked: { values: string[]; feedback: Feedback };
}

export interface SelectInDiagramStepDef extends CommonStep {
  kind: 'select_in_diagram';
  filled: { overlay: CircuitOverlay };
  checked: { overlay: CircuitOverlay; feedback: Feedback };
}

export interface NumericPlainStepDef extends CommonStep {
  kind: 'numeric_plain';
  fieldLabel?: string;
  filled: { value: string };
  checked: { value: string; feedback: Feedback };
}

export interface NumericUnitStepDef extends CommonStep {
  kind: 'numeric_unit';
  fieldLabel: string;
  leftLabel: string;
  unit: string;
  placeholder?: string;
  filled: { value: string };
  checked: { value: string; feedback: Feedback };
}

export interface LabeledEquationsStepDef extends CommonStep {
  kind: 'labeled_equations';
  prefix: string;
  empty: { equations: string[] };
  filled: { equations: string[] };
  checked: { equations: string[]; feedback: Feedback };
}

export interface DrawingTaskStepDef extends CommonStep {
  kind: 'drawing_task';
  filled: Record<string, never>;
  checked: { feedback: Feedback };
}

export interface PriorsThenInputStepDef extends CommonStep {
  kind: 'priors_then_input';
  priors: string[];
  fieldLabel: string;
  leftLabel: string;
  unit: string;
  placeholder?: string;
  filled: { value: string };
  checked: { value: string; feedback: Feedback };
}

export type Step =
  | McqStepDef
  | MultiValueStepDef
  | SelectInDiagramStepDef
  | NumericPlainStepDef
  | NumericUnitStepDef
  | LabeledEquationsStepDef
  | DrawingTaskStepDef
  | PriorsThenInputStepDef;

export type StepKind = Step['kind'];
