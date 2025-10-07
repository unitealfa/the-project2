import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import userRoutes from './users/user.routes';
import productRoutes from './products/product.routes';
import orderRoutes from './orders/order.routes';

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      // Conserve le corps brut pour la vérification HMAC du webhook Google Sheets
      if (buf?.length) {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

export default app;
