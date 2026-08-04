import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import connectDB from './config/db';
import userRoutes from './users/user.routes';
import productRoutes from './products/product.routes';
import orderRoutes from './orders/order.routes';
import { startOrderStatusScheduler } from './orders/orderStatusScheduler';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const configuredOrigins = [
  ...(process.env.CORS_ORIGINS ?? '').split(','),
  process.env.FRONTEND_URL ?? '',
]
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const developmentOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([
  ...configuredOrigins,
  ...(process.env.NODE_ENV === 'production' ? [] : developmentOrigins),
]);

app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && !allowedOrigins.has(origin.replace(/\/$/, ''))) {
    return res.status(403).json({ success: false, message: 'Origine non autorisee' });
  }
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.has(origin.replace(/\/$/, '')));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Avoid DB work for healthcheck/favicon. This matters on Vercel when MongoDB
// is temporarily unreachable or the deployment IP is not whitelisted yet.
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));

// Les images produits sont publiques et ne nécessitent pas une connexion Mongo.
// Sur Vercel, /tmp reste éphémère : utiliser un stockage objet en production.
const uploadsDir =
  process.env.UPLOADS_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads'));
app.use('/uploads', express.static(uploadsDir, {
  fallthrough: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  immutable: false,
}), (_req, res) => {
  res.status(404).json({ success: false, message: 'Image introuvable' });
});

// Middleware to ensure DB connection on every request
app.use(async (req, res, next) => {
  if (req.path === '/favicon.ico') return next();
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Connexion MongoDB impossible');
    res.status(500).json({ success: false, message: 'Service temporarily unavailable' });
  }
});
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const bodyTooLarge = (error as { type?: string })?.type === 'entity.too.large';
  console.error(bodyTooLarge ? 'Corps de requête trop volumineux' : 'Erreur HTTP non gérée');
  res.status(bodyTooLarge ? 413 : 500).json({
    success: false,
    message: bodyTooLarge ? 'Corps de requête trop volumineux' : 'Erreur interne du serveur',
  });
});

// Lancement de la synchro automatique des statuts officiels (hors environnements serverless)
if (!process.env.VERCEL && process.env.ENABLE_OFFICIAL_STATUS_CRON !== 'false') {
  startOrderStatusScheduler();
}

export default app;
