/**
 * Shared schematic primitives, transcribed from the instructor's CircuitPaint
 * exports. Used by both the full Thévenin circuit (`CircuitDiagram`) and the
 * Step 1 answer-choice thumbnails (`OptionCircuit`) so the symbol styling is
 * identical everywhere and can never drift between copies.
 *
 * Each symbol is authored at the origin and positioned by the caller via
 * `transform` (e.g. `translate(110 0)` or `translate(160 40) rotate(90)`),
 * matching the transform groups in the source SVGs.
 */
interface SymbolProps {
  transform?: string;
}

/** Resistor — zig-zag body with two leads, drawn horizontally by default. */
export function Resistor({ transform }: SymbolProps) {
  return (
    <g transform={transform} stroke="#000" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="-12,0 -10,-4 -6,4 -2,-4 2,4 6,-4 10,4 12,0" strokeWidth="2" />
      <line x1="-20" y1="0" x2="-12" y2="0" strokeWidth="1" />
      <line x1="12" y1="0" x2="20" y2="0" strokeWidth="1" />
    </g>
  );
}

/** Independent voltage source — circle with battery plates. */
export function VoltageSource({ transform }: SymbolProps) {
  return (
    <g transform={transform} stroke="#000" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="0" r="12" fill="none" strokeWidth="2" />
      <line x1="-9" y1="0" x2="-3" y2="0" strokeWidth="1" />
      <line x1="-6" y1="-3" x2="-6" y2="3" strokeWidth="1" />
      <line x1="6" y1="-3" x2="6" y2="3" strokeWidth="1" />
      <line x1="-20" y1="0" x2="-12" y2="0" strokeWidth="1" />
      <line x1="12" y1="0" x2="20" y2="0" strokeWidth="1" />
    </g>
  );
}

/** Independent current source — circle with a direction arrow. */
export function CurrentSource({ transform }: SymbolProps) {
  return (
    <g transform={transform} stroke="#000" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="0" cy="0" r="12" fill="none" strokeWidth="2" />
      <polyline points="8,0 -8,0" fill="none" strokeWidth="1" />
      <polygon points="-4,-2 -8,0 -4,2" fill="#000" strokeWidth="1" />
      <line x1="-20" y1="0" x2="-12" y2="0" strokeWidth="1" />
      <line x1="12" y1="0" x2="20" y2="0" strokeWidth="1" />
    </g>
  );
}
