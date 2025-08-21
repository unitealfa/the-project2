import { Request, Response } from 'express';
import { OrderService, CreateOrderDto, UpdateOrderStatusDto } from './order.service';
import { ProductService } from '../products/product.service';
import { EcotrackService } from '../services/ecotrack.service';

// Initialize services
const productService = new ProductService();
const ecotrackService = new EcotrackService({
  baseUrl: process.env.ECOTRACK_BASE_URL || 'https://api.ecotrack.dz',
  token: process.env.ECOTRACK_TOKEN || '',
});
const orderService = new OrderService(productService, ecotrackService);

// POST /api/orders
export const createOrder = async (req: Request, res: Response) => {
  try {
    const orderData: CreateOrderDto = req.body;
    const order = await orderService.createOrder(orderData);
    res.status(201).json({
      success: true,
      data: order,
      message: 'Order created successfully and sent to ECOTRACK'
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create order'
    });
  }
};

// GET /api/orders
export const getAllOrders = async (_req: Request, res: Response) => {
  try {
    const orders = await orderService.getAllOrders();
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// GET /api/orders/:id
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(404).json({
      success: false,
      message: error instanceof Error ? error.message : 'Order not found'
    });
  }
};

// GET /api/orders/by-order-id/:orderId
export const getOrderByOrderId = async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderByOrderId(req.params.orderId);
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(404).json({
      success: false,
      message: error instanceof Error ? error.message : 'Order not found'
    });
  }
};

// PUT /api/orders/:orderId/status
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const statusData: UpdateOrderStatusDto = {
      orderId: req.params.orderId,
      ...req.body
    };
    const order = await orderService.updateOrderStatus(statusData);
    res.json({
      success: true,
      data: order,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update order status'
    });
  }
};

// GET /api/orders/status/:status
export const getOrdersByStatus = async (req: Request, res: Response) => {
  try {
    const orders = await orderService.getOrdersByStatus(req.params.status);
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders by status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders by status'
    });
  }
};

// GET /api/orders/needing-stock-update
export const getOrdersNeedingStockUpdate = async (_req: Request, res: Response) => {
  try {
    const orders = await orderService.getOrdersNeedingStockUpdate();
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders needing stock update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders needing stock update'
    });
  }
};

// POST /api/orders/:orderId/sync-ecotrack
export const syncOrderWithEcotrack = async (req: Request, res: Response) => {
  try {
    const order = await orderService.syncOrderStatusWithEcotrack(req.params.orderId);
    res.json({
      success: true,
      data: order,
      message: 'Order status synced with ECOTRACK successfully'
    });
  } catch (error) {
    console.error('Error syncing order with ECOTRACK:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to sync order with ECOTRACK'
    });
  }
};

// DELETE /api/orders/:id
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    await orderService.deleteOrder(req.params.id);
    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete order'
    });
  }
};

// ECOTRACK API endpoints

// GET /api/ecotrack/wilayas
export const getWilayas = async (_req: Request, res: Response) => {
  try {
    const wilayas = await ecotrackService.getWilayas();
    res.json({
      success: true,
      data: wilayas
    });
  } catch (error) {
    console.error('Error fetching wilayas:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wilayas from ECOTRACK'
    });
  }
};

// GET /api/ecotrack/communes/:wilayaId
export const getCommunes = async (req: Request, res: Response) => {
  try {
    const wilayaId = parseInt(req.params.wilayaId);
    if (isNaN(wilayaId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wilaya ID'
      });
    }
    const communes = await ecotrackService.getCommunes(wilayaId);
    res.json({
      success: true,
      data: communes
    });
  } catch (error) {
    console.error('Error fetching communes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch communes from ECOTRACK'
    });
  }
};

// POST /api/ecotrack/track/:trackingNumber
export const trackDelivery = async (req: Request, res: Response) => {
  try {
    const trackingData = await ecotrackService.trackDelivery(req.params.trackingNumber);
    res.json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    console.error('Error tracking delivery:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track delivery from ECOTRACK'
    });
  }
};
