import { Request, Response } from 'express';
import crypto from 'crypto';
import OrderService, { ImportOrderRow } from './order.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const timingSafeEqual = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
};

export class OrderController {
  constructor(private readonly service: OrderService = new OrderService()) {}

  importFromSheet = async (req: RawBodyRequest, res: Response) => {
    try {
      const secret = process.env.SHEETS_WEBHOOK_SECRET;
      if (!secret) {
        return res.status(500).json({ message: 'SHEETS_WEBHOOK_SECRET manquant' });
      }

      const signatureHeader = req.get('X-GAS-Signature') || '';
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');

      if (!timingSafeEqual(signatureHeader, expectedSignature)) {
        return res.status(401).json({ message: 'Signature invalide' });
      }

      const body = req.body as { rows?: ImportOrderRow[]; checkpoint?: { lastRow?: number; sheetId?: number; sheetName?: string } };
      if (!body || !Array.isArray(body.rows)) {
        return res.status(400).json({ message: 'Payload invalide (rows requis)' });
      }

      const meta = body.checkpoint ?? undefined;
      const result = await this.service.importRows(body.rows, meta);

      return res.status(200).json({ ok: true, ...result });
    } catch (error: any) {
      console.error('Import orders error', error);
      return res.status(500).json({ message: error?.message || 'Erreur serveur' });
    }
  };

  list = async (_req: Request, res: Response) => {
    try {
      const orders = await this.service.list();
      return res.json({ orders });
    } catch (error: any) {
      console.error('List orders error', error);
      return res.status(500).json({ message: error?.message || 'Erreur serveur' });
    }
  };

  updateStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body as { status?: string };
      if (!id) {
        return res.status(400).json({ message: 'ID manquant' });
      }
      const order = await this.service.updateStatus(id, status ?? '');
      return res.json({ order });
    } catch (error: any) {
      console.error('Update order status error', error);
      return res.status(400).json({ message: error?.message || 'Erreur lors de la mise à jour' });
    }
  };
}

export default OrderController;

