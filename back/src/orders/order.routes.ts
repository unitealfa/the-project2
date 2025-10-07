+8
-0

import { Router } from 'express';
import { updateOrderStatus } from './order.controller';

const router = Router();

router.post('/status', updateOrderStatus);

export default router;