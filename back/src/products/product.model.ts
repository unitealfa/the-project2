import { Document, model } from 'mongoose';
import { ProductSchema } from './product.schema';

export interface IProduct extends Document {
  code: string;
  name: string;
  costPrice: number;   // prix d'achat
  salePrice: number;   // prix de vente
  image: string;
  variants: Array<{
    name: string;
    quantity: number;
  }>;
}

export default model<IProduct>('Product', ProductSchema);


