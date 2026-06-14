import { Router } from 'express';
import { asyncHandler } from '../error-handling';
import { loginLimiter, registerLimiter } from '../rate-limits';
import { register } from './register';
import { login } from './login';
import { logout } from './logout';

const router = Router();

router.post('/register', registerLimiter, asyncHandler(register));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/logout', asyncHandler(logout));

export default router;
