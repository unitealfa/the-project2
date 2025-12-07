import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import connectDB from './config/db';
import userRoutes from './users/user.routes';
import productRoutes from './products/product.routes';
import orderRoutes from './orders/order.routes';

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());
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
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Static serving for uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

export default app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
