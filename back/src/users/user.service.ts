// back/src/users/user.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User, { IUser } from './user.model';
import { LoginDto, CreateUserDto } from './user.dto';

dotenv.config();

export class UserService {
  /** Authentification + JWT */
  async authenticate(dto: LoginDto): Promise<{ user: IUser; token: string }> {
    const user = await User.findOne({ email: dto.email });
    if (!user) throw new Error('Utilisateur non trouvé');
    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new Error('Mot de passe invalide');

    const payload = { id: (user._id as any).toString(), email: user.email, role: user.role };
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET non défini');
    const token = jwt.sign(payload, secret);

    return { user, token };
  }

  /** Création d'utilisateur (admin only) */
  async createUser(dto: CreateUserDto): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }> {
    if (await User.findOne({ email: dto.email })) {
      throw new Error('Email déjà utilisé');
    }
    const hash = await bcrypt.hash(dto.password, 12);
    const u = await User.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hash,
      role: dto.role,
    });
    return {
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    };
  }

  /** Récupérer un user */
  async getById(id: string): Promise<IUser> {
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    return u;
  }

  /** Liste de tous les users (admin only) */
  async getAllUsers(): Promise<Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }>> {
    const users = await User.find().select('firstName lastName email role');
    return users.map(u => ({
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    }));
  }

  /** Mise à jour d'un user (admin only) */
  async updateUser(
    id: string,
    dto: Partial<CreateUserDto> & { password?: string }
  ): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }> {
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    if (dto.firstName) u.firstName = dto.firstName;
    if (dto.lastName)  u.lastName  = dto.lastName;
    if (dto.email)     u.email     = dto.email;
    if (dto.role)      u.role      = dto.role;
    if (dto.password)  u.password  = await bcrypt.hash(dto.password, 12);
    await u.save();
    return {
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    };
  }

  /** Suppression d'un user (admin only, sauf admin) */
  async deleteUser(id: string): Promise<void> {
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    if (u.role === 'admin') throw new Error('Suppression de l\'admin impossible'); // FIX: guillemets échappés
    await u.deleteOne();
  }
}