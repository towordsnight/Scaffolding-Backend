import type { CircuitOverlay } from '../types';

interface CircuitDiagramProps {
  overlay?: CircuitOverlay;
  className?: string;
}

/**
 * Thévenin circuit diagram for Homework Set 1.
 *
 * Reproduces the SVG used by the live `ProblemRoute` so the eventual visual
 * swap matches. Adds optional overlays driven by `overlay`:
 *  - `highlight_terminals_ab`: red bar between terminals a and b
 *  - `highlight_node_va`: indigo circle around the upper-left node
 *  - `mesh_loops`: I1/I2/I3 numbered circles in the centres of each mesh
 *  - `mesh_loop_1`: just the I1 marker
 */
export function CircuitDiagram({ overlay = 'none', className = '' }: CircuitDiagramProps) {
  return (
    <svg
      viewBox="0 0 375 192"
      role="img"
      aria-label="Circuit diagram"
      className={`h-48 w-full ${className}`}
    >
      <rect width="375" height="192" fill="white" />
      <path d="M70 45h215v105H70z" fill="none" stroke="black" strokeWidth="2" />
      <path
        d="M70 96h44m36 0h55m0-51v105M205 96h55m25 0h28"
        fill="none"
        stroke="black"
        strokeWidth="2"
      />
      <circle cx="70" cy="96" r="16" fill="white" stroke="black" strokeWidth="2" />
      <circle cx="260" cy="96" r="16" fill="white" stroke="black" strokeWidth="2" />
      <path
        d="M114 96l6-8 8 16 8-16 8 16 6-8M205 82l8 6-16 8 16 8-16 8 8 6M285 82l8 6-16 8 16 8-16 8 8 6"
        fill="none"
        stroke="black"
        strokeWidth="2"
      />
      <text x="53" y="100" fontSize="12">9V</text>
      <text x="120" y="85" fontSize="12">5Ω</text>
      <text x="196" y="75" fontSize="12">25Ω</text>
      <text x="276" y="75" fontSize="12">60Ω</text>
      <text x="220" y="42" fontSize="12">1.8 A</text>
      <text x="220" y="168" fontSize="12">10Ω</text>
      <text x="318" y="100" fontSize="13">a</text>
      <text x="318" y="154" fontSize="13">b</text>
      <text x="178" y="40" fontSize="12">20Ω</text>
      <path d="M205 150h80" fill="none" stroke="black" strokeWidth="2" />

      {(overlay === 'highlight_terminals_ab') && (
        <path d="M313 96V150" stroke="#EF4444" strokeWidth="2.5" />
      )}
      {overlay === 'highlight_node_va' && (
        <circle
          cx="150"
          cy="96"
          r="9"
          fill="#615FFF"
          stroke="#615FFF"
          strokeWidth="1.5"
        />
      )}
      {overlay === 'highlight_node_va' && (
        <text x="146" y="100" fontSize="10" fill="white" fontWeight="bold">
          1
        </text>
      )}
      {overlay === 'mesh_loops' && (
        <g>
          <MeshMarker cx={107} cy={120} label="1" />
          <MeshMarker cx={207} cy={120} label="2" />
          <MeshMarker cx={285} cy={120} label="3" />
        </g>
      )}
      {overlay === 'mesh_loop_1' && <MeshMarker cx={107} cy={120} label="1" />}
    </svg>
  );
}

function MeshMarker({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="9" fill="#1F2937" />
      <text
        x={cx}
        y={cy + 4}
        fontSize="11"
        fontWeight="700"
        fill="white"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}
