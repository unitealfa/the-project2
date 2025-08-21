import { Router } from 'express';
import {
  handleEcotrackWebhook,
  verifyWebhook,
} from './order.webhook.controller';

const router = Router();

// Webhook endpoints (no authentication required for ECOTRACK webhooks)
router
  .route('/ecotrack')
  .post(handleEcotrackWebhook);

router
  .route('/verify')
  .post(verifyWebhook);

export default router;
