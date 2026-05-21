# Scaffolding-Backend

Express/TypeScript backend for the adaptive scaffold project, plus a Phase 0
frontend shell in `frontend/` that is ready for Figma-to-frontend MCP work.

## Backend

- Auth uses a JWT stored in an `httpOnly` cookie.
- Redis is used for session state.
- The backend listens on `http://localhost:3000`.
- `FRONTEND_URL` should point to the frontend origin and defaults in code to
  `http://localhost:5173`.

## Frontend Phase 0

- The frontend lives in `frontend/`.
- Stack: React + Vite + TypeScript.
- The frontend listens on `http://localhost:5173`.
- API requests are configured for cookie auth with `credentials: 'include'`.

### Local dev

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev:frontend
```

To build the frontend shell:

```bash
npm run build:frontend
```

## Figma MCP readiness

- The repo already includes a `figma` MCP server entry in `.mcp.json`.
- Confirm your Codex/Figma connection is authenticated with an account that can
  access the design file.
- Make sure source-of-truth frames have stable names before generating UI.
- Identify reusable Figma components before the first generation pass.
