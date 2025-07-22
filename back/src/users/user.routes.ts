// back/src/users/user.routes.ts
import { Router } from 'express';
import {
  login,
  createUser,
  getUser,
  getAllUsers,
  updateUser,
  deleteUser,
} from './user.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';

const router = Router();

router.post('/login', login);
router.post('/create', authenticateJWT, authorizeRole(['admin']), createUser);

router
  .route('/:id')
  .get(authenticateJWT, getUser)
  .put(authenticateJWT, authorizeRole(['admin']), updateUser)
  .delete(authenticateJWT, authorizeRole(['admin']), deleteUser);

router.get('/', authenticateJWT, authorizeRole(['admin']), getAllUsers);

export default router;
