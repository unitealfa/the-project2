import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { ProductService } from './product.service';
import type { AuthRequest } from '../middleware/auth.middleware';

const service = new ProductService();
const uploadsDir = path.resolve(
  process.env.UPLOADS_DIR ||
    (process.env.VERCEL
      ? path.join('/tmp', 'uploads')
      : path.join(process.cwd(), 'uploads'))
);

const removeFile = async (filePath: string | undefined): Promise<void> => {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => undefined);
};

const removeStoredImage = async (imagePath: string | undefined): Promise<void> => {
  if (!imagePath) return;
  const fileName = path.basename(imagePath);
  if (imagePath !== `/uploads/${fileName}`) return;
  const absolutePath = path.resolve(uploadsDir, fileName);
  if (path.dirname(absolutePath) !== uploadsDir) return;
  await removeFile(absolutePath);
};

const parseVariants = (value: unknown): Array<{ name: string; quantity: number }> => {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed === undefined) return [];
  if (!Array.isArray(parsed)) {
    throw new Error('Le champ variantes doit être un tableau');
  }
  return parsed;
};

const publicMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const createProduct = async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const product = await service.create({
      code: typeof body.code === 'string' ? body.code : '',
      name: typeof body.name === 'string' ? body.name : '',
      costPrice: Number(body.costPrice),
      salePrice: Number(body.salePrice),
      image: req.file ? `/uploads/${req.file.filename}` : String(body.image ?? ''),
      variants: parseVariants(body.variants),
    });
    return res.status(201).json(product);
  } catch (error) {
    await removeFile(req.file?.path);
    return res.status(400).json({
      message: publicMessage(error, 'Produit invalide'),
    });
  }
};

export const listProducts = async (req: Request, res: Response) => {
  try {
    const list = await service.list();
    if ((req as AuthRequest).user?.role === 'confirmateur') {
      return res.json(
        list.map((product) => {
          const { costPrice, ...safe } = product.toObject();
          return safe;
        })
      );
    }
    return res.json(list);
  } catch {
    console.error('Chargement des produits impossible');
    return res.status(500).json({ message: 'Impossible de charger les produits' });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    return res.json(await service.getById(req.params.id));
  } catch (error) {
    return res.status(404).json({
      message: publicMessage(error, 'Produit non trouvé'),
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  let previousImage = '';
  try {
    const body = req.body as Record<string, unknown>;
    const partial: Record<string, unknown> = {};
    if (body.code !== undefined) partial.code = body.code;
    if (body.name !== undefined) partial.name = body.name;
    if (body.costPrice !== undefined) partial.costPrice = Number(body.costPrice);
    if (body.salePrice !== undefined) partial.salePrice = Number(body.salePrice);
    if (req.file) partial.image = `/uploads/${req.file.filename}`;
    else if (body.image !== undefined) partial.image = body.image;
    if (body.variants !== undefined) partial.variants = parseVariants(body.variants);

    if (req.file || body.image !== undefined) {
      previousImage = (await service.getById(req.params.id)).image;
    }
    const product = await service.update(req.params.id, partial);
    if (previousImage && previousImage !== product.image) {
      await removeStoredImage(previousImage);
    }
    return res.json(product);
  } catch (error) {
    await removeFile(req.file?.path);
    return res.status(400).json({
      message: publicMessage(error, 'Mise à jour invalide'),
    });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const image = await service.remove(req.params.id);
    await removeStoredImage(image);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({
      message: publicMessage(error, 'Suppression impossible'),
    });
  }
};
