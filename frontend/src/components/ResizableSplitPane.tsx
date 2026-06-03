import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const MIN_SIDEBAR_WIDTH = 320;
const MIN_WORKSPACE_WIDTH = 360;

interface ResizableSplitPaneProps {
  sidebar: ReactNode;
  workspace: ReactNode;
  defaultSidebarWidth: number;
  className?: string;
}

export function ResizableSplitPane({
  sidebar,
  workspace,
  defaultSidebarWidth,
  className = '',
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [sidebarWidth, setSidebarWidth] = useState(defaultSidebarWidth);
  const [isDragging, setIsDragging] = useState(false);

  function clampSidebarWidth(next: number) {
    const container = containerRef.current;
    if (!container) return next;

    const maxSidebar = container.clientWidth - MIN_WORKSPACE_WIDTH;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(next, maxSidebar));
  }

  function updateSidebarWidth(clientX: number) {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setSidebarWidth(clampSidebarWidth(clientX - rect.left));
  }

  function handleDividerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDividerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    updateSidebarWidth(event.clientX);
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isDraggingRef.current = false;
    setIsDragging(false);
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${className}`.trim()}
    >
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-[#E1E1E1] bg-[#F8F9FA]"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize problem and scratchpad panes"
        aria-valuenow={Math.round(sidebarWidth)}
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className={[
          'relative z-10 w-1.5 shrink-0 touch-none cursor-col-resize select-none',
          isDragging ? 'bg-[#615FFF]' : 'bg-[#E1E1E1] hover:bg-[#C4C4C4]',
        ].join(' ')}
      />

      <div className="flex min-w-0 flex-1 flex-col">{workspace}</div>
    </div>
  );
}
