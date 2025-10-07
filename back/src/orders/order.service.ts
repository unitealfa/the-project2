import Order, { IOrder } from './order.model';

export interface ImportOrderRow {
  reference?: string;
  customerName?: string;
  phone?: string;
  address?: string;
  commune?: string;
  wilayaCode?: number;
  amount?: number;
  status?: string;
  carrierPayload?: Record<string, any>;
  [key: string]: any;
}

export interface ImportMeta {
  lastRow?: number;
  sheetId?: number;
  sheetName?: string;
}

export class OrderService {
  async importRows(rows: ImportOrderRow[], meta?: ImportMeta) {
    let created = 0;
    let updated = 0;
    const skipped: Array<{ reference?: string; reason: string }> = [];

    for (const raw of rows) {
      const reference = String(raw.reference ?? '').trim();
      if (!reference) {
        skipped.push({ reference: undefined, reason: 'reference manquante' });
        continue;
      }

      const basePayload = raw.carrierPayload && typeof raw.carrierPayload === 'object'
        ? raw.carrierPayload
        : {};

      const toSet: Partial<IOrder> = {
        reference,
        customerName: String(raw.customerName ?? '').trim(),
        phone: String(raw.phone ?? '').trim(),
        address: String(raw.address ?? '').trim(),
        commune: String(raw.commune ?? '').trim(),
        wilayaCode: typeof raw.wilayaCode === 'number' && !Number.isNaN(raw.wilayaCode)
          ? raw.wilayaCode
          : Number.parseInt(String(raw.wilayaCode ?? '16'), 10) || 16,
        amount: typeof raw.amount === 'number' && !Number.isNaN(raw.amount)
          ? raw.amount
          : Number.parseFloat(String(raw.amount ?? '0')) || 0,
        carrierPayload: basePayload,
      } as Partial<IOrder>;

      const statusValue = String(raw.status ?? '').trim();
      if (statusValue) {
        toSet.status = statusValue;
      }

      if (meta) {
        (toSet as any).sheetMeta = {
          lastRow: meta.lastRow,
          sheetId: meta.sheetId,
          sheetName: meta.sheetName,
          importedAt: new Date(),
        };
      }

      const result = await Order.findOneAndUpdate(
        { reference },
        { $set: toSet },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          rawResult: true,
        }
      );

      const wasCreated = Boolean(result?.lastErrorObject && result.lastErrorObject.upserted);
      if (wasCreated) created += 1;
      else updated += 1;
    }

    return { created, updated, skipped };
  }

  async list(): Promise<IOrder[]> {
    return Order.find().sort({ createdAt: -1 });
  }

  async updateStatus(id: string, status: string): Promise<IOrder> {
    const sanitized = String(status ?? '').trim();
    if (!sanitized) {
      throw new Error('Statut invalide');
    }
    const order = await Order.findByIdAndUpdate(
      id,
      {
        $set: {
          status: sanitized,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!order) {
      throw new Error('Commande introuvable');
    }
    return order;
  }
}

export default OrderService;

