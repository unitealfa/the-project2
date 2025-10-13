// back/src/users/user.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { UserService } from './user.service';
import { CreateUserDto, LoginDto, VerifyCodeDto } from './user.dto';

const service = new UserService();

// GET /api/users
export const getAllUsers = async (_req: any, res: Response) => {
  try {
    const list = await service.getAllUsers();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/users/login
export const login = async (req: Request, res: Response) => {
  try {
    const dto: LoginDto = req.body;
    const { user, token } = await service.authenticate(dto);
    const { password, ...rest } = user.toObject();
    res.json({ ...rest, id: (user._id as any).toString(), token }); // FIX ligne 25
  } catch (err: any) {
    res.status(401).json({ message: err.message });
  }
};

// POST /api/users/forgot-password
// POST /api/users/forgot-password
export const forgotPassword = async (_req: Request, res: Response) => {
  try {
    const response = await service.requestPasswordReset();
    res.json(response);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};


// POST /api/users/verify-code
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const dto: VerifyCodeDto = req.body;
    if (!dto.code) {
      return res.status(400).json({ message: 'Code requis' });
    }
    const response = await service.verifyResetCode(dto);
    res.json(response);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// POST /api/users/create (admin only)
export const createUser = async (req: Request, res: Response) => {
  try {
    const dto: CreateUserDto = req.body;
    const newUser = await service.createUser(dto);
    res.status(201).json(newUser);
  } catch (err: any) {
    if (err instanceof mongoose.Error.ValidationError) {
      const msgs = Object.values(err.errors).map(e => e.message);
      res.status(400).json({ message: msgs.join(', ') });
    } else {
      res.status(400).json({ message: err.message });
    }
  }
};

// GET /api/users/:id (self or admin)
export const getUser = async (req: any, res: Response) => {
  try {
    const requester = req.user!;
    const { id } = req.params;
    if (requester.role !== 'admin' && requester.id !== id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    const u = await service.getById(id);
    const { password, ...rest } = u.toObject();
    res.json({ ...rest, id: (u._id as any).toString() }); // FIX ligne 57
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
};

// PUT /api/users/:id (admin only)
export const updateUser = async (req: Request, res: Response) => {
  try {
    const dto: Partial<CreateUserDto> = req.body;
    const updated = await service.updateUser(req.params.id, dto);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE /api/users/:id (admin only)
export const deleteUser = async (req: Request, res: Response) => {
  try {
    await service.deleteUser(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};