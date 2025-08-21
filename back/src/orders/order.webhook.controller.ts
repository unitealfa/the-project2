import { Request, Response } from 'express';
import { OrderService } from './order.service';
import { ProductService } from '../products/product.service';
import { EcotrackService } from '../services/ecotrack.service';

// Initialize services
const productService = new ProductService();
const ecotrackService = new EcotrackService({
  baseUrl: process.env.ECOTRACK_BASE_URL || 'https://api.ecotrack.dz',
  token: process.env.ECOTRACK_TOKEN || '',
});
const orderService = new OrderService(productService, ecotrackService);

export interface EcotrackWebhookPayload {
  order_id: string;
  tracking_number: string;
  status: string;
  last_update: string;
  delivery_date?: string;
  notes?: string;
}

// POST /api/orders/webhook/ecotrack
export const handleEcotrackWebhook = async (req: Request, res: Response) => {
  try {
    const payload: EcotrackWebhookPayload = req.body;
    
    console.log('Received ECOTRACK webhook:', payload);

    // Validate webhook payload
    if (!payload.order_id || !payload.tracking_number || !payload.status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Find order by order ID
    const order = await orderService.getOrderByOrderId(payload.order_id);
    if (!order) {
      console.log(`Order not found for order_id: ${payload.order_id}`);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Map ECOTRACK status to our status
    let newStatus = order.deliveryStatus;
    switch (payload.status.toLowerCase()) {
      case 'delivered':
        newStatus = 'delivered';
        break;
      case 'in_transit':
      case 'shipped':
        newStatus = 'in_transit';
        break;
      case 'failed':
      case 'returned':
        newStatus = payload.status.toLowerCase() as any;
        break;
      default:
        newStatus = 'pending';
    }

    // Update order status
    const deliveryDate = payload.delivery_date ? new Date(payload.delivery_date) : undefined;
    
    await orderService.updateOrderStatus({
      orderId: payload.order_id,
      status: newStatus,
      deliveryDate,
    });

    console.log(`Order ${payload.order_id} status updated to: ${newStatus}`);

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Error processing ECOTRACK webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook'
    });
  }
};

// POST /api/orders/webhook/verify
export const verifyWebhook = async (req: Request, res: Response) => {
  try {
    // This endpoint can be used to verify webhook configuration
    res.json({
      success: true,
      message: 'Webhook endpoint is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in webhook verification:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook verification failed'
    });
  }
};
