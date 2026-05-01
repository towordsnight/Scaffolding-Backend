import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { acceptConsent, declaration, getDiagnosticProblems, submitDiagnostic } from './handler';

const router = Router();

router.post('/consent',     requireAuth, acceptConsent);
router.post('/declaration', requireAuth, declaration);
router.get('/problems',     requireAuth, getDiagnosticProblems);
router.post('/diagnostic',  requireAuth, submitDiagnostic);

export default router;
