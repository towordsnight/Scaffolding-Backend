import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../error-handling';
import { getProblem, getNextProblem, submitAnswer } from './handler';
import { getScaffold, submitStep } from './scaffold';

const router = Router();

router.get ('/next',                       requireAuth, asyncHandler(getNextProblem));
router.get ('/:id',                        requireAuth, asyncHandler(getProblem));
router.post('/:id/submit',                 requireAuth, asyncHandler(submitAnswer));
router.get ('/:id/scaffold',               requireAuth, asyncHandler(getScaffold));
router.post('/:id/steps/:stepId/submit',   requireAuth, asyncHandler(submitStep));

export default router;
