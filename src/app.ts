import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';

import { errorHandler } from './api/error-handling';
import authRouter from './api/auth/router';
import eventsRouter from './api/events/router';
import onboardingRouter from './api/onboarding/router';
import problemsRouter from './api/problems/router';
import sessionsRouter from './api/sessions/router';
import hintsRouter from './api/hints/router';
import homeworkSetsRouter from './api/homework-sets/router';

const app = express();

// One proxy hop (Railway) terminates TLS in front of us. Without this, req.ip is
// the proxy's address: rate limits would share one bucket across all users and
// the consent log would hash the proxy IP instead of the client's.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',         authRouter);
app.use('/api/events',       eventsRouter);
app.use('/api/onboarding',   onboardingRouter);
app.use('/api/problems',     problemsRouter);
app.use('/api/sessions',     sessionsRouter);
app.use('/api/hints',        hintsRouter);
app.use('/api/homework-sets', homeworkSetsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Serve the built frontend only outside test mode to avoid requiring a built dist.
if (process.env.NODE_ENV !== 'test') {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Must be last: catches errors forwarded by asyncHandler from any route.
app.use(errorHandler);

export default app;
