import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { createSession, heartbeat, getSessionState } from './handler';

const router = Router();

router.post('/',                requireAuth, createSession);
router.get('/:id',              requireAuth, getSessionState);
router.post('/:id/heartbeat',   requireAuth, heartbeat);

export default router;
