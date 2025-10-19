import { Schema } from 'mongoose';

export const ProductSchema = new Schema({
  code:      { type: String, default: '' },
  name:      { type: String, required: true },
  costPrice: { type: Number, required: true, min: 0 },
  salePrice: { type: Number, required: true, min: 0 },
  image:     { type: String, default: '' },
  variants:  [
    {
      name:     { type: String, required: true },
      quantity: { type: Number, required: true },
      // Optionnel: prix spécifiques à la variante (non utilisé pour l'instant)
      // costPrice: { type: Number, min: 0 },
      // salePrice: { type: Number, min: 0 },
    }
  ],
}, { timestamps: true });


