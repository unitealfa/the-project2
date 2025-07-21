// back/src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload, VerifyErrors } from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
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

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: 'JWT_SECRET non configuré' });
    return;
  }

  jwt.verify(
    token,
    secret,
    (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
      if (err || !decoded || typeof decoded === 'string') {
        res.status(401).json({ message: 'Token invalide' });
        return;
      }
      // decoded est JwtPayload
      req.user = {
        id:    decoded.id as string,
        email: decoded.email as string,
        role:  decoded.role as string,
      };
      next();
    }
  );
};
