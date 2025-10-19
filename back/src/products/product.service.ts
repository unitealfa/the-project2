import Product, { IProduct } from './product.model';

const normalizeText = (value: string | undefined | null): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeVariants = (
  variants: Array<{ name: string; quantity: number }> | undefined | null
): Array<{ name: string; quantity: number }> => {
  if (!Array.isArray(variants)) {
    return [];
  }

  return variants
    .map((variant) => ({
      name: typeof variant?.name === 'string' ? variant.name.trim() : '',
      quantity: Number.isFinite(Number(variant?.quantity))
        ? Number(variant?.quantity)
        : 0,
    }))
    .filter((variant) => variant.name !== '');
};

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
    const normalizedVariants = sanitizeVariants(dto.variants);
    const variantsToPersist =
      normalizedVariants.length > 0
        ? normalizedVariants
        : [{ name: 'default', quantity: 0 }];

    const product = await Product.create({
      code: dto.code ?? '',
      name: dto.name,
      costPrice: dto.costPrice,
      salePrice: dto.salePrice,
      image: dto.image ?? '',
      variants: variantsToPersist,
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
     if (dto.variants !== undefined) {
      const normalizedVariants = sanitizeVariants(dto.variants as any);
      p.variants =
        normalizedVariants.length > 0
          ? (normalizedVariants as any)
          : [{ name: 'default', quantity: 0 }] as any;
    }
    await p.save();
    return p;
  }

  async remove(id: string): Promise<void> {
    const p = await Product.findById(id);
    if (!p) throw new Error('Produit non trouvé');
    await p.deleteOne();
  }

  /** Décrémente le stock de façon atomique en s'assurant de ne pas passer sous zéro */
  async decrementVariantById(
    id: string,
    variantName: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    const product = await Product.findById(id);
    if (!product) throw new Error('Produit non trouvé');

    this.applyVariantDelta(product, variantName, -quantity, false, false);
    await product.save();
    return product;
  }

  async decrementByCodeNameVariant(
    code: string | undefined,
    name: string | undefined,
    variant: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    if (!variant) throw new Error('Variante requise');

    const product = await this.resolveProduct(code, name);
    this.applyVariantDelta(product, variant, -quantity, false, false);
    await product.save();
    return product;
  }


  async decrementByCodeNameVariantAllowZero(
    code: string | undefined,
    name: string | undefined,
    variant: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    if (!variant) throw new Error('Variante requise');

    const product = await this.resolveProduct(code, name);
    this.applyVariantDelta(product, variant, -quantity, true, true);
    await product.save();
    return product;
  }

  // Increments
  async incrementByCodeNameVariant(
    code: string | undefined,
    name: string | undefined,
    variant: string,
    quantity: number
  ): Promise<IProduct> {
    if (quantity <= 0) throw new Error('Quantité invalide');
    if (!variant) throw new Error('Variante requise');

    const product = await this.resolveProduct(code, name);
    this.applyVariantDelta(product, variant, quantity, true, false);
    await product.save();
    return product;
  }

  // plus de stock global; tout passe par variants

  private async resolveProduct(
    code: string | undefined,
    name: string | undefined
  ): Promise<IProduct> {
    const normalizedCode = code?.trim();
    const normalizedName = name?.trim();

    const filters: any[] = [];
    if (normalizedCode) {
      filters.push({ code: normalizedCode });
    }
    if (normalizedName) {
      filters.push({
        name: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i'),
      });
    }

    let product: IProduct | null = null;

    if (filters.length === 1) {
      product = await Product.findOne(filters[0]);
    } else if (filters.length > 1) {
      product = await Product.findOne({ $and: filters });
    }

    if (!product && normalizedCode) {
      product = await Product.findOne({
        code: new RegExp(`^${escapeRegex(normalizedCode)}$`, 'i'),
      });
    }

    if (!product && normalizedName) {
      const normalizedTarget = normalizeText(normalizedName);
      const candidates = await Product.find({
        name: { $regex: new RegExp(escapeRegex(normalizedName), 'i') },
      });
      product =
        candidates.find(
          (candidate) => normalizeText(candidate.name) === normalizedTarget
        ) || null;
    }

    if (!product) {
      throw new Error('Produit introuvable');
    }

    return product;
  }

  private applyVariantDelta(
    product: IProduct,
    variantName: string,
    delta: number,
    allowNegative: boolean,
    clampToZero: boolean
  ) {
    const normalizedVariant = normalizeText(variantName);
    const index = product.variants.findIndex(
      (variant) => normalizeText(variant.name) === normalizedVariant
    );

    if (index === -1) {
      throw new Error('Variante introuvable');
    }

    const currentQuantity = Number(product.variants[index].quantity) || 0;
    const nextQuantity = currentQuantity + delta;

    if (!allowNegative && nextQuantity < 0) {
      throw new Error('Stock insuffisant');
    }

    product.variants[index].quantity = clampToZero
      ? Math.max(0, nextQuantity)
      : nextQuantity;
  }
}