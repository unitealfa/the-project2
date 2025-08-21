import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrderByOrderId,
  updateOrderStatus,
  getOrdersByStatus,
  getOrdersNeedingStockUpdate,
  syncOrderWithEcotrack,
  deleteOrder,
  getWilayas,
  getCommunes,
  trackDelivery,
} from './order.controller';

const router = Router();

// Order management routes (protected)
router
  .route('/')
  .get(authenticateJWT, getAllOrders)
  .post(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), createOrder);

router
  .route('/:id')
  .get(authenticateJWT, getOrderById)
  .delete(authenticateJWT, authorizeRole(['admin']), deleteOrder);

router
  .route('/by-order-id/:orderId')
  .get(authenticateJWT, getOrderByOrderId);

router
  .route('/:orderId/status')
  .put(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), updateOrderStatus);

router
  .route('/status/:status')
  .get(authenticateJWT, getOrdersByStatus);

router
  .route('/needing-stock-update')
  .get(authenticateJWT, getOrdersNeedingStockUpdate);

router
  .route('/:orderId/sync-ecotrack')
  .post(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), syncOrderWithEcotrack);

// ECOTRACK API routes (protected)
router
  .route('/ecotrack/wilayas')
  .get(authenticateJWT, getWilayas);

router
  .route('/ecotrack/communes/:wilayaId')
  .get(authenticateJWT, getCommunes);

router
  .route('/ecotrack/track/:trackingNumber')
  .post(authenticateJWT, trackDelivery);

export default router;
