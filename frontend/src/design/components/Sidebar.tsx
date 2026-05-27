import type { ReactNode } from 'react';

import { TOTAL_STEPS } from '../mockSteps';
import type { CircuitOverlay } from '../types';
import { CircuitDiagram } from './CircuitDiagram';

interface SidebarProps {
  stepNumber: number;
  circuitOverlay?: CircuitOverlay;
  goalText?: string;
  stepCard: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  onMarkComplete?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function Sidebar({
  stepNumber,
  circuitOverlay = 'none',
  goalText = 'Find the Thévenin equivalent at terminals a, b.',
  stepCard,
  onPrev,
  onNext,
  onMarkComplete,
  isFirst = false,
  isLast = false,
}: SidebarProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="text-[14px] font-medium tracking-[0.05em] text-[#5D5D5D] uppercase">
          Step {stepNumber}/{TOTAL_STEPS}
        </p>
        <button
          type="button"
          onClick={onMarkComplete}
          className="h-[38px] rounded-lg bg-[#A4A1FF] px-4 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#8C8AF5]"
        >
          Mark complete
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <PanelLabel icon={<TagIcon />}>Problem</PanelLabel>
        <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-3 shadow-sm">
          <CircuitDiagram overlay={circuitOverlay} />
        </div>
        <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-3 shadow-sm">
          <p className="text-[14px] leading-[22.75px]">
            <span className="font-bold text-black uppercase">Goal:</span>{' '}
            <span className="text-[#1E2939]">{goalText}</span>
          </p>
        </div>

        <PanelLabel icon={<TagIcon />}>Step output</PanelLabel>
        {stepCard}
      </div>

      <div className="border-t border-[#E1E1E1] bg-[#F8F9FA] px-8 py-4">
        <div className="grid grid-cols-2 gap-3">
          <NavButton onClick={onPrev} disabled={isFirst} direction="prev">
            Previous
          </NavButton>
          <NavButton onClick={onNext} disabled={isLast} direction="next">
            Next
          </NavButton>
        </div>
      </div>
    </>
  );
}

function PanelLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[14px] leading-[21px] text-[#1E2939]">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function NavButton({
  children,
  onClick,
  disabled,
  direction,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  direction: 'prev' | 'next';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[43px] items-center justify-center gap-1.5 rounded-[10px] border border-[#E1E1E1] bg-white text-sm font-semibold text-[#364153] shadow-sm transition hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {direction === 'prev' && <ChevronIcon direction="left" />}
      {children}
      {direction === 'next' && <ChevronIcon direction="right" />}
    </button>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M10 12L6 8L10 4' : 'M6 4L10 8L6 12';
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3.5C2 2.67 2.67 2 3.5 2H8l6 6-4.5 4.5L3.5 6V3.5z"
        stroke="#1E2939"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="5.5" r="0.8" fill="#1E2939" />
    </svg>
  );
}
