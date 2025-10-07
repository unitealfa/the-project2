import { Router } from 'express';
import OrderController from './order.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';

const router = Router();
const controller = new OrderController();

router.post('/import', controller.importFromSheet);

router.get(
  '/',
  authenticateJWT,
  authorizeRole(['admin', 'confirmateur', 'gestionnaire']),
  controller.list
);

router.patch(
  '/:id/status',
  authenticateJWT,
  authorizeRole(['admin', 'confirmateur', 'gestionnaire']),
  controller.updateStatus
);

export default router;

