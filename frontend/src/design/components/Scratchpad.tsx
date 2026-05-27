import type { ReactNode } from 'react';

/**
 * Right-hand scratchpad pane.
 *
 * Visual-only — every toolbar button is decorative. The Figma shows a tool
 * row across the top with three groups: drawing tools, zoom controls, and
 * undo/redo. Below the toolbar sits an empty white canvas filling the rest
 * of the pane.
 */
export function Scratchpad() {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[#E1E1E1] bg-white px-4">
        <div className="flex items-center gap-2">
          <PencilIcon color="#615FFF" />
          <span className="text-[14px] font-medium text-black">Scratchpad</span>
        </div>
        <button
          type="button"
          aria-label="Scratchpad settings"
          className="text-[#9CA3AF] hover:text-[#4B5563]"
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="flex h-[44px] shrink-0 items-center gap-1 border-b border-[#E1E1E1] bg-white px-3">
        <ToolGroup>
          <ToolButton label="Pencil" active>
            <PencilIcon color="#615FFF" />
          </ToolButton>
          <ToolButton label="Square">
            <SquareIcon />
          </ToolButton>
          <ToolButton label="Circle">
            <CircleIcon />
          </ToolButton>
          <ToolButton label="Triangle">
            <TriangleIcon />
          </ToolButton>
          <ToolButton label="Comment">
            <CommentIcon />
          </ToolButton>
          <ToolButton label="Text">
            <TextIcon />
          </ToolButton>
        </ToolGroup>
        <Divider />
        <ToolGroup>
          <ToolButton label="Zoom selector">
            <LoupeIcon />
          </ToolButton>
          <ToolButton label="Zoom in">
            <PlusIcon />
          </ToolButton>
          <ToolButton label="Zoom out">
            <MinusIcon />
          </ToolButton>
          <ToolButton label="Reset zoom">
            <ZoomReturnIcon />
          </ToolButton>
        </ToolGroup>
        <Divider />
        <ToolGroup>
          <ToolButton label="Undo">
            <UndoIcon />
          </ToolButton>
          <ToolButton label="Redo">
            <RedoIcon />
          </ToolButton>
        </ToolGroup>
      </div>

      <div className="min-h-0 flex-1 bg-white" aria-label="Scratchpad canvas" />
    </div>
  );
}

function ToolGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <div className="mx-2 h-5 w-px bg-[#E5E7EB]" aria-hidden="true" />;
}

function ToolButton({
  children,
  label,
  active = false,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
        active ? 'bg-[#EEF0FF] text-[#615FFF]' : 'text-[#4B5563] hover:bg-[#F3F4F6]'
      }`}
    >
      {children}
    </button>
  );
}

function PencilIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 3l3 3" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5l5.5 11h-11l5.5-11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 4a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 4v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.5 2.5V11.5H3.5A1.5 1.5 0 0 1 2 10V4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3.5h10M8 3.5v9M5.5 12.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LoupeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ZoomReturnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 7h6.5a3.5 3.5 0 0 1 0 7H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M5.5 4L3 7l2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 7H6.5a3.5 3.5 0 0 0 0 7H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M10.5 4L13 7l-2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="13" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}
