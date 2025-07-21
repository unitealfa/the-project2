// back/src/users/user.routes.ts

import { Router } from 'express';
import {
  login,
  createUser,
  getUser,
  getAllUsers     
} from './user.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole }   from '../middleware/role.middleware';

const router = Router();

router.post(
  '/login',
  login
);
router.post(
  '/create',
  authenticateJWT,
  authorizeRole(['admin']),
  createUser
);
router.get(
  '/:id',
  authenticateJWT,
  getUser
);
router.get(
  '/',                           // GET /api/users/
  authenticateJWT,
  authorizeRole(['admin']),      // Seul l’admin voit la liste
  getAllUsers                    
);

export default router;
