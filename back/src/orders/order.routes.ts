import { Router } from 'express';
import { syncOfficialStatuses, updateOrderStatus, getDeliveryPersons, getDeliveryPersonOrders, generateBordereauPDF } from './order.controller';

const router = Router();

router.post('/status', updateOrderStatus);
router.post('/sync-statuses', syncOfficialStatuses);
router.get('/delivery-persons', getDeliveryPersons);
router.get('/delivery-person/:deliveryPersonId/orders', getDeliveryPersonOrders);
router.get('/bordereau/:orderId', generateBordereauPDF);

export default router;