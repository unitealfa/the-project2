import { Request, Response } from 'express';
import sheetService from './order.service';
import { syncOfficialStatuses as syncOfficialStatusesService } from './orderStatusSync.service';

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { rowId, status, tracking, row } = req.body ?? {};

  if (!rowId || !status) {
    return res.status(400).json({
      success: false,
      message: 'Les champs "rowId" et "status" sont requis.',
    });
  }

  try {
    const result = await sheetService.updateStatus({
      rowId: String(rowId),
      status: String(status),
      tracking: typeof tracking === 'string' ? tracking : undefined,
      row,
    });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return res.status(500).json({
      success: false,
      message,
    });
  }

  };

export const syncOfficialStatuses = async (req: Request, res: Response) => {
  const { orders, startDate, endDate } = req.body ?? {};

  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Le corps de la requête doit contenir un tableau "orders" non vide.',
    });
  }

  try {
    const result = await syncOfficialStatusesService({
      orders,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur inconnue lors de la synchronisation des statuts officiels.';
    return res.status(500).json({
      success: false,
      message,
    });
  }
};