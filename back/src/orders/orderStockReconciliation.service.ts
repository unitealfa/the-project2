import Order, { StockAdjustmentState } from './order.model';
import {
  decrementStockForDeliveredOrder,
  incrementStockForReturnedOrder,
} from './orderStockUtils';

const normalize = (status: string): string =>
  status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const shouldDebit = (status: string): boolean => {
  const value = normalize(status);
  return [
    'ready_to_ship',
    'assigne',
    'shipped',
    'livree',
    'delivered',
  ].includes(value);
};

const shouldRestore = (status: string): boolean => {
  const value = normalize(status);
  return [
    'retours',
    'returned',
    'abandoned',
    'annule',
    'annulee',
    'cancelled',
    'canceled',
  ].includes(value);
};

const rollbackDebitTransition = async (
  rowId: string,
  transitionAt: Date,
  previous: {
    stockAdjustmentState?: StockAdjustmentState;
    stockDebitedAt?: Date;
    stockRestoredAt?: Date;
  }
) => {
  const setValues: Record<string, unknown> = {
    stockAdjustmentState: previous.stockAdjustmentState ?? 'not_debited',
  };
  const unsetValues: Record<string, 1> = {};
  if (previous.stockDebitedAt) setValues.stockDebitedAt = previous.stockDebitedAt;
  else unsetValues.stockDebitedAt = 1;
  if (previous.stockRestoredAt) setValues.stockRestoredAt = previous.stockRestoredAt;
  else unsetValues.stockRestoredAt = 1;

  await Order.updateOne(
    { rowId, stockAdjustmentState: 'debited', stockDebitedAt: transitionAt },
    {
      $set: setValues,
      ...(Object.keys(unsetValues).length > 0 ? { $unset: unsetValues } : {}),
    }
  );
};

export const reconcileOrderStock = async (
  rowId: string,
  status: string
): Promise<'debited' | 'restored' | 'unchanged'> => {
  if (shouldDebit(status)) {
    const transitionAt = new Date();
    const previous = await Order.findOneAndUpdate(
      {
        rowId,
        $or: [
          { stockAdjustmentState: { $exists: false } },
          { stockAdjustmentState: { $in: ['not_debited', 'restored'] } },
        ],
      },
      {
        $set: {
          stockAdjustmentState: 'debited',
          stockDebitedAt: transitionAt,
        },
        $unset: { stockRestoredAt: 1 },
      },
      { new: false }
    );

    if (!previous) return 'unchanged';
    if (!previous.row) {
      await rollbackDebitTransition(rowId, transitionAt, previous);
      return 'unchanged';
    }

    try {
      await decrementStockForDeliveredOrder(previous.row, rowId);
      return 'debited';
    } catch (error) {
      await rollbackDebitTransition(rowId, transitionAt, previous);
      throw error;
    }
  }

  if (shouldRestore(status)) {
    const transitionAt = new Date();
    const previous = await Order.findOneAndUpdate(
      { rowId, stockAdjustmentState: 'debited' },
      {
        $set: {
          stockAdjustmentState: 'restored',
          stockRestoredAt: transitionAt,
        },
      },
      { new: false }
    );

    if (!previous) return 'unchanged';
    if (!previous.row) {
      await Order.updateOne(
        { rowId, stockAdjustmentState: 'restored', stockRestoredAt: transitionAt },
        {
          $set: { stockAdjustmentState: 'debited' },
          $unset: { stockRestoredAt: 1 },
        }
      );
      return 'unchanged';
    }

    try {
      await incrementStockForReturnedOrder(previous.row, rowId);
      return 'restored';
    } catch (error) {
      await Order.updateOne(
        {
          rowId,
          stockAdjustmentState: 'restored',
          stockRestoredAt: transitionAt,
        },
        {
          $set: { stockAdjustmentState: 'debited' },
          $unset: { stockRestoredAt: 1 },
        }
      );
      throw error;
    }
  }

  return 'unchanged';
};
