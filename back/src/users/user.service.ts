import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User, { IUser } from './user.model';
import { LoginDto, CreateUserDto } from './user.dto';

dotenv.config();

export class UserService {
  /**
   * Vérifie email/password, puis renvoie l'user + un JWT sans expiration
   */
  async authenticate(dto: LoginDto): Promise<{ user: IUser; token: string }> {
    const user = await User.findOne({ email: dto.email });
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) {
      throw new Error('Mot de passe invalide');
    }

    // Préparation du payload
    const payload = {
      id:    user._id.toString(),
      email: user.email,
      role:  user.role,
    };

    // Récupération du secret
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET n’est pas défini dans .env');
    }

    // Génère un token SANS expiresIn pour ne jamais expirer
    const token = jwt.sign(payload, secret);

    return { user, token };
  }

  /**
   * Crée un gestionnaire ou confirmateur (admin only)
   */
  async createUser(
    dto: CreateUserDto
  ): Promise<{
    id: string;
    firstName: string;
    lastName:  string;
    email:     string;
    role:      IUser['role'];
  }> {
    if (await User.findOne({ email: dto.email })) {
      throw new Error('Email déjà utilisé');
    }
    const hash = await bcrypt.hash(dto.password, 12);
    const newUser = await User.create({
      firstName: dto.firstName,
      lastName:  dto.lastName,
      email:     dto.email,
      password:  hash,
      role:      dto.role,
    });
    return {
      id:        newUser._id.toString(),
      firstName: newUser.firstName,
      lastName:  newUser.lastName,
      email:     newUser.email,
      role:      newUser.role,
    };
  }

  /**
   * Récupère un utilisateur par ID
   */
  async getById(id: string): Promise<IUser> {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    return user;
  }

  /**
   * Récupère tous les utilisateurs (sans password)
   */
  async getAllUsers(): Promise<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: IUser['role'];
    }>
  > {
    const users = await User.find().select('firstName lastName email role');
    return users.map(u => ({
      id:        u._id.toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    }));
  }
} 
