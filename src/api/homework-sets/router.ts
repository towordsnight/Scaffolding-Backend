import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { listHomeworkSets } from './handler';

const router = Router();

router.get('/', requireAuth, listHomeworkSets as any);

export default router;
