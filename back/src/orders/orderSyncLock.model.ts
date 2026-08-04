import { model, Schema } from 'mongoose';

interface IOrderSyncLock {
  _id: string;
  lockedUntil: Date;
}

const OrderSyncLockSchema = new Schema<IOrderSyncLock>(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { versionKey: false }
);

export default model<IOrderSyncLock>('OrderSyncLock', OrderSyncLockSchema);

