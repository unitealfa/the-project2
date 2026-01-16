import { Router } from 'express';
import { syncOfficialStatuses, updateOrderStatus, updateWilayaAndCommune, getDeliveryPersons, getDeliveryPersonOrders, getDeliveryPersonHistory, generateBordereauPDF, getAllDeliveryOrders } from './order.controller';

const router = Router();

router.post('/status', updateOrderStatus);
router.post('/wilaya-commune', updateWilayaAndCommune);
router.post('/sync-statuses', syncOfficialStatuses);
router.get('/delivery-persons', getDeliveryPersons);
router.get('/delivery-person/orders', getAllDeliveryOrders);
router.get('/delivery-person/:deliveryPersonId/orders', getDeliveryPersonOrders);
router.get('/delivery-person/:deliveryPersonId/history', getDeliveryPersonHistory);
router.get('/bordereau/:orderId', generateBordereauPDF);

export default router;
