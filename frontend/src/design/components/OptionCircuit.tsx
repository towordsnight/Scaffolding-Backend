import type { CircuitOptionKind } from '../types';
import { CurrentSource, Resistor, VoltageSource } from './circuit-symbols';

interface OptionCircuitProps {
  /** Voltage source (battery) vs current source (arrow). */
  isVoltage: boolean;
  /** Source in series with R (top branch) vs in parallel with R. */
  isSeries: boolean;
  className?: string;
}

interface CircuitChoiceTileProps {
  kind: CircuitOptionKind;
  selected: boolean;
  ariaLabel: string;
  description?: string;
  onClick: () => void;
}

/**
 * Step 1 answer-choice thumbnail — the four source/resistance configurations.
 *
 * Geometry transcribed coordinate-for-coordinate from the instructor's four
 * CircuitPaint exports (2026-04-24 23:03–23:08):
 *   - voltage + series   → A  (the correct Thévenin model)
 *   - current + series   → B
 *   - current + parallel → C  (Norton model)
 *   - voltage + parallel → D
 *
 * Source/resistor labels follow the exports' KaTeX: the source is vTH / iN and
 * the resistor is RTH, except the current-in-series choice uses RN. Subscripts
 * render as small <tspan>s instead of the exports' embedded MathML.
 */
export function OptionCircuit({ isVoltage, isSeries, className = '' }: OptionCircuitProps) {
  const Source = isVoltage ? VoltageSource : CurrentSource;
  const sourceSub = isVoltage ? 'TH' : 'N';
  const resistorSub = !isVoltage && isSeries ? 'N' : 'TH';
  const sourceLetter = isVoltage ? 'v' : 'i';

  if (isSeries) {
    // Source on the left, resistor in series along the top rail.
    return (
      <svg
        viewBox="-90 -115 180 165"
        role="img"
        aria-label={`${isVoltage ? 'Voltage' : 'Current'} source in series with a resistance`}
        className={className}
      >
        <Wires points={['0,-70 -30,-70 -30,-40', '-30,0 -30,30 70,30', '40,-70 70,-70']} />
        <Source transform="translate(-30 -20) rotate(90)" />
        <Resistor transform="translate(20 -70)" />
        <Label x={-60} y={-20} letter={sourceLetter} sub={sourceSub} />
        <Label x={20} y={-92} letter="R" sub={resistorSub} />
      </svg>
    );
  }

  // Source and resistor as parallel branches between the two rails.
  return (
    <svg
      viewBox="-90 -86 195 132"
      role="img"
      aria-label={`${isVoltage ? 'Voltage' : 'Current'} source in parallel with a resistance`}
      className={className}
    >
      <Wires
        points={[
          '0,-70 -30,-70 -30,-40',
          '-30,0 -30,30 70,30',
          '40,-70 70,-70',
          '0,-70 40,-70',
          '30,-40 30,-70',
          '30,0 30,30',
          '70,-70 90,-70',
          '70,30 90,30',
        ]}
      />
      <Source transform="translate(-30 -20) rotate(90)" />
      <Resistor transform="translate(30 -20) rotate(90)" />
      <g fill="#000">
        <circle cx="30" cy="-70" r="2" />
        <circle cx="30" cy="30" r="2" />
      </g>
      <Label x={-60} y={-20} letter={sourceLetter} sub={sourceSub} />
      <Label x={60} y={-20} letter="R" sub={resistorSub} />
    </svg>
  );
}

export function CircuitChoiceTile({
  kind,
  selected,
  ariaLabel,
  description,
  onClick,
}: CircuitChoiceTileProps) {
  const { isVoltage, isSeries } = circuitKindToShape(kind);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={[
        'flex flex-col items-center justify-center rounded-lg border-2 bg-white p-3 text-left transition',
        description ? 'min-h-[190px]' : 'min-h-[164px]',
        selected
          ? 'border-[#615FFF] shadow-[0_0_0_3px_rgba(97,95,255,0.18)]'
          : 'border-[#D1D5DC] hover:border-[#99A1AF]',
      ].join(' ')}
    >
      <OptionCircuit
        isVoltage={isVoltage}
        isSeries={isSeries}
        className="h-[118px] w-full max-w-[230px]"
      />
      {description && (
        <p className="mt-2 line-clamp-2 text-center text-xs leading-4 text-[#364153]">
          {description}
        </p>
      )}
    </button>
  );
}

function circuitKindToShape(kind: CircuitOptionKind) {
  return {
    isVoltage: kind === 'voltage_series' || kind === 'voltage_parallel',
    isSeries: kind === 'voltage_series' || kind === 'current_series',
  };
}

function Wires({ points }: { points: string[] }) {
  return (
    <g stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {points.map((p) => (
        <polyline key={p} points={p} />
      ))}
    </g>
  );
}

function Label({ x, y, letter, sub }: { x: number; y: number; letter: string; sub: string }) {
  return (
    <text
      x={x}
      y={y}
      fontFamily="'Times New Roman', Georgia, serif"
      fontSize="17"
      fontStyle="italic"
      fill="#000"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {letter}
      <tspan fontSize="12" dy="4">
        {sub}
      </tspan>
    </text>
  );
}
