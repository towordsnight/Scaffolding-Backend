import type { McqStepDef, StepState } from '../../types';

interface McqStepProps {
  step: McqStepDef;
  state: StepState;
}

export function McqStep({ step, state }: McqStepProps) {
  const selectedIndex =
    state === 'filled' ? step.filled.selectedIndex
      : state === 'checked' ? step.checked.selectedIndex
        : undefined;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {step.options.map((option, index) => (
        <CircuitOptionTile
          key={option.key}
          kind={option.kind}
          selected={selectedIndex === index}
        />
      ))}
    </div>
  );
}

function CircuitOptionTile({
  kind,
  selected,
}: {
  kind: 'voltage_series' | 'current_series' | 'current_parallel' | 'voltage_parallel';
  selected: boolean;
}) {
  const isVoltage = kind === 'voltage_series' || kind === 'voltage_parallel';
  const isSeries = kind === 'voltage_series' || kind === 'current_series';

  return (
    <div
      className={`flex items-center justify-center rounded-lg border-2 bg-white p-2 transition ${
        selected ? 'border-[#615FFF] shadow-[0_0_0_3px_rgba(97,95,255,0.18)]' : 'border-[#E5E7EB]'
      }`}
    >
      <svg viewBox="0 0 150 92" aria-hidden="true" className="h-[64px] w-full">
        {isSeries ? (
          <>
            <path d="M24 65h90M24 28h30m42 0h18M75 28v37" stroke="black" strokeWidth="1.5" fill="none" />
            <SourceSymbol x={24} y={46} voltage={isVoltage} />
            <Resistor x={56} y={28} horizontal />
            <text x="58" y="19" fontSize="10">{isVoltage ? 'RTH' : 'RN'}</text>
            <text x="15" y="49" fontSize="10">{isVoltage ? 'vTH' : 'iN'}</text>
          </>
        ) : (
          <>
            <path d="M32 20h92M32 72h92M72 20v52M98 20v52" stroke="black" strokeWidth="1.5" fill="none" />
            <SourceSymbol x={32} y={46} voltage={isVoltage} />
            <Resistor x={98} y={27} />
            <text x="104" y="51" fontSize="10">{isVoltage ? 'RTH' : 'RN'}</text>
            <text x="18" y="49" fontSize="10">{isVoltage ? 'vTH' : 'iN'}</text>
          </>
        )}
      </svg>
    </div>
  );
}

function SourceSymbol({ x, y, voltage }: { x: number; y: number; voltage: boolean }) {
  return (
    <>
      <circle cx={x} cy={y} r="12" fill="white" stroke="black" strokeWidth="1.5" />
      {voltage ? (
        <path
          d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`}
          stroke="black"
          strokeWidth="1.2"
        />
      ) : (
        <path
          d={`M${x} ${y + 7}V${y - 7}m-5 5 5-5 5 5`}
          fill="none"
          stroke="black"
          strokeWidth="1.2"
        />
      )}
    </>
  );
}

function Resistor({ x, y, horizontal }: { x: number; y: number; horizontal?: boolean }) {
  if (horizontal) {
    return (
      <path
        d={`M${x} ${y}l5-7 5 14 5-14 5 14 5-14 5 7`}
        fill="none"
        stroke="black"
        strokeWidth="1.5"
      />
    );
  }
  return (
    <path
      d={`M${x} ${y}l-7 5 14 5-14 5 14 5-14 5 7 5`}
      fill="none"
      stroke="black"
      strokeWidth="1.5"
    />
  );
}
