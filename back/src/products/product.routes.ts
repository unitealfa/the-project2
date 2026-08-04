import { Router } from 'express';
import multer, { type DiskStorageOptions } from 'multer';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
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
} from './product.controller';

const router = Router();

// Compute uploads directory (read-only fs on Vercel => use /tmp)
const uploadsDir =
  process.env.UPLOADS_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads'));

// Ensure uploads directory exists (ignore errors on read-only fs)
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn('Unable to create uploads directory, file upload may fail:', err);
}

// Multer storage config
const storageOptions: DiskStorageOptions = {
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    cb(null, `${randomUUID()}${extensions[file.mimetype]}`);
  },
};

const storage = multer.diskStorage(storageOptions);

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const imageSignatureMatches = (filePath: string, mimeType: string): boolean => {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (mimeType === 'image/jpeg') {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return bytesRead >= 8 && header.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    }
    if (mimeType === 'image/gif') {
      const signature = header.subarray(0, 6).toString('ascii');
      return signature === 'GIF87a' || signature === 'GIF89a';
    }
    if (mimeType === 'image/webp') {
      return bytesRead >= 12 &&
        header.subarray(0, 4).toString('ascii') === 'RIFF' &&
        header.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
  } finally {
    fs.closeSync(descriptor);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      cb(new Error('Format d’image non autorisé. Utilisez JPEG, PNG, WebP ou GIF.'));
      return;
    }
    cb(null, true);
  },
});

const uploadSingleImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single('image')(req, res, (error: unknown) => {
    if (!error) {
      if (!req.file) return next();
      try {
        if (imageSignatureMatches(req.file.path, req.file.mimetype)) {
          return next();
        }
      } catch {
        // La réponse générique ci-dessous évite d'exposer un chemin serveur.
      }
      fs.promises.unlink(req.file.path).catch(() => undefined);
      return res.status(400).json({
        message: 'Le contenu du fichier ne correspond pas à une image autorisée.',
      });
    }
    const message = error instanceof multer.MulterError
      ? error.code === 'LIMIT_FILE_SIZE'
        ? 'L’image dépasse la limite de 5 Mo.'
        : 'Téléversement d’image invalide.'
      : error instanceof Error
        ? error.message
        : 'Téléversement d’image invalide.';
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => undefined);
    }
    res.status(400).json({ message });
  });
};

router
  .route('/')
  .get(
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire', 'confirmateur']),
    listProducts
  )
  .post(
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire']),
    uploadSingleImage,
    createProduct
  );

router
  .route('/:id')
  .get(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), getProduct)
  .put(
    authenticateJWT,
    authorizeRole(['admin', 'gestionnaire']),
    uploadSingleImage,
    updateProduct
  )
  .delete(authenticateJWT, authorizeRole(['admin', 'gestionnaire']), deleteProduct);

export default router;
