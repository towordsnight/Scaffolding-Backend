import { useParams } from 'react-router-dom';

export function ProblemRoute() {
  const { id } = useParams<{ id: string }>();
  return (
    <section className="panel">
      <div className="panel__content">
        <p className="panel__label">Placeholder</p>
        <h2>Problem {id}</h2>
        <p className="panel__body">
          Replace with the Figma-generated problem viewer. Uses{' '}
          <code>problems.get(id)</code>, <code>sessions.create()</code>, and{' '}
          <code>problems.submit()</code> from <code>src/lib/api.ts</code>.
        </p>
      </div>
    </section>
  );
}
