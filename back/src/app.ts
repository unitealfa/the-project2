import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import connectDB from './config/db';
import userRoutes from './users/user.routes';
import User from './users/user.model';
import Product from './products/product.model';
import productRoutes from './products/product.routes';
import orderRoutes from './orders/order.routes';

// Initial Mongo connection removed in favor of middleware

const app = express();
app.use(cors());
app.use(express.json());

// Middleware to ensure DB connection on every request
app.use(async (req, res, next) => {
  if (req.path === '/favicon.ico') return next();
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database Connection Failed:', error);
    res.status(500).json({ success: false, message: 'Service temporarily unavailable' });
  }
});
// Avoid favicon 500s when no icon is set
app.get('/favicon.ico', (_req, res) => res.status(204).end());
// Healthcheck/root route
app.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));
// Google Sheet update passthrough (previously in server.ts)
app.post('/update-sheet', async (req, res) => {
  try {
    const sheetSyncUrl = process.env.GOOGLE_SHEET_SYNC_URL;
    if (!sheetSyncUrl) {
      return res
        .status(500)
        .json({ success: false, message: 'GOOGLE_SHEET_SYNC_URL is not configured.' });
    }

    const response = await fetch(sheetSyncUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body as Record<string, string>),
    });

    const text = await response.text();
    res.status(200).send(text);
  } catch (error) {
    console.error('Erreur Google Sheet:', error);
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});
app.use('/api/users', userRoutes);
app.use(express.urlencoded({ extended: true }));
// Safe fallback for products to avoid 500 if DB is unavailable in serverless
app.get('/api/products', async (_req, res) => {
  try {
    const products = await Product.find().lean();
    return res.json(products);
  } catch (error) {
    console.error('Erreur /api/products:', error);
    return res.json([]);
  }
});
app.use('/api/products', productRoutes);
// Safe fallback for delivery persons to avoid 500 if DB/service fails
app.get('/api/orders/delivery-persons', async (_req, res) => {
  try {
    const persons = await User.find({ role: 'livreur' }).select('_id firstName lastName email');
    return res.json({
      success: true,
      deliveryPersons: persons.map((p) => ({
        id: p._id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email: p.email,
      })),
    });
  } catch (error) {
    console.error('Erreur /api/orders/delivery-persons:', error);
    return res.json({
      success: true,
      deliveryPersons: [],
      message: 'Impossible de charger les livreurs pour le moment.',
    });
  }
});
app.use('/api/orders', orderRoutes);

// Static serving for uploaded files (read-only on Vercel; use /tmp fallback if provided)
const uploadsDir =
  process.env.UPLOADS_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads'));
app.use('/uploads', express.static(uploadsDir));

export default app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
