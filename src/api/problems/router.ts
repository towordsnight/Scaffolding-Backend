import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getProblem, getNextProblem, submitAnswer } from './handler';
import { getScaffold, submitStep } from './scaffold';

const router = Router();

router.get ('/next',                       requireAuth, getNextProblem);
router.get ('/:id',                        requireAuth, getProblem);
router.post('/:id/submit',                 requireAuth, submitAnswer);
router.get ('/:id/scaffold',               requireAuth, getScaffold);
router.post('/:id/steps/:stepId/submit',   requireAuth, submitStep);

export default router;
