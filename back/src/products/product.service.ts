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

const sanitizeVariants = (
  variants: Array<{ name: string; quantity: number }> | undefined | null
): Array<{ name: string; quantity: number }> => {
  if (!Array.isArray(variants)) return [];
  const normalized = variants
    .map((variant) => ({
      name: typeof variant?.name === 'string' ? variant.name.trim() : '',
      quantity: Number(variant?.quantity),
    }))
    .filter((variant) => variant.name !== '');

  const seen = new Set<string>();
  for (const variant of normalized) {
    const key = normalizeText(variant.name);
    if (seen.has(key)) throw new Error(`Variante dupliquée: ${variant.name}`);
    if (
      !Number.isSafeInteger(variant.quantity) ||
      Math.abs(variant.quantity) > 1_000_000
    ) {
      throw new Error(`Quantité invalide pour la variante ${variant.name}`);
    }
    seen.add(key);
  }
  return normalized;
};

export interface CreateProductDto {
  code?: string;
  name: string;
  costPrice: number;
  salePrice: number;
  image?: string;
  variants: Array<{ name: string; quantity: number }>;
}

const sanitizeProductInput = (
  dto: Partial<CreateProductDto>,
  requireAll: boolean
): Partial<CreateProductDto> => {
  const result: Partial<CreateProductDto> = {};
  if (requireAll || dto.name !== undefined) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name || name.length > 160) throw new Error('Nom de produit invalide');
    result.name = name;
  }
  if (requireAll || dto.code !== undefined) {
    const code = typeof dto.code === 'string' ? dto.code.trim() : '';
    if (code.length > 64) throw new Error('Code produit invalide');
    result.code = code;
  }
  for (const field of ['costPrice', 'salePrice'] as const) {
    if (requireAll || dto[field] !== undefined) {
      const value = Number(dto[field]);
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
        throw new Error(
          `${field === 'costPrice' ? 'Prix d’achat' : 'Prix de vente'} invalide`
        );
      }
      result[field] = value;
    }
  }
  if (dto.image !== undefined) {
    const image = typeof dto.image === 'string' ? dto.image.trim() : '';
    if (
      image &&
      !/^\/uploads\/[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(image) &&
      !/^https:\/\/[^\s]+$/i.test(image)
    ) {
      throw new Error('Adresse d’image invalide');
    }
    result.image = image;
  }
  if (dto.variants !== undefined) result.variants = sanitizeVariants(dto.variants);
  return result;
};

export class ProductService {
  async create(dto: CreateProductDto): Promise<IProduct> {
    const clean = sanitizeProductInput(dto, true) as CreateProductDto;
    const variants = sanitizeVariants(clean.variants);
    return Product.create({
      code: clean.code ?? '',
      name: clean.name,
      costPrice: clean.costPrice,
      salePrice: clean.salePrice,
      image: clean.image ?? '',
      variants: variants.length > 0 ? variants : [{ name: 'default', quantity: 0 }],
    });
  }

  async list(): Promise<IProduct[]> {
    return Product.find().sort({ createdAt: -1 });
  }

  async getById(id: string): Promise<IProduct> {
    const product = await Product.findById(id);
    if (!product) throw new Error('Produit non trouvé');
    return product;
  }

  async update(
    id: string,
    dto: Partial<CreateProductDto> | Record<string, unknown>
  ): Promise<IProduct> {
    const clean = sanitizeProductInput(dto as Partial<CreateProductDto>, false);
    const product = await Product.findById(id);
    if (!product) throw new Error('Produit non trouvé');
    if (clean.name !== undefined) product.name = clean.name;
    if (clean.code !== undefined) product.code = clean.code;
    if (clean.costPrice !== undefined) product.costPrice = clean.costPrice;
    if (clean.salePrice !== undefined) product.salePrice = clean.salePrice;
    if (clean.image !== undefined) product.image = clean.image;
    if (clean.variants !== undefined) {
      const variants = sanitizeVariants(clean.variants);
      product.variants = (variants.length > 0
        ? variants
        : [{ name: 'default', quantity: 0 }]) as IProduct['variants'];
    }
    await product.save();
    return product;
  }

  async remove(id: string): Promise<string> {
    const product = await Product.findById(id);
    if (!product) throw new Error('Produit non trouvé');
    const image = product.image;
    await product.deleteOne();
    return image;
  }
}
