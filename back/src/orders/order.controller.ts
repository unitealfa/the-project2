import { Request, Response } from 'express';
import sheetService from './order.service';

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