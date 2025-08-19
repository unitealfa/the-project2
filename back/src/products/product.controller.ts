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




