import { apiClient } from '../lib/api';

const frameChecklist = [
  'Confirm Codex/Figma access to the source file.',
  'Pick the source-of-truth frames for the first generated flow.',
  'Identify reusable design components before generation starts.',
];

export function HomeRoute() {
  return (
    <section className="panel">
      <div className="panel__content">
        <p className="panel__label">MCP Readiness</p>
        <h2>Repo setup complete, design generation still pending.</h2>
        <p className="panel__body">
          This shell keeps the frontend and backend aligned while you finish the
          Figma connection and choose the first frames to generate.
        </p>

        <dl className="meta-grid">
          <div>
            <dt>Backend URL</dt>
            <dd>{apiClient.baseUrl}</dd>
          </div>
          <div>
            <dt>Credentials Mode</dt>
            <dd>{apiClient.credentials}</dd>
          </div>
          <div>
            <dt>Frontend Port</dt>
            <dd>5173</dd>
          </div>
          <div>
            <dt>Backend Port</dt>
            <dd>3000</dd>
          </div>
        </dl>

        <ul className="checklist">
          {frameChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
