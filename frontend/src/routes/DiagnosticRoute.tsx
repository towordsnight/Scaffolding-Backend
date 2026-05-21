export function DiagnosticRoute() {
  return (
    <section className="panel">
      <div className="panel__content">
        <p className="panel__label">Placeholder</p>
        <h2>Diagnostic Problems</h2>
        <p className="panel__body">
          Three diagnostic problems. Replace with the Figma-generated flow. Uses{' '}
          <code>onboarding.getDiagnosticProblems()</code> and{' '}
          <code>onboarding.submitDiagnostic()</code> from <code>src/lib/api.ts</code>.
        </p>
      </div>
    </section>
  );
}
