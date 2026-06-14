import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../error-handling';
import { listHomeworkSets } from './handler';

const router = Router();

router.get('/', requireAuth, asyncHandler(listHomeworkSets as any));

export default router;
