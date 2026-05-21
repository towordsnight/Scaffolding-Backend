import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRouter from './api/auth/router';
import eventsRouter from './api/events/router';
import onboardingRouter from './api/onboarding/router';
import problemsRouter from './api/problems/router';
import sessionsRouter from './api/sessions/router';
import hintsRouter from './api/hints/router';
import homeworkSetsRouter from './api/homework-sets/router';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY env var is required');
}

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth',       authRouter);
app.use('/api/events',     eventsRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/problems',   problemsRouter);
app.use('/api/sessions',   sessionsRouter);
app.use('/api/hints',         hintsRouter);
app.use('/api/homework-sets', homeworkSetsRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
