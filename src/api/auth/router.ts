import { Router } from 'express';
import { register } from './register';
import { login } from './login';
import { logout } from './logout';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

export default router;
