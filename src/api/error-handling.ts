// Async error plumbing for Express 4, which does not catch rejected promises
// from async route handlers on its own.

import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

// Wraps an async handler so any rejection reaches Express error middleware
// instead of becoming an unhandledRejection (which kills the process on Node 20).
export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Global error middleware — must be registered after all routes.
// Logs the full error server-side; clients get a generic message only,
// never internal details (query text, stack traces, env state).
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[error] ${req.method} ${req.path}:`, err);

  // Mid-stream failure (e.g. SSE hints): status/JSON can no longer be sent.
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
