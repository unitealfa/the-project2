import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

export const AUTH_ROLES = [
  'admin',
  'gestionnaire',
  'confirmateur',
  'livreur',
] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const isAuthRole = (value: unknown): value is AuthRole =>
  typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value);

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET non défini');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères');
  }
  return secret;
};

export const getJwtSignOptions = (): SignOptions => ({
  expiresIn: (process.env.JWT_EXPIRES_IN?.trim() || '8h') as SignOptions['expiresIn'],
  issuer: process.env.JWT_ISSUER?.trim() || 'ecotrack-api',
  audience: process.env.JWT_AUDIENCE?.trim() || 'ecotrack-web',
  algorithm: 'HS256',
});

export const getJwtVerifyOptions = (): VerifyOptions => ({
  issuer: process.env.JWT_ISSUER?.trim() || 'ecotrack-api',
  audience: process.env.JWT_AUDIENCE?.trim() || 'ecotrack-web',
  algorithms: ['HS256'],
});
