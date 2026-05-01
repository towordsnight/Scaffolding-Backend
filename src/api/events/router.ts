import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { logEvent } from './handler';

const router = Router();

router.post('/', requireAuth, logEvent);

export default router;
