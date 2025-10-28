// back/src/products/product.controller.ts
import { Request, Response } from 'express';
import { ProductService } from './product.service';

const service = new ProductService();

export const createProduct = async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    let variants: Array<{ name: string; quantity: number }> = [];
    try {
      variants = typeof body.variants === 'string' ? JSON.parse(body.variants) : (Array.isArray(body.variants) ? body.variants : []);
    } catch {
      variants = [];
    }
    const imagePath = (req as any).file ? `/uploads/${(req as any).file.filename}` : (body.image || '');
    const dto = {
      code: body.code ?? '',
      name: String(body.name),
      costPrice: Number(body.costPrice),
      salePrice: Number(body.salePrice),
      image: imagePath,
      variants,
    };
    const p = await service.create(dto);
    res.status(201).json(p);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const listProducts = async (_req: Request, res: Response) => {
  try {
    const list = await service.list();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const p = await service.getById(req.params.id);
    res.json(p);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const body = req.body as any;
    const partial: any = {};
    if (body.code !== undefined) partial.code = body.code;
    if (body.name !== undefined) partial.name = body.name;
    if (body.costPrice !== undefined) partial.costPrice = Number(body.costPrice);
    if (body.salePrice !== undefined) partial.salePrice = Number(body.salePrice);
    if ((req as any).file) {
      partial.image = `/uploads/${(req as any).file.filename}`;
    } else if (body.image !== undefined) {
      partial.image = body.image; // keep existing or clear
    }
    if (body.variants !== undefined) {
      try {
        partial.variants = typeof body.variants === 'string' ? JSON.parse(body.variants) : body.variants;
      } catch {
        partial.variants = [];
      }
    }
    const p = await service.update(req.params.id, partial);
    res.json(p);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    await service.remove(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// Décrémentation de stock en lot lors de la livraison d'une commande
// Corps attendu: { items: Array<{ code?: string; name?: string; variant: string; quantity: number }> }
export const decrementStockBulk = async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: 'Aucun item à traiter' });
    }

    const results = [] as Array<{
      ok: boolean;
      code?: string;
      name?: string;
      variant: string;
      quantity: number;
      error?: string;
    }>;

    for (const it of items) {
      const code = typeof it.code === 'string' && it.code.trim() !== '' ? it.code.trim() : undefined;
      const name = typeof it.name === 'string' && it.name.trim() !== '' ? it.name.trim() : undefined;
      const variant = String(it.variant || '').trim();
      const quantity = Number(it.quantity);
      if ((!code && !name) || !variant || !Number.isFinite(quantity) || quantity <= 0) {
        results.push({ ok: false, code, name, variant, quantity, error: 'Paramètres invalides' });
        continue;
      }
      try {
        await service.decrementByCodeNameVariant(code, name, variant, quantity);
        results.push({ ok: true, code, name, variant, quantity });
      } catch (e: any) {
        results.push({ ok: false, code, name, variant, quantity, error: e?.message || 'Erreur' });
      }
    }

    const hasFailure = results.some(r => !r.ok);
    return res.status(hasFailure ? 207 : 200).json({ results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// Décrémentation de stock en lot permettant le stock 0 (pour confirmation de commande)
// Corps attendu: { items: Array<{ code?: string; name?: string; variant: string; quantity: number }> }
export const decrementStockBulkAllowZero = async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: 'Aucun item à traiter' });
    }

    const results = [] as Array<{
      ok: boolean;
      code?: string;
      name?: string;
      variant: string;
      quantity: number;
      finalStock: number;
      error?: string;
    }>;

    for (const it of items) {
      const code = typeof it.code === 'string' && it.code.trim() !== '' ? it.code.trim() : undefined;
      const name = typeof it.name === 'string' && it.name.trim() !== '' ? it.name.trim() : undefined;
      const variant = String(it.variant || '').trim();
      const quantity = Number(it.quantity);
      if ((!code && !name) || !variant || !Number.isFinite(quantity) || quantity <= 0) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: 'Paramètres invalides' });
        continue;
      }
      try {
        const updatedProduct = await service.decrementByCodeNameVariantAllowZero(code, name, variant, quantity);
        const variantData = updatedProduct.variants.find(v => v.name === variant);
        const finalStock = variantData ? variantData.quantity : 0;
        results.push({ ok: true, code, name, variant, quantity, finalStock });
      } catch (e: any) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: e?.message || 'Erreur' });
      }
    }

    const hasFailure = results.some(r => !r.ok);
    return res.status(hasFailure ? 207 : 200).json({ results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// Décrémentation de stock en lot permettant le stock négatif (pour validation de commande)
// Corps attendu: { items: Array<{ code?: string; name?: string; variant: string; quantity: number }> }
export const decrementStockBulkAllowNegative = async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: 'Aucun item à traiter' });
    }

    const results = [] as Array<{
      ok: boolean;
      code?: string;
      name?: string;
      variant: string;
      quantity: number;
      finalStock: number;
      error?: string;
    }>;

    for (const it of items) {
      const code = typeof it.code === 'string' && it.code.trim() !== '' ? it.code.trim() : undefined;
      const name = typeof it.name === 'string' && it.name.trim() !== '' ? it.name.trim() : undefined;
      const variant = String(it.variant || '').trim();
      const quantity = Number(it.quantity);
      if ((!code && !name) || !variant || !Number.isFinite(quantity) || quantity <= 0) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: 'Paramètres invalides' });
        continue;
      }
      try {
        const updatedProduct = await service.decrementByCodeNameVariantAllowNegative(code, name, variant, quantity);
        const variantData = updatedProduct.variants.find(v => v.name === variant);
        const finalStock = variantData ? variantData.quantity : 0;
        results.push({ ok: true, code, name, variant, quantity, finalStock });
      } catch (e: any) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: e?.message || 'Erreur' });
      }
    }

    const hasFailure = results.some(r => !r.ok);
    return res.status(hasFailure ? 207 : 200).json({ results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const incrementStockBulk = async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: 'Aucun item à traiter' });
    }

    const results = [] as Array<{
      ok: boolean;
      code?: string;
      name?: string;
      variant: string;
      quantity: number;
      finalStock: number;
      error?: string;
    }>;

    for (const it of items) {
      const code = typeof it.code === 'string' && it.code.trim() !== '' ? it.code.trim() : undefined;
      const name = typeof it.name === 'string' && it.name.trim() !== '' ? it.name.trim() : undefined;
      const variant = String(it.variant || '').trim();
      const quantity = Number(it.quantity);
      if ((!code && !name) || !variant || !Number.isFinite(quantity) || quantity <= 0) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: 'Paramètres invalides' });
        continue;
      }

      try {
        const updatedProduct = await service.incrementByCodeNameVariant(code, name, variant, quantity);
        const variantData = updatedProduct.variants.find(v => v.name === variant);
        const finalStock = variantData ? Number(variantData.quantity ?? 0) || 0 : 0;
        results.push({ ok: true, code, name, variant, quantity, finalStock });
      } catch (e: any) {
        results.push({ ok: false, code, name, variant, quantity, finalStock: 0, error: e?.message || 'Erreur' });
      }
    }

    const hasFailure = results.some(r => !r.ok);
    return res.status(hasFailure ? 207 : 200).json({ results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};