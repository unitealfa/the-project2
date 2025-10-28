import { Router } from 'express';
import multer, { type DiskStorageOptions } from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  decrementStockBulk,
  decrementStockBulkAllowZero,
  decrementStockBulkAllowNegative,
  incrementStockBulk,
} from './product.controller';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage config
const storageOptions: DiskStorageOptions = {
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
};

const storage = multer.diskStorage(storageOptions);

const upload = multer({ storage });

router
  .route('/')
  .get(authenticateJWT, listProducts)
  .post(
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire']),
    upload.single('image'),
    createProduct
  );

router
  .post(
    '/decrement-bulk',
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire', 'confirmateur']),
    decrementStockBulk
  );

router
  .post(
    '/decrement-bulk-allow-zero',
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire', 'confirmateur']),
    decrementStockBulkAllowZero
  );

router
  .post(
    '/decrement-bulk-allow-negative',
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire', 'confirmateur']),
    decrementStockBulkAllowNegative
  );

router
  .post(
    '/increment-bulk',
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire', 'confirmateur']),
    incrementStockBulk
  );

router
  .route('/:id')
  .get(authenticateJWT, getProduct)
  .put(
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire']),
    upload.single('image'),
    updateProduct
  )
  .delete(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), deleteProduct);

export default router;


