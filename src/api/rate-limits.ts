// Rate limiters for abuse-prone endpoints. In-memory store — sufficient for the
// single-instance deploy; swap in a Redis store before scaling to multiple instances.
// Requires app.set('trust proxy', 1) so req.ip is the client, not the Railway proxy.

import { Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { AuthRequest } from './auth/middleware';

// Limits are env-overridable; jest sets NODE_ENV=test, where limiting is off so
// supertest suites don't trip the shared in-memory buckets.
const inTest = () => process.env.NODE_ENV === 'test';

const LOGIN_MAX        = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10);       // per 15 min
const REGISTER_MAX     = Number(process.env.RATE_LIMIT_REGISTER_MAX ?? 30);    // per hour
const HINTS_MAX        = Number(process.env.RATE_LIMIT_HINTS_MAX ?? 30);       // per 15 min
const FIFTEEN_MINUTES  = 15 * 60 * 1000;
const ONE_HOUR         = 60 * 60 * 1000;

const tooMany = { error: 'Too many requests. Please wait and try again.' };

export function makeLimiter(opts: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request, res: Response) => string;
  skip?: (req: Request, res: Response) => boolean;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    keyGenerator: opts.keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany,
    skip: opts.skip ?? inTest,
  });
}

// Login is keyed by IP + normalized email: per-IP alone locks out a lab section
// behind one campus NAT; per-email alone lets an attacker rotate accounts.
// ipKeyGenerator normalizes IPv6 to its /56 so one host can't rotate within a subnet.
export const loginLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: LOGIN_MAX,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
});

// Register is per IP: generous enough for classroom onboarding behind shared NAT.
export const registerLimiter = makeLimiter({
  windowMs: ONE_HOUR,
  max: REGISTER_MAX,
});

// Hints are per student (runs after requireAuth): a hard ceiling on paid Claude
// calls, well above the legitimate per-problem hint budget in adaptive_config.
export const hintsLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: HINTS_MAX,
  keyGenerator: (req) => (req as AuthRequest).studentId,
});
