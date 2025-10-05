import { Schema } from 'mongoose';

export const OrderSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    commune: {
      type: String,
      default: '',
      trim: true,
    },
    wilayaCode: {
      type: Number,
      default: 16,
      min: 0,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      default: 'new',
      trim: true,
    },
    carrierPayload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sheetMeta: {
      lastRow: { type: Number },
      sheetId: { type: Number },
      sheetName: { type: String },
      importedAt: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

