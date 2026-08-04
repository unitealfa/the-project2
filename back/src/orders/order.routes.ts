import { Router } from 'express';
import { syncOfficialStatuses, updateOrderStatus, updateWilayaAndCommune, getDeliveryPersons, getDeliveryPersonOrders, getDeliveryPersonHistory, generateBordereauPDF, getAllDeliveryOrders, getSheetCsv } from './order.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import {
  cronSyncOfficialStatuses,
  getCarrierActivity,
  getOrderMetadata,
  sendOrderToCarrier,
} from './orderApi.controller';

const router = Router();

const operators = authorizeRole(['admin', 'confirmateur']);
const deliveryReaders = authorizeRole(['admin', 'livreur']);

// Vercel envoie le CRON_SECRET dans Authorization; cette route ne depend pas du JWT utilisateur.
router.get('/cron/sync-statuses', cronSyncOfficialStatuses);

router.post('/send', authenticateJWT, operators, sendOrderToCarrier);
router.get('/sheet', authenticateJWT, operators, getSheetCsv);
router.post('/metadata', authenticateJWT, operators, getOrderMetadata);
router.get('/:rowId/activity', authenticateJWT, operators, getCarrierActivity);
router.post(
  '/status',
  authenticateJWT,
  authorizeRole(['admin', 'confirmateur', 'livreur']),
  updateOrderStatus
);
router.post('/wilaya-commune', authenticateJWT, operators, updateWilayaAndCommune);
router.post('/sync-statuses', authenticateJWT, operators, syncOfficialStatuses);
router.get('/delivery-persons', authenticateJWT, operators, getDeliveryPersons);
router.get('/delivery-person/orders', authenticateJWT, authorizeRole(['admin']), getAllDeliveryOrders);
router.get('/delivery-person/:deliveryPersonId/orders', authenticateJWT, deliveryReaders, getDeliveryPersonOrders);
router.get('/delivery-person/:deliveryPersonId/history', authenticateJWT, deliveryReaders, getDeliveryPersonHistory);
router.get('/bordereau/:orderId', authenticateJWT, deliveryReaders, generateBordereauPDF);

export default router;
