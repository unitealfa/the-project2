import { Schema } from 'mongoose';

export const OrderSchema = new Schema({
  // Order identification
  orderId: { type: String, required: true, unique: true }, // ID from Google Sheets
  externalOrderId: { type: String }, // ECOTRACK order ID
  
  // Customer information
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String, required: true },
  wilaya: { type: String, required: true },
  commune: { type: String, required: true },
  
  // Order details
  products: [{
    productId: { type: String }, // Our product ID
    productCode: { type: String }, // Product code from sheet
    productName: { type: String, required: true },
    variant: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  }],
  
  // Delivery information
  deliveryStatus: {
    type: String,
    enum: ['pending', 'in_transit', 'delivered', 'failed', 'returned'],
    default: 'pending'
  },
  deliveryTrackingNumber: { type: String },
  deliveryCompany: { type: String, default: 'ECOTRACK' },
  
  // Timestamps
  orderDate: { type: Date, default: Date.now },
  deliveryDate: { type: Date },
  lastStatusUpdate: { type: Date, default: Date.now },
  
  // Stock management
  stockUpdated: { type: Boolean, default: false },
  
  // Additional fields
  totalAmount: { type: Number, required: true, min: 0 },
  notes: { type: String },
  
}, { timestamps: true });

// Index for efficient queries
OrderSchema.index({ orderId: 1 });
OrderSchema.index({ externalOrderId: 1 });
OrderSchema.index({ deliveryStatus: 1 });
OrderSchema.index({ stockUpdated: 1 });
