// back/src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, VerifyErrors } from 'jsonwebtoken';
import dotenv from 'dotenv';
import {
  AuthRole,
  getJwtSecret,
  getJwtVerifyOptions,
  isAuthRole,
} from '../config/auth';
import User from '../users/user.model';
dotenv.config();

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: AuthRole };
}

export const authenticateJWT = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token manquant' });
    return;
  }
  const token = authHeader.slice(7);

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    res.status(500).json({ message: 'Authentification serveur non configurée' });
    return;
  }

  jwt.verify(token, secret, getJwtVerifyOptions(), async (
      err: VerifyErrors | null,
      decoded: JwtPayload | string | undefined
    ) => {
      if (
        err ||
        !decoded ||
        typeof decoded === 'string' ||
        typeof decoded.id !== 'string' ||
        typeof decoded.email !== 'string' ||
        !isAuthRole(decoded.role) ||
        typeof decoded.tokenVersion !== 'number'
      ) {
        res.status(401).json({ message: 'Token invalide' });
        return;
      }
      try {
        const user = await User.findById(decoded.id).select('email role +tokenVersion').lean();
        const storedTokenVersion =
          user && Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;
        if (
          !user ||
          storedTokenVersion !== decoded.tokenVersion ||
          !isAuthRole(user.role)
        ) {
          res.status(401).json({ message: 'Session expirée' });
          return;
        }
        req.user = {
          id: decoded.id,
          email: user.email,
          role: user.role,
        };
        next();
      } catch {
        res.status(503).json({ message: 'Authentification temporairement indisponible' });
      }
    });
};
