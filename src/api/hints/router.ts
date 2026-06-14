import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../error-handling';
import { hintsLimiter } from '../rate-limits';
import { postHint } from './handler';

const router = Router();

// hintsLimiter keys on studentId, so it must run after requireAuth.
router.post('/', requireAuth, hintsLimiter, asyncHandler(postHint));

export default router;
