import mongoose, { Document } from 'mongoose';
import { OrderSchema } from './order.schema';

export interface IOrder extends Document {
  orderId: string;
  externalOrderId?: string;
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
  deliveryStatus: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'returned';
  deliveryTrackingNumber?: string;
  deliveryCompany: string;
  orderDate: Date;
  deliveryDate?: Date;
  lastStatusUpdate: Date;
  stockUpdated: boolean;
  totalAmount: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const Order = mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
