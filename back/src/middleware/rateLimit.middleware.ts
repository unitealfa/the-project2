import { NextFunction, Request, Response } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  namespace: string;
}

const MAX_TRACKED_CLIENTS = 10_000;

/**
 * Limiteur local volontairement simple. Il protège chaque instance contre les
 * rafales; les tentatives de code sont aussi limitées durablement en base.
 */
export const createRateLimiter = ({
  windowMs,
  max,
  namespace,
}: RateLimitOptions) => {
  const entries = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${namespace}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const current = entries.get(key);

    if (!current || current.resetAt <= now) {
      if (entries.size >= MAX_TRACKED_CLIENTS) {
        for (const [candidateKey, entry] of entries) {
          if (entry.resetAt <= now) entries.delete(candidateKey);
        }
        if (entries.size >= MAX_TRACKED_CLIENTS) {
          entries.delete(entries.keys().next().value as string);
        }
      }
      entries.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        message: 'Trop de tentatives. Veuillez réessayer plus tard.',
      });
      return;
    }

    next();
  };
};
