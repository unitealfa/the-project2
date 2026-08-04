// back/src/users/user.routes.ts
import { Router } from 'express';
import {
  login,
  forgotPassword,
  createUser,
  getUser,
  getAllUsers,
  updateUser,
  deleteUser,
  verifyCode,
} from './user.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { createRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post(
  '/login',
  createRateLimiter({ namespace: 'login', windowMs: 15 * 60_000, max: 10 }),
  login
);
router.post(
  '/forgot-password',
  createRateLimiter({ namespace: 'password-reset', windowMs: 60 * 60_000, max: 3 }),
  forgotPassword
);
router.post(
  '/verify-code',
  createRateLimiter({ namespace: 'verify-code', windowMs: 15 * 60_000, max: 10 }),
  verifyCode
);
router.post('/create', authenticateJWT, authorizeRole(['admin']), createUser);

router
  .route('/:id')
  .get(authenticateJWT, getUser)
  .put(authenticateJWT, authorizeRole(['admin']), updateUser)
  .delete(authenticateJWT, authorizeRole(['admin']), deleteUser);

router.get('/', authenticateJWT, authorizeRole(['admin']), getAllUsers);

export default router;
