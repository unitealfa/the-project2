import { Router } from 'express';
import { syncOfficialStatuses, updateOrderStatus } from './order.controller';

const router = Router();

router.post('/status', updateOrderStatus);
router.post('/sync-statuses', syncOfficialStatuses);

export default router;