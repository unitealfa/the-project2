import { Document, model, Schema } from 'mongoose';

export interface IOrder extends Document {
  rowId: string;
  status: string;
  tracking?: string;
  deliveryType: 'api_dhd' | 'api_sook' | 'livreur';
  deliveryPersonId?: string; // ID du livreur si deliveryType = 'livreur'
  deliveryPersonName?: string; // Nom du livreur pour affichage
  createdAt: Date;
  updatedAt: Date;
  row?: Record<string, unknown>;
  carrierStatus?: string;
  carrierStatusUpdatedAt?: Date;
  carrierValidatedAt?: Date;
  lastSyncAttemptAt?: Date;
  lastSyncError?: string;
  stockAdjustmentState?: StockAdjustmentState;
  stockDebitedAt?: Date;
  stockRestoredAt?: Date;
  sendInProgressUntil?: Date;
}

export type StockAdjustmentState = 'not_debited' | 'debited' | 'restored';

const OrderSchema = new Schema({
  rowId: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  status: { type: String, required: true, trim: true, maxlength: 100 },
  tracking: { type: String, trim: true, maxlength: 100 },
  deliveryType: { 
    type: String, 
    required: true, 
    enum: ['api_dhd', 'api_sook', 'livreur'],
    default: 'api_dhd'
  },
  deliveryPersonId: { type: String, maxlength: 64 },
  deliveryPersonName: { type: String, maxlength: 170 },
  row: { type: Schema.Types.Mixed },
  carrierStatus: { type: String, maxlength: 160 },
  carrierStatusUpdatedAt: { type: Date },
  carrierValidatedAt: { type: Date },
  lastSyncAttemptAt: { type: Date },
  lastSyncError: { type: String, maxlength: 500 },
  stockAdjustmentState: {
    type: String,
    enum: ['not_debited', 'debited', 'restored'],
    default: 'not_debited',
  },
  stockDebitedAt: { type: Date },
  stockRestoredAt: { type: Date },
  sendInProgressUntil: { type: Date }
}, {
  timestamps: true
});

export default model<IOrder>('OrderDelivery', OrderSchema);
