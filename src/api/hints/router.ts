import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { postHint } from './handler';

const router = Router();

router.post('/', requireAuth, postHint);

export default router;
