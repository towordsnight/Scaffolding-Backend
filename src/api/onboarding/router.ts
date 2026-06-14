import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../error-handling';
import { acceptConsent, declaration, getDiagnosticProblems, submitDiagnostic } from './handler';

const router = Router();

router.post('/consent',     requireAuth, asyncHandler(acceptConsent));
router.post('/declaration', requireAuth, asyncHandler(declaration));
router.get('/problems',     requireAuth, asyncHandler(getDiagnosticProblems));
router.post('/diagnostic',  requireAuth, asyncHandler(submitDiagnostic));

export default router;
