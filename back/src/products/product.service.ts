import Product, { IProduct } from './product.model';

export interface CreateProductDto {
  code?: string;
  name: string;
  costPrice: number;
  salePrice: number;
  image?: string;
  variants: Array<{ name: string; quantity: number }>;
}

export class ProductService {
  async create(dto: CreateProductDto): Promise<IProduct> {
    const normalizedVariants = Array.isArray(dto.variants) && dto.variants.length > 0
      ? dto.variants
      : [{ name: 'default', quantity: 0 }];

    const product = await Product.create({
      code: dto.code ?? '',
      name: dto.name,
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      image: dto.image ?? '',
      variants: normalizedVariants,
    });
    return product;
  }

  async list(): Promise<IProduct[]> {
    return Product.find().sort({ createdAt: -1 });
  }

  async getById(id: string): Promise<IProduct> {
    const p = await Product.findById(id);
    if (!p) throw new Error('Produit non trouvé');
    return p;
  }

  async update(id: string, dto: Partial<CreateProductDto>): Promise<IProduct> {
    const p = await Product.findById(id);
    if (!p) throw new Error('Produit non trouvé');
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.code !== undefined) p.code = dto.code;
    if (dto.costPrice !== undefined) p.costPrice = dto.costPrice;
    if (dto.salePrice !== undefined) p.salePrice = dto.salePrice;
    if (dto.image !== undefined) p.image = dto.image;
    if (dto.variants !== undefined) p.variants = dto.variants as any;
    await p.save();
    return p;
  }

  async remove(id: string): Promise<void> {
    const p = await Product.findById(id);
    if (!p) throw new Error('Produit non trouvé');
    await p.deleteOne();
  }

  /** Décrémente le stock de façon atomique en s'assurant de ne pas passer sous zéro */
  async decrementVariantById(id: string, variantName: string, quantity: number): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    const updated = await Product.findOneAndUpdate(
      { _id: id, 'variants.name': variantName, 'variants.quantity': { $gte: quantity } },
      { $inc: { 'variants.$.quantity': -quantity } },
      { new: true }
    );
    if (!updated) throw new Error('Stock insuffisant ou variante introuvable');
    return updated as IProduct;
  }

  async decrementByCodeNameVariant(
    code: string | undefined,
    name: string | undefined,
    variant: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    const base: any = {};
    if (code) base.code = code;
    if (name) base.name = name;
    if (!variant) throw new Error('Variante requise');
    const updated = await Product.findOneAndUpdate(
      { ...base, 'variants.name': variant, 'variants.quantity': { $gte: quantity } },
      { $inc: { 'variants.$.quantity': -quantity } },
      { new: true }
    );
    if (!updated) throw new Error('Stock insuffisant ou variante introuvable');
    return updated as IProduct;
  }

  // Increments
  async incrementByCodeNameVariant(
    code: string | undefined,
    name: string | undefined,
    variant: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    const base: any = {};
    if (code) base.code = code;
    if (name) base.name = name;
    if (!variant) throw new Error('Variante requise');
    const updated = await Product.findOneAndUpdate(
      { ...base, 'variants.name': variant },
      { $inc: { 'variants.$.quantity': quantity } },
      { new: true }
    );
    if (!updated) throw new Error('Variante introuvable');
    return updated as IProduct;
  }

  // plus de stock global; tout passe par variants
}


