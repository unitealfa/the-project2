import { Schema } from 'mongoose';

export const ProductSchema = new Schema({
  code:      { type: String, default: '', trim: true, maxlength: 64 },
  name:      { type: String, required: true, trim: true, maxlength: 160 },
  costPrice: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, required: true, min: 0 },
  image:     { type: String, default: '' },
  variants:  [
    {
      name:     { type: String, required: true, trim: true, maxlength: 120 },
      quantity: { type: Number, required: true },
      // Optionnel: prix spécifiques à la variante (non utilisé pour l'instant)
      // costPrice: { type: Number, min: 0 },
      // salePrice: { type: Number, min: 0 },
    }
  ],
}, { timestamps: true });

ProductSchema.index(
  { code: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { code: { $type: 'string', $gt: '' } },
  }
);
