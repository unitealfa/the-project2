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
app.use('/api/users', userRoutes);
app.use(express.urlencoded({ extended: true }));
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Static serving for uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

export default app;
