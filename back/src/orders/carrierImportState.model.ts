import { Document, model, Schema } from 'mongoose';
import { DeliveryApiType } from './ecotrack.client';

export interface ICarrierImportState extends Document {
  _id: DeliveryApiType;
  nextPage: number;
  lastPage?: number;
  lastCompletedAt?: Date;
}

const CarrierImportStateSchema = new Schema<ICarrierImportState>(
  {
    _id: { type: String, enum: ['api_dhd', 'api_sook'], required: true },
    nextPage: { type: Number, required: true, default: 2, min: 2 },
    lastPage: { type: Number, min: 1 },
    lastCompletedAt: { type: Date },
  },
  { timestamps: true }
);

export default model<ICarrierImportState>(
  'CarrierImportState',
  CarrierImportStateSchema
);
