import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  decrementStockBulk,
} from './product.controller';

const router = Router();


router
  .route('/')
  .get(authenticateJWT, listProducts)
  .post(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), createProduct);

router
  .post('/decrement-bulk', authenticateJWT, authorizeRole(['admin', 'gestionnaire']), decrementStockBulk);

router
  .route('/:id')
  .get(authenticateJWT, getProduct)
  .put(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), updateProduct)
  .delete(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), deleteProduct);

export default router;



