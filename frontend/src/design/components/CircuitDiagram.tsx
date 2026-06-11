import type { CircuitOverlay } from '../types';
import { CurrentSource, Resistor, VoltageSource } from './circuit-symbols';

interface CircuitDiagramProps {
  overlay?: CircuitOverlay;
  className?: string;
}

/**
 * Thévenin circuit for Homework Set 1 — single source of truth.
 *
 * Geometry is transcribed coordinate-for-coordinate from the instructor's
 * corrected CircuitPaint export (`circuitpaint-2026-04-24`): a 9 V source on
 * the left, 5 Ω / 20 Ω / 25 Ω / 60 Ω / 10 Ω resistors, a 1.8 A source in the
 * middle branch, and terminals a–b on the right. Every wire, symbol and node
 * dot uses the export's exact numbers; only the value labels are rendered as
 * plain SVG <text> instead of the export's embedded KaTeX (which mis-encoded
 * the Ω glyph).
 *
 * Both the live `ProblemRoute` and the design showcase import this component,
 * so the schematic can never drift between the two again.
 *
 * Optional `overlay` markers are re-mapped onto this geometry:
 *   - highlight_node_va        indigo marker on node Va (top-right node, term a)
 *   - highlight_terminals_ab   red bar across terminals a–b
 *   - mesh_loops / mesh_loop_1 numbered mesh-current markers
 * NOTE: overlay positions are a first pass — eyeball them against the render.
 */
export function CircuitDiagram({ overlay = 'none', className = '' }: CircuitDiagramProps) {
  return (
    <svg
      viewBox="4.67 -84.71 309.33 190.71"
      role="img"
      aria-label="Circuit diagram: 9 V source with 5, 20, 25, 60 and 10 ohm resistors and a 1.8 A source, terminals a and b"
      className={`h-48 w-full ${className}`}
    >
      <rect x="4.67" y="-84.71" width="309.33" height="190.71" fill="white" />

      {/* wiring — copied verbatim from the export */}
      <g stroke="#000" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <polyline points="60,20 60,0" />
        <polyline points="60,60 60,80 160,80" />
        <polyline points="60,0 90,0" />
        <polyline points="130,0 160,0 160,20" />
        <polyline points="160,60 160,80" />
        <polyline points="60,0 60,-50 140,-50" />
        <polyline points="160,0 180,0" />
        <polyline points="220,0 240,0 240,-50 180,-50" />
        <polyline points="160,80 180,80" />
        <polyline points="220,80 240,80 240,60" />
        <polyline points="240,20 240,0" />
        <polyline points="240,0 280,0" />
        <polyline points="240,80 280,80" />
      </g>

      {/* component symbols */}
      <VoltageSource transform="translate(60 40) rotate(90)" />
      <Resistor transform="translate(110 0)" />
      <Resistor transform="translate(160 -50)" />
      <Resistor transform="translate(160 40) rotate(90)" />
      <Resistor transform="translate(240 40) rotate(90)" />
      <Resistor transform="translate(200 80) rotate(180)" />
      <CurrentSource transform="translate(200 0) rotate(180)" />

      {/* node dots */}
      <g fill="#000">
        {NODE_DOTS.map(([x, y]) => (
          <circle key={`${x}:${y}`} cx={x} cy={y} r="2" />
        ))}
      </g>

      {/* value labels */}
      <g
        fontFamily="'Times New Roman', Georgia, serif"
        fontSize="12"
        fill="#000"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        <text x="30" y="40">9V</text>
        <text x="110" y="-10">5Ω</text>
        <text x="160" y="-60">20Ω</text>
        <text x="200" y="-20">1.8 A</text>
        <text x="180" y="40">25Ω</text>
        <text x="200" y="70">10Ω</text>
        <text x="260" y="40">60Ω</text>
        <text x="290" y="0">a</text>
        <text x="290" y="80">b</text>
      </g>

      {/* overlays (first pass — positions need a visual check) */}
      {overlay === 'highlight_terminals_ab' && (
        <line x1="300" y1="0" x2="300" y2="80" stroke="#EF4444" strokeWidth="2.5" />
      )}
      {overlay === 'highlight_node_va' && (
        <g>
          <circle cx="240" cy="0" r="9" fill="#615FFF" />
          <text
            x="240"
            y="0"
            fontSize="10"
            fontWeight="bold"
            fill="white"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            A
          </text>
        </g>
      )}
      {overlay === 'mesh_loops' && (
        <g>
          <MeshMarker cx={110} cy={40} label="1" />
          <MeshMarker cx={200} cy={40} label="2" />
          <MeshMarker cx={150} cy={-25} label="3" />
        </g>
      )}
      {overlay === 'mesh_loop_1' && <MeshMarker cx={110} cy={40} label="1" />}
    </svg>
  );
}

/** Node junction dots, copied from the export. */
const NODE_DOTS: ReadonlyArray<readonly [number, number]> = [
  [280, 0],
  [280, 80],
  [240, 80],
  [240, 0],
  [160, 0],
  [160, 80],
  [60, 0],
];

function MeshMarker({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="9" fill="#1F2937" />
      <text
        x={cx}
        y={cy}
        fontSize="11"
        fontWeight="700"
        fill="white"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}
