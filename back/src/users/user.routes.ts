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

const router = Router();

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-code', verifyCode);
router.post('/create', authenticateJWT, authorizeRole(['admin']), createUser);

router
  .route('/:id')
  .get(authenticateJWT, getUser)
  .put(authenticateJWT, authorizeRole(['admin']), updateUser)
  .delete(authenticateJWT, authorizeRole(['admin']), deleteUser);

router.get('/', authenticateJWT, authorizeRole(['admin']), getAllUsers);

export default router;