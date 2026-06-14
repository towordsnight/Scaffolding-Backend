import type { PropsWithChildren } from 'react';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div>
          <p className="eyebrow">Phase 0</p>
          <h1>Frontend foundation is ready for Figma MCP</h1>
        </div>
      </header>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
