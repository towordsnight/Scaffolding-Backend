import type { ReactNode } from 'react';

import { ResizableSplitPane } from '../../components/ResizableSplitPane';

interface WorkspaceFrameProps {
  title?: string;
  eyebrow?: string;
  sidebar: ReactNode;
  workspace: ReactNode;
  onBack?: () => void;
  onReferences?: () => void;
  onReflection?: () => void;
}

/**
 * Top-level shell for the Homework Workspace screen.
 *
 * Layout: 73.5px header bar across the top, then a two-pane body with a
 * resizable sidebar on the left and the scratchpad filling the remaining
 * width on the right. Matches frame 22:213 in the Figma file.
 */
export function WorkspaceFrame({
  title = 'Homework Set 1',
  eyebrow = 'Task Workspace',
  sidebar,
  workspace,
  onBack,
  onReferences,
  onReflection,
}: WorkspaceFrameProps) {
  return (
    <div className="flex h-screen flex-col bg-white font-['IBM_Plex_Sans',sans-serif] text-black">
      <header className="flex h-[73.5px] shrink-0 items-center justify-between border-b border-[#E1E1E1] bg-white px-4">
        <div>
          <p className="text-[13px] leading-[19.5px] tracking-[0.025em] text-[#5D5D5D] uppercase">
            {eyebrow}
          </p>
          <h1 className="text-[22px] leading-[33px] font-bold">{title}</h1>
        </div>
        <div className="flex gap-2">
          <TopButton onClick={onBack} leadingIcon={<ChevronLeftIcon />}>
            Button
          </TopButton>
          <TopButton onClick={onReferences} leadingIcon={<BookIcon />}>
            References
          </TopButton>
          <TopButton onClick={onReflection} leadingIcon={<RefreshIcon />} accent>
            Open reflection
          </TopButton>
        </div>
      </header>
      <ResizableSplitPane
        defaultSidebarWidth={430}
        sidebar={sidebar}
        workspace={workspace}
      />
    </div>
  );
}

interface TopButtonProps {
  children: ReactNode;
  onClick?: () => void;
  leadingIcon?: ReactNode;
  accent?: boolean;
}

function TopButton({ children, onClick, leadingIcon, accent }: TopButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[40px] items-center gap-1.5 rounded-lg border px-3 text-[15px] font-medium transition ${
        accent
          ? 'border-[#615FFF] bg-white text-[#615FFF] hover:bg-[#F2F1FF]'
          : 'border-[#5D5D5D] bg-white text-[#0A0A0A] hover:bg-[#F8F9FA]'
      }`}
    >
      {leadingIcon}
      {children}
    </button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 3.5C2 2.67 2.67 2 3.5 2H7v11H3.5C2.67 13 2 13.67 2 14.5V3.5zM14 3.5c0-.83-.67-1.5-1.5-1.5H9v11h3.5c.83 0 1.5.67 1.5 1.5V3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 8a6 6 0 1 1-2-4.47M14 2v4h-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
