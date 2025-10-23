import { Document, model, Schema } from 'mongoose';

export interface IOrder extends Document {
  rowId: string;
  status: string;
  tracking?: string;
  deliveryType: 'api_dhd' | 'livreur';
  deliveryPersonId?: string; // ID du livreur si deliveryType = 'livreur'
  deliveryPersonName?: string; // Nom du livreur pour affichage
  createdAt: Date;
  updatedAt: Date;
  row?: Record<string, unknown>;
}

const OrderSchema = new Schema({
  rowId: { type: String, required: true },
  status: { type: String, required: true },
  tracking: { type: String },
  deliveryType: { 
    type: String, 
    required: true, 
    enum: ['api_dhd', 'livreur'],
    default: 'api_dhd'
  },
  deliveryPersonId: { type: String },
  deliveryPersonName: { type: String },
  row: { type: Schema.Types.Mixed }
}, {
  timestamps: true
});

export default model<IOrder>('Order', OrderSchema);
