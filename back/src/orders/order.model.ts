import { Document, model } from 'mongoose';
import { OrderSchema } from './order.schema';

export interface IOrder extends Document {
  reference: string;
  customerName: string;
  phone: string;
  address: string;
  commune: string;
  wilayaCode: number;
  amount: number;
  status: string;
  carrierPayload: Record<string, any>;
  sheetMeta?: {
    lastRow?: number;
    sheetId?: number;
    sheetName?: string;
    importedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export default model<IOrder>('Order', OrderSchema);

