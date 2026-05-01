import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { getProblem, getNextProblem, submitAnswer } from './handler';

const router = Router();

router.get('/next',        requireAuth, getNextProblem);
router.get('/:id',         requireAuth, getProblem);
router.post('/:id/submit', requireAuth, submitAnswer);

export default router;
