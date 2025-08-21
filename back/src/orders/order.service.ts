import Order, { IOrder } from './order.model';
import { ProductService } from '../products/product.service';
import { EcotrackService, EcotrackOrder } from '../services/ecotrack.service';

export interface CreateOrderDto {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  wilaya: string;
  commune: string;
  products: Array<{
    productId?: string;
    productCode?: string;
    productName: string;
    variant: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  notes?: string;
}

export interface UpdateOrderStatusDto {
  orderId: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'returned';
  trackingNumber?: string;
  deliveryDate?: Date;
}

export class OrderService {
  private productService: ProductService;
  private ecotrackService: EcotrackService;

  constructor(productService: ProductService, ecotrackService: EcotrackService) {
    this.productService = productService;
    this.ecotrackService = ecotrackService;
  }

  /**
   * Create a new order and send it to ECOTRACK
   */
  async createOrder(dto: CreateOrderDto): Promise<IOrder> {
    // Check if order already exists
    const existingOrder = await Order.findOne({ orderId: dto.orderId });
    if (existingOrder) {
      throw new Error('Order already exists');
    }

    // Create order in our database
    const order = await Order.create({
      orderId: dto.orderId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerAddress: dto.customerAddress,
      wilaya: dto.wilaya,
      commune: dto.commune,
      products: dto.products,
      totalAmount: dto.totalAmount,
      notes: dto.notes,
    });

    // Send order to ECOTRACK
    try {
      const ecotrackOrder: EcotrackOrder = {
        order_id: dto.orderId,
        customer_name: dto.customerName,
        customer_phone: dto.customerPhone,
        customer_address: dto.customerAddress,
        wilaya: dto.wilaya,
        commune: dto.commune,
        products: dto.products.map(p => ({
          name: p.productName,
          quantity: p.quantity,
          price: p.price,
        })),
        total_amount: dto.totalAmount,
        notes: dto.notes,
      };

      const ecotrackResponse = await this.ecotrackService.createOrder(ecotrackOrder);
      
      // Update order with ECOTRACK information
      order.externalOrderId = ecotrackResponse.order_id;
      order.deliveryTrackingNumber = ecotrackResponse.tracking_number;
      order.deliveryStatus = 'pending';
      await order.save();

      return order;
    } catch (error) {
      console.error('Failed to create order in ECOTRACK:', error);
      // Order is still created in our database, but not in ECOTRACK
      // You might want to implement a retry mechanism here
      throw new Error('Order created but failed to send to ECOTRACK');
    }
  }

  /**
   * Get all orders
   */
  async getAllOrders(): Promise<IOrder[]> {
    return Order.find().sort({ createdAt: -1 });
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: string): Promise<IOrder> {
    const order = await Order.findById(id);
    if (!order) {
      throw new Error('Order not found');
    }
    return order;
  }

  /**
   * Get order by order ID (from Google Sheets)
   */
  async getOrderByOrderId(orderId: string): Promise<IOrder> {
    const order = await Order.findOne({ orderId });
    if (!order) {
      throw new Error('Order not found');
    }
    return order;
  }

  /**
   * Update order status and handle stock updates
   */
  async updateOrderStatus(dto: UpdateOrderStatusDto): Promise<IOrder> {
    const order = await Order.findOne({ orderId: dto.orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    const previousStatus = order.deliveryStatus;
    order.deliveryStatus = dto.status;
    order.lastStatusUpdate = new Date();

    if (dto.trackingNumber) {
      order.deliveryTrackingNumber = dto.trackingNumber;
    }

    if (dto.deliveryDate) {
      order.deliveryDate = dto.deliveryDate;
    }

    // If status changed to 'delivered' and stock hasn't been updated yet
    if (dto.status === 'delivered' && !order.stockUpdated) {
      await this.updateStockForOrder(order);
      order.stockUpdated = true;
    }

    // If status changed from 'delivered' to something else, revert stock
    if (previousStatus === 'delivered' && dto.status !== 'delivered' && order.stockUpdated) {
      await this.revertStockForOrder(order);
      order.stockUpdated = false;
    }

    await order.save();
    return order;
  }

  /**
   * Update stock for all products in an order
   */
  private async updateStockForOrder(order: IOrder): Promise<void> {
    for (const product of order.products) {
      try {
        if (product.productId) {
          // Update by product ID if available
          await this.productService.decrementVariantById(
            product.productId,
            product.variant,
            product.quantity
          );
        } else {
          // Update by code and name
          await this.productService.decrementByCodeNameVariant(
            product.productCode,
            product.productName,
            product.variant,
            product.quantity
          );
        }
        console.log(`Stock updated for product: ${product.productName} - ${product.variant}`);
      } catch (error) {
        console.error(`Failed to update stock for product: ${product.productName} - ${product.variant}`, error);
        // Continue with other products even if one fails
      }
    }
  }

  /**
   * Revert stock for all products in an order (when delivery is cancelled/failed)
   */
  private async revertStockForOrder(order: IOrder): Promise<void> {
    for (const product of order.products) {
      try {
        if (product.productId) {
          // Update by product ID if available
          await this.productService.incrementVariantById(
            product.productId,
            product.variant,
            product.quantity
          );
        } else {
          // Update by code and name
          await this.productService.incrementByCodeNameVariant(
            product.productCode,
            product.productName,
            product.variant,
            product.quantity
          );
        }
        console.log(`Stock reverted for product: ${product.productName} - ${product.variant}`);
      } catch (error) {
        console.error(`Failed to revert stock for product: ${product.productName} - ${product.variant}`, error);
        // Continue with other products even if one fails
      }
    }
  }

  /**
   * Get orders by delivery status
   */
  async getOrdersByStatus(status: string): Promise<IOrder[]> {
    return Order.find({ deliveryStatus: status }).sort({ createdAt: -1 });
  }

  /**
   * Get orders that need stock updates
   */
  async getOrdersNeedingStockUpdate(): Promise<IOrder[]> {
    return Order.find({ 
      deliveryStatus: 'delivered', 
      stockUpdated: false 
    }).sort({ createdAt: -1 });
  }

  /**
   * Sync order status with ECOTRACK
   */
  async syncOrderStatusWithEcotrack(orderId: string): Promise<IOrder> {
    const order = await Order.findOne({ orderId });
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.deliveryTrackingNumber) {
      throw new Error('No tracking number available');
    }

    try {
      const statusResponse = await this.ecotrackService.getOrderStatus(order.deliveryTrackingNumber);
      
      // Map ECOTRACK status to our status
      let newStatus = order.deliveryStatus;
      switch (statusResponse.status.toLowerCase()) {
        case 'delivered':
          newStatus = 'delivered';
          break;
        case 'in_transit':
        case 'shipped':
          newStatus = 'in_transit';
          break;
        case 'failed':
        case 'returned':
          newStatus = statusResponse.status.toLowerCase() as any;
          break;
        default:
          newStatus = 'pending';
      }

      if (newStatus !== order.deliveryStatus) {
        await this.updateOrderStatus({
          orderId: order.orderId,
          status: newStatus,
        });
      }

      return order;
    } catch (error) {
      console.error('Failed to sync order status with ECOTRACK:', error);
      throw new Error('Failed to sync order status with ECOTRACK');
    }
  }

  /**
   * Delete order
   */
  async deleteOrder(id: string): Promise<void> {
    const order = await Order.findById(id);
    if (!order) {
      throw new Error('Order not found');
    }

    // If order was delivered and stock was updated, revert the stock
    if (order.deliveryStatus === 'delivered' && order.stockUpdated) {
      await this.revertStockForOrder(order);
    }

    await order.deleteOne();
  }
}
