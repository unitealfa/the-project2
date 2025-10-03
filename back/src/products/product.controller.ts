// back/src/products/product.controller.ts
import { Request, Response } from 'express';
import { ProductService } from './product.service';

const service = new ProductService();

export const createProduct = async (req: Request, res: Response) => {
  try {
    const p = await service.create(req.body);
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
    const p = await service.update(req.params.id, req.body);
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




