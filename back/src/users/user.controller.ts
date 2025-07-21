// back/src/users/user.controller.ts
import { Request, Response } from 'express';
import { UserService } from './user.service';
import { LoginDto, CreateUserDto } from './user.dto';

const service = new UserService();

// GET /api/users       
export const getAllUsers = async (req: any, res: Response) => {
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
    res.json({ ...rest, id: user._id, token });
  } catch (err: any) {
    res.status(401).json({ message: err.message });
  }
};

// POST /api/users/create  (admin only)
export const createUser = async (req: Request, res: Response) => {
  try {
    const dto: CreateUserDto = req.body;
    const newUser = await service.createUser(dto);
    res.status(201).json(newUser);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

// GET /api/users/:id  (self or admin)
export const getUser = async (req: any, res: Response) => {
  try {
    const requester = req.user!;
    const { id } = req.params;
    if (requester.role !== 'admin' && requester.id !== id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    const user = await service.getById(id);
    const { password, ...rest } = user.toObject();
    res.json({ ...rest, id: user._id });
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
};
