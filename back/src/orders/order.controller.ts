import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import sheetService from './order.service';
import { syncOfficialStatuses as syncOfficialStatusesService } from './orderStatusSync.service';
import Order from './order.model';
import User from '../users/user.model';
import { Types } from 'mongoose';
import { reconcileOrderStock } from './orderStockReconciliation.service';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  acquireStatusSyncLock,
  releaseStatusSyncLock,
} from './orderApi.controller';

const debugLog = (...args: unknown[]) => {
  if (process.env.DEBUG_ORDERS === 'true' && process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

const sanitizeOrderRow = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 250)) {
    const key = rawKey.trim();
    if (!key || key.length > 160 || key.startsWith('$') || key.includes('.') || key.includes('\0')) {
      continue;
    }
    if (typeof rawValue === 'string') sanitized[key] = rawValue.slice(0, 5_000);
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) sanitized[key] = rawValue;
    else if (typeof rawValue === 'boolean' || rawValue === null) sanitized[key] = rawValue;
  }
  return sanitized;
};

export const getSheetCsv = async (_req: Request, res: Response) => {
  try {
    const csv = await sheetService.getSheetCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).send(csv);
  } catch {
    return res.status(502).json({
      success: false,
      message: 'Impossible de charger la feuille de commandes.',
    });
  }
};

export const updateWilayaAndCommune = async (req: Request, res: Response) => {
  const { rowId, wilaya, commune, row } = req.body ?? {};
  const normalizedRowId =
    typeof rowId === 'string' || typeof rowId === 'number'
      ? String(rowId).trim()
      : '';
  const normalizedWilaya = typeof wilaya === 'string' ? wilaya.trim() : '';
  const normalizedCommune = typeof commune === 'string' ? commune.trim() : '';
  const normalizedRow = sanitizeOrderRow(row);

  if (!normalizedRowId) {
    return res.status(400).json({
      success: false,
      message: 'Le champ "rowId" est requis.',
    });
  }

  if (!normalizedWilaya && !normalizedCommune) {
    return res.status(400).json({
      success: false,
      message: 'Au moins un des champs "wilaya" ou "commune" doit être fourni.',
    });
  }
  if (
    normalizedRowId.length > 100 ||
    normalizedWilaya.length > 100 ||
    normalizedCommune.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: 'Une valeur dépasse la longueur autorisée.',
    });
  }

  try {
    const result = await sheetService.updateWilayaAndCommune({
      rowId: normalizedRowId,
      wilaya: normalizedWilaya || undefined,
      commune: normalizedCommune || undefined,
      row: normalizedRow,
    });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Impossible de mettre à jour la wilaya ou la commune.',
    });
  }
};

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ARABIC_FONT_PATH = path.join(
  PROJECT_ROOT,
  'assets',
  'fonts',
  'NotoSansArabic-Regular.ttf'
);

const formatPhoneNumber = (value?: unknown): string => {
  if (value === undefined || value === null) {
    return 'N/A';
  }

  const raw = String(value).trim();
  if (!raw) {
    return 'N/A';
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) {
    return 'N/A';
  }

  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  if (digits.startsWith('213') && digits.length >= 12) {
    digits = digits.substring(3);
  }

  if (digits.length === 9) {
    digits = `0${digits}`;
  }

  if (!digits.startsWith('0')) {
    digits = `0${digits}`;
  }

  if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.substring(0, 10);
  }

  return digits || 'N/A';
};

const parseLocaleAmount = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  let text = String(value)
    .replace(/[\s\u00a0\u202f]+/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!text || !/\d/.test(text)) return null;
  const negative = text.startsWith('-');
  text = text.replace(/-/g, '');
  const commaIndex = text.lastIndexOf(',');
  const dotIndex = text.lastIndexOf('.');
  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    text = text.split(thousandsSeparator).join('');
    const decimalIndex = text.lastIndexOf(decimalSeparator);
    text =
      text.slice(0, decimalIndex).split(decimalSeparator).join('') +
      '.' +
      text.slice(decimalIndex + 1);
  } else {
    const separator = commaIndex >= 0 ? ',' : dotIndex >= 0 ? '.' : '';
    if (separator) {
      const parts = text.split(separator);
      const looksLikeThousands =
        parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
      text = looksLikeThousands
        ? parts.join('')
        : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1] ?? ''}`;
    }
  }
  const parsed = Number(`${negative ? '-' : ''}${text}`);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePositiveQuantity = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return 1;
  const normalized = String(value).trim().replace(',', '.');
  const match = normalized.match(
    /^(\d+)(?:\.0+)?(?:\s*(?:x|pcs?|pi[eè]ces?|unit[eé]s?))?$/i
  );
  const parsed = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : null;
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const {
    rowId,
    status,
    tracking,
    row,
    deliveryType,
    deliveryPersonId,
    carrierStatus,
  } =
    req.body ?? {};

  const normalizedRowId = typeof rowId === 'string' || typeof rowId === 'number'
    ? String(rowId).trim()
    : '';
  const normalizedStatus = typeof status === 'string' ? status.trim() : '';
  const normalizedTracking = typeof tracking === 'string' ? tracking.trim() : '';
  const normalizedCarrierStatus =
    typeof carrierStatus === 'string' ? carrierStatus.trim() : '';
  const normalizedRow = sanitizeOrderRow(row);

  if (!normalizedRowId || !normalizedStatus) {
    return res.status(400).json({
      success: false,
      message: 'Les champs "rowId" et "status" sont requis.',
    });
  }
  if (
    normalizedRowId.length > 100 ||
    normalizedStatus.length > 80 ||
    normalizedTracking.length > 100 ||
    normalizedCarrierStatus.length > 160
  ) {
    return res.status(400).json({
      success: false,
      message: 'Une valeur de commande dépasse la longueur autorisée.',
    });
  }

  try {
    const existingOrder = await Order.findOne({ rowId: normalizedRowId });
    const authRequest = req as AuthRequest;
    if (authRequest.user?.role === 'livreur') {
      if (
        !existingOrder ||
        existingOrder.deliveryType !== 'livreur' ||
        String(existingOrder.deliveryPersonId ?? '') !== authRequest.user.id
      ) {
        return res.status(403).json({ success: false, message: 'Acces refuse.' });
      }
      const allowedDeliveryStatuses = new Set([
        'delivered',
        'livrée',
        'livree',
        'returned',
        'retours',
      ]);
      if (!allowedDeliveryStatuses.has(normalizedStatus.toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: 'Ce changement de statut n’est pas autorise pour un livreur.',
        });
      }
    }

    const isDeliveryUser = authRequest.user?.role === 'livreur';
    const normalizedDeliveryType: 'api_dhd' | 'api_sook' | 'livreur' = (() => {
      if (isDeliveryUser) return 'livreur';
      if (deliveryType === 'livreur') {
        return 'livreur';
      }
      if (deliveryType === 'api_sook') {
        return 'api_sook';
      }
      if (deliveryType === 'api_dhd') {
        return 'api_dhd';
      }
      return existingOrder?.deliveryType ?? 'api_dhd';
    })();

    const hasExistingTracking = Boolean(
      existingOrder?.tracking &&
      existingOrder.tracking.trim().length >= 5 &&
      !['N/A', 'NA', 'NONE', '0'].includes(existingOrder.tracking.trim().toUpperCase())
    );
    if (
      hasExistingTracking &&
      existingOrder?.deliveryType !== normalizedDeliveryType
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Le transporteur ne peut pas être changé après la création du tracking sans intervention manuelle contrôlée.',
      });
    }

    // Si c'est un envoi vers un livreur, vérifier que le livreur existe
    let resolvedDeliveryPersonId: string | undefined;
    let deliveryPersonName: string | undefined;

    if (normalizedDeliveryType === 'livreur') {
      if (isDeliveryUser && existingOrder?.deliveryPersonId) {
        resolvedDeliveryPersonId = existingOrder.deliveryPersonId;
        deliveryPersonName = existingOrder.deliveryPersonName;
      } else if (deliveryPersonId) {
        if (!Types.ObjectId.isValid(String(deliveryPersonId))) {
          return res.status(400).json({
            success: false,
            message: 'Livreur non trouvé ou invalide.',
          });
        }
        const deliveryPerson = await User.findById(deliveryPersonId);
        if (!deliveryPerson || deliveryPerson.role !== 'livreur') {
          return res.status(400).json({
            success: false,
            message: 'Livreur non trouvé ou invalide.',
          });
        }
        resolvedDeliveryPersonId = String(deliveryPerson._id);
        deliveryPersonName = `${deliveryPerson.firstName} ${deliveryPerson.lastName}`.trim();
      } else if (existingOrder?.deliveryPersonId) {
        resolvedDeliveryPersonId = existingOrder.deliveryPersonId;
        deliveryPersonName = existingOrder.deliveryPersonName;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Livreur non trouvé ou invalide.',
        });
      }
    }

    const effectiveTracking = normalizedTracking || existingOrder?.tracking;
    const effectiveCarrierStatus =
      normalizedCarrierStatus || existingOrder?.carrierStatus;
    const setValues: Record<string, unknown> = {
      rowId: normalizedRowId,
      status: normalizedStatus,
      deliveryType: normalizedDeliveryType,
      row: normalizedRow ?? existingOrder?.row,
    };
    if (effectiveTracking) setValues.tracking = effectiveTracking;
    if (effectiveCarrierStatus) setValues.carrierStatus = effectiveCarrierStatus;
    if (normalizedDeliveryType === 'livreur') {
      setValues.deliveryPersonId = resolvedDeliveryPersonId;
      setValues.deliveryPersonName = deliveryPersonName;
    }

    const unsetValues: Record<string, 1> = {};
    if (normalizedDeliveryType === 'livreur') {
      unsetValues.tracking = 1;
      unsetValues.carrierStatus = 1;
      unsetValues.carrierStatusUpdatedAt = 1;
      unsetValues.carrierValidatedAt = 1;
    } else {
      unsetValues.deliveryPersonId = 1;
      unsetValues.deliveryPersonName = 1;
    }

    debugLog('Sauvegarde de la commande:', {
      rowId: normalizedRowId,
      status: normalizedStatus,
      deliveryType: normalizedDeliveryType,
      deliveryPersonId: resolvedDeliveryPersonId,
      deliveryPersonName
    });

    const savedOrder = await Order.findOneAndUpdate(
      { rowId: normalizedRowId },
      { $set: setValues, $unset: unsetValues },
      { upsert: true, new: true }
    );

    debugLog('Commande sauvegardée:', {
      _id: savedOrder._id,
      rowId: savedOrder.rowId,
      status: savedOrder.status,
      deliveryType: savedOrder.deliveryType,
      deliveryPersonId: savedOrder.deliveryPersonId,
      deliveryPersonName: savedOrder.deliveryPersonName
    });

    // Une seule machine d'état serveur gere le stock. Le filtre atomique de
    // reconcileOrderStock rend les répétitions de webhook/UI/synchronisation idempotentes.
    let stockMessage = '';
    try {
      await reconcileOrderStock(normalizedRowId, normalizedStatus);
    } catch (stockError) {
      stockMessage =
        stockError instanceof Error ? stockError.message : 'Erreur stock inconnue';
    }

    let sheetResult: unknown;
    let sheetFailed = false;
    try {
      sheetResult = await sheetService.updateStatus({
        rowId: normalizedRowId,
        status: normalizedStatus,
        tracking:
          normalizedDeliveryType === 'livreur' ? undefined : effectiveTracking,
        carrierStatus:
          normalizedDeliveryType === 'livreur' ? undefined : effectiveCarrierStatus,
        carrierType:
          normalizedDeliveryType === 'api_dhd' ||
          normalizedDeliveryType === 'api_sook'
            ? normalizedDeliveryType
            : undefined,
        row: normalizedRow ?? savedOrder.row,
      });
    } catch {
      sheetFailed = true;
    }

    const syncErrors = [
      ...(stockMessage ? [`Stock: ${stockMessage}`] : []),
      ...(sheetFailed ? ['Google Sheets: synchronisation impossible'] : []),
    ];
    await Order.updateOne(
      { rowId: normalizedRowId },
      { $set: { lastSyncError: syncErrors.join(' | ') } }
    );
    if (syncErrors.length > 0) {
      return res.status(sheetFailed ? 502 : 500).json({
        success: false,
        partialSuccess: true,
        message: sheetFailed
          ? 'Le statut est sauvegardé dans la base, mais Google Sheets n’a pas pu être synchronisé.'
          : `Le statut est sauvegardé, mais le stock n'a pas pu être ajusté: ${stockMessage}`,
      });
    }

    return res.json({
      success: true,
      result: sheetResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Impossible de mettre à jour la commande.',
    });
  }
};

// Nouvelle fonction pour obtenir les livreurs disponibles
export const getDeliveryPersons = async (req: Request, res: Response) => {
  try {
    const deliveryPersons = await User.find({ role: 'livreur' })
      .select('_id firstName lastName');
    
    return res.json({
      success: true,
      deliveryPersons: deliveryPersons.map(person => ({
        id: person._id,
        name: `${person.firstName} ${person.lastName}`
      }))
    });
  } catch (error) {
    console.error('Erreur getDeliveryPersons');
    return res.status(500).json({
      success: false,
      message: 'Impossible de charger les livreurs.',
    });
  }
};

// Nouvelle fonction pour obtenir les commandes assignées à un livreur
export const getDeliveryPersonOrders = async (req: Request, res: Response) => {
  try {
    const { deliveryPersonId } = req.params;
    const authRequest = req as AuthRequest;
    if (
      authRequest.user?.role === 'livreur' &&
      authRequest.user.id !== deliveryPersonId
    ) {
      return res.status(403).json({ success: false, message: 'Acces refuse.' });
    }
    
    if (!Types.ObjectId.isValid(deliveryPersonId)) {
      return res.status(400).json({ success: false, message: 'Identifiant livreur invalide.' });
    }

    const query: any = {
      deliveryType: 'livreur',
      status: { 
        $in: [
          'En cours', 
          'Assigné', 
          'En attente', 
          'ready_to_ship',
          'En préparation',
          'Prêt à expédier',
          'En livraison',
          'En cours de livraison'
        ] 
      }
    };
    
    query.deliveryPersonId = deliveryPersonId;
    const orders = await Order.find(query)
      .select('rowId status tracking deliveryType deliveryPersonId deliveryPersonName row createdAt updatedAt')
      .sort({ updatedAt: -1 });
    
    return res.json({
      success: true,
      orders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la récupération des commandes';
    console.error('Erreur dans getDeliveryPersonOrders:', message);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getDeliveryPersonHistory = async (req: Request, res: Response) => {
  try {
    const { deliveryPersonId } = req.params;
    const authRequest = req as AuthRequest;
    if (
      authRequest.user?.role === 'livreur' &&
      authRequest.user.id !== deliveryPersonId
    ) {
      return res.status(403).json({ success: false, message: 'Acces refuse.' });
    }

    if (!deliveryPersonId) {
      return res.status(400).json({
        success: false,
        message: 'L\'identifiant du livreur est requis',
      });
    }
    if (!Types.ObjectId.isValid(deliveryPersonId)) {
      return res.status(400).json({ success: false, message: 'Identifiant livreur invalide.' });
    }

    const finalStatuses = [
      'delivered',
      'Delivered',
      'livrée',
      'Livrée',
      'livree',
      'Livree',
      'returned',
      'Returned',
      'retour',
      'retours',
      'Retours',
      'retournée',
      'Retournée',
      'retournee',
      'Retournee',
      'annulée',
      'Annulée',
      'annulee',
      'Annulee',
      'abandoned',
      'canceled',
      'cancelled'
    ];

    const baseQuery: Record<string, unknown> = {
      deliveryType: 'livreur',
      status: { $in: finalStatuses }
    };

    const orders = await Order.find({ ...baseQuery, deliveryPersonId })
      .select('rowId status tracking deliveryType deliveryPersonId deliveryPersonName row createdAt updatedAt')
      .sort({ updatedAt: -1 });

    return res.json({
      success: true,
      orders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la récupération de l\'historique';
    console.error('Erreur dans getDeliveryPersonHistory:', message);
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
  if (orders.length > 1000) {
    return res.status(400).json({
      success: false,
      message: 'Une synchronisation manuelle ne peut pas dépasser 1000 commandes.',
    });
  }

  let lockAcquired = false;
  try {
    lockAcquired = await acquireStatusSyncLock();
    if (!lockAcquired) {
      return res.status(409).json({
        success: false,
        message: 'Une synchronisation des statuts est déjà en cours.',
      });
    }
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
  } finally {
    if (lockAcquired) {
      await releaseStatusSyncLock().catch(() => undefined);
    }
  }
};

// Fonction pour générer le bordereau PDF
export const generateBordereauPDF = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'L\'ID de la commande est requis.',
      });
    }

    // Récupérer la commande depuis la base de données
    const query: any = { $or: [{ rowId: orderId }] };
    if (Types.ObjectId.isValid(orderId)) {
      query.$or.push({ _id: new Types.ObjectId(orderId) });
    }

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée.',
      });
    }

    const authRequest = req as AuthRequest;
    if (
      authRequest.user?.role === 'livreur' &&
      String(order.deliveryPersonId ?? '') !== authRequest.user.id
    ) {
      return res.status(403).json({ success: false, message: 'Acces refuse.' });
    }

    if (!order.row) {
      return res.status(400).json({
        success: false,
        message: 'Les données de la commande sont incomplètes.',
      });
    }

    const row = order.row;
    
    // Extraire les données nécessaires
    const clientName = String(row['Nom du client'] || 'N/A');
    const phone = formatPhoneNumber(row['Numero'] ?? row['Téléphone']);
    const phone2 = formatPhoneNumber(row['Numero 2'] ?? row['Téléphone 2']);
    const address = String(row['Adresse'] || 'N/A');
    const commune = String(row['Commune'] || 'N/A');
    const wilaya = String(row['Wilaya'] || 'N/A');
    
    // Fonction pour vérifier si une valeur est corrompue (contient beaucoup de caractères suspects)
    const isCorruptedText = (text: string): boolean => {
      if (!text || text.length < 3) return false;
      
      // Détecter les patterns typiques de corruption (comme "d61c6J", "bvDbÖEbvE")
      const corruptionPatterns = [
        /^[a-z]\d+[A-Z]/i,  // Pattern comme "d61c6J" au début
        /^[a-z]\d{2,}[A-Z]/i,  // Pattern exact "d61c6J" (lettre + 2+ chiffres + majuscule)
        /[a-z]\d{2,}[A-Z]/i,  // Pattern avec chiffres entre lettres (d61c6J)
        /[A-Z][a-z]{2}[A-Z][a-z]{2}[A-Z]/i,  // Pattern comme "bvDbÖEbvE"
        /[a-z]+[A-Z][a-z]+[A-Z][a-z]+[A-Z]/i,  // Alternance suspecte de casse répétée
        /[^\x20-\x7E\u00A0-\u017F\u0100-\u024F\u1E00-\u1EFF\s]{3,}/,  // Plusieurs caractères non imprimables consécutifs
        /[¢©®±×÷]/,  // Caractères spéciaux suspects
        /^[a-zA-Z]\d{2,}[A-Z][a-z0-9]{0,5}$/i,  // Pattern exact comme "d61c6J" (1-2 lettres + 2+ chiffres + 1 majuscule + optionnel)
      ];
      
      // Si le texte correspond à un pattern de corruption, c'est corrompu
      for (const pattern of corruptionPatterns) {
        if (pattern.test(text.trim())) {
          return true;
        }
      }
      
      // Vérifier spécifiquement le pattern "lettre + chiffres + lettre + chiffres + majuscule" (comme d61c6J)
      const trimmedText = text.trim();
      
      // Pattern exact pour "d61c6J": lettre + chiffres + lettre + chiffres + majuscule
      // d + 61 + c + 6 + J
      if (/^[a-z]\d+[a-z]\d+[A-Z]/i.test(trimmedText) && trimmedText.length < 20) {
        return true;
      }
      
      // Pattern similaire: d61c6J exactement (d + 61 + c + 6 + J)
      // Match: lettre + 2+ chiffres + lettre + 1-2 chiffres + majuscule
      if (/^[a-z]\d{2,}[a-z]\d{1,2}[A-Z]$/i.test(trimmedText) && trimmedText.length < 15) {
        return true;
      }
      
      // Pattern exact "d61c6J" ou similaire (peu importe la longueur)
      // d + 61 + c + 6 + J = lettre + 2+ chiffres + lettre + 1-2 chiffres + majuscule
      if (/^[a-z]\d{2,}[a-z]\d{1,2}[A-Z]/i.test(trimmedText)) {
        return true;
      }
      
      // Pattern "d61c6J" exact: d(lettre) + 61(2chiffres) + c(lettre) + 6(1chiffre) + J(majuscule)
      if (/^[a-z]\d{2}[a-z]\d[A-Z]$/i.test(trimmedText)) {
        return true;
      }
      
      // Pattern "lettre + chiffres + majuscule" (simplifié)
      if (/^[a-z]\d+[A-Z][a-z0-9]*$/i.test(trimmedText) && trimmedText.length < 20) {
        return true;
      }
      
      // Pattern général: lettre + chiffres + lettre + chiffres + lettre (d61c6J)
      if (/^[a-z]\d+[a-z]\d+[A-Za-z]$/i.test(trimmedText) && trimmedText.length < 15) {
        return true;
      }
      
      // Pattern alternance suspecte: bvDbÖEbvE (lettre minuscule + majuscule répétée)
      if (/^[a-z]{1,3}[A-Z][a-z]{1,3}[A-Z][a-z]{1,3}[A-Z]/.test(trimmedText) && trimmedText.length < 30) {
        return true;
      }
      
      // Si le texte commence par une lettre suivie de chiffres puis d'une majuscule
      if (/^[a-z]\d{2,}[A-Z]/.test(trimmedText) && trimmedText.length < 15) {
        return true;
      }
      
      // Pattern général: très court texte (moins de 8 caractères) avec mélange lettres/chiffres
      if (/^[a-z]\d+[A-Za-z]/.test(trimmedText) && trimmedText.length < 8) {
        return true;
      }
      
      // Détecter spécifiquement "d61c6J" et patterns similaires
      if (/^[a-z]\d{2,}[a-z]\d+[A-Z]$/i.test(trimmedText)) {
        return true;
      }
      
      // Vérifier si le texte contient de l'arabe
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
      
      // Si le texte contient de l'arabe, ne PAS le considérer comme corrompu
      // (les caractères arabes sont valides)
      if (hasArabic) {
        return false;
      }
      
      // Compter les caractères suspects (non-ASCII valides, non imprimables, etc.)
      // Exclure les caractères arabes de cette vérification
      const suspiciousChars = text.match(/[^\x20-\x7E\u00A0-\u017F\u0100-\u024F\u1E00-\u1EFF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g);
      if (suspiciousChars) {
        // Si plus de 20% de caractères suspects, considérer comme corrompu
        if (suspiciousChars.length / text.length > 0.2) {
          return true;
        }
      }
      
      // Vérifier si le texte ressemble à du texte corrompu (beaucoup de caractères non-alphabétiques mélangés)
      // Inclure l'arabe dans les caractères alphabétiques valides
      const nonAlphabetic = text.match(/[^a-zA-ZÀ-ÿ\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s]/g);
      if (nonAlphabetic && nonAlphabetic.length > text.length * 0.4) {
        // Si plus de 40% de caractères non-alphabétiques, c'est suspect
        return true;
      }
      
      return false;
    };
    
    // Fonction pour vérifier si une valeur semble être un nom de produit valide
    const isValidProductName = (text: string): boolean => {
      if (!text || text.trim().length < 1) return false;
      
      const trimmed = text.trim();
      
      // Vérifier si le texte contient de l'arabe
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed);
      
      // Si le texte contient de l'arabe, l'accepter immédiatement (pas de vérification de corruption)
      if (hasArabic) {
        // Pour l'arabe, accepter si le texte a au moins 1 caractère (peut être court)
        return trimmed.length >= 1;
      }
      
      // Pour le texte non-arabe, vérifier que ce n'est pas corrompu
      if (isCorruptedText(trimmed)) return false;
      
      // Vérifier qu'il contient des lettres (pas seulement des chiffres ou symboles)
      const hasLetters = /[a-zA-ZÀ-ÿ\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/.test(trimmed);
      return hasLetters && trimmed.length >= 2;
    };
    
    // Fonction pour normaliser une clé
    const normalizeKey = (key: string): string => {
      return key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    };
    
    // Logique similaire au frontend : extractProductLabel puis fallback sur "Produit"
    // IMPORTANT: Exclure explicitement "Produit (No)" car il contient un code, pas le nom
    const PRODUCT_KEYWORDS = ['produit', 'product', 'article'];
    let produitLabel = '';
    
    // Étape 1 : Chercher avec extractProductLabel (comme le frontend)
    // MAIS rejeter seulement les valeurs vraiment corrompues (pas l'arabe)
    for (const [rawKey, value] of Object.entries(row)) {
      const normalizedKey = normalizeKey(String(rawKey));
      if (!normalizedKey) continue;
      if (PRODUCT_KEYWORDS.some(keyword => normalizedKey.includes(keyword))) {
        // Exclure les champs qui sont clairement des codes/numéros
        if (normalizedKey.includes('(no)') || 
            normalizedKey.includes('numero') || 
            normalizedKey.includes('code') ||
            normalizedKey.includes('no)') ||
            normalizedKey === 'produit (no)') {
          continue;
        }
        const trimmed = String(value ?? '').trim();
        // Vérifier que c'est un nom de produit valide (accepte l'arabe)
        if (trimmed && isValidProductName(trimmed)) {
          produitLabel = trimmed;
          debugLog('Nom de produit trouvé');
          break;
        } else if (trimmed) {
          const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed);
          debugLog('Champ produit ignoré');
        }
      }
    }
    
    // Étape 2 : Si pas trouvé, utiliser directement "Produit" comme fallback (comme le frontend)
    // MAIS seulement si ce n'est pas corrompu
    if (!produitLabel) {
      const fallbackValue = String(row['Produit'] ?? '').trim();
      if (fallbackValue) {
        // Vérifier si c'est un nom valide (accepte l'arabe)
        if (isValidProductName(fallbackValue)) {
          produitLabel = fallbackValue;
          debugLog('Utilisation du champ produit standard');
        } else {
          const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(fallbackValue);
          debugLog('Champ produit standard ignoré');
        }
      }
      
      // Si toujours pas trouvé (ou si "Produit" était corrompu), chercher dans TOUS les autres champs
      if (!produitLabel) {
        debugLog('Recherche du nom de produit');
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = normalizeKey(String(key));
          // Ignorer les champs connus qui ne sont pas des noms
          if (normalizedKey.includes('code') || 
              normalizedKey.includes('numero') || 
              normalizedKey.includes('prix') ||
              normalizedKey.includes('montant') ||
              normalizedKey.includes('total') ||
              normalizedKey.includes('quantite') ||
              normalizedKey.includes('adresse') ||
              normalizedKey.includes('client') ||
              normalizedKey.includes('telephone') ||
              normalizedKey.includes('wilaya') ||
              normalizedKey.includes('commune') ||
              normalizedKey.includes('etat') ||
              normalizedKey.includes('statut') ||
              normalizedKey.includes('date') ||
              normalizedKey.includes('reference') ||
              normalizedKey.includes('tracking') ||
              normalizedKey.includes('remarque') ||
              normalizedKey.includes('commentaire') ||
              normalizedKey.includes('id') ||
              normalizedKey.includes('sheet')) {
            continue;
          }
          const trimmed = String(value ?? '').trim();
          // Prendre le premier champ qui semble être un nom valide (accepte l'arabe)
          if (trimmed && isValidProductName(trimmed)) {
            produitLabel = trimmed;
            debugLog('Nom de produit trouvé dans un champ alternatif');
            break;
          }
        }
      }
    }
    
    // Extraire le nom de base du produit (sans la variante)
    let produit = 'N/A';
    if (produitLabel) {
      // Fonction pour nettoyer et extraire le nom de base
      const extractBaseName = (label: string): string => {
        let base = label.trim();
        
        // Enlever les variantes entre parenthèses à la fin
        base = base.replace(/\([^)]+\)\s*$/, '').trim();
        
        // Enlever les variantes entre crochets à la fin
        base = base.replace(/\[[^\]]+\]\s*$/, '').trim();
        
        // Enlever les séparateurs à la fin
        const separators = [' - ', ' – ', ' — ', ' : ', ' | ', ' / '];
        for (const sep of separators) {
          if (base.includes(sep)) {
            const parts = base.split(sep);
            // Prendre la première partie (le nom) et ignorer les variantes
            base = parts[0].trim();
            break;
          }
        }
        
        // Nettoyer les espaces multiples
        base = base.replace(/\s+/g, ' ').trim();
        
        return base || label.trim();
      };
      
      produit = extractBaseName(produitLabel);
      
      // Vérifier si le texte contient de l'arabe
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(produit);
      
      if (hasArabic) {
        // Pour l'arabe, ne PAS nettoyer (garder tous les caractères arabes intacts)
        // Juste nettoyer les espaces multiples
        produit = produit.replace(/\s+/g, ' ').trim();
      } else {
        // Pour le texte non-arabe, nettoyer les caractères corrompus ou invalides
        // Garder seulement les caractères valides UTF-8 imprimables
        produit = produit.replace(/[^\x20-\x7E\u00A0-\u017F\u0100-\u024F\u1E00-\u1EFF\s]/g, '').trim();
        produit = produit.replace(/\s+/g, ' ').trim();
      }
      
      // Si après nettoyage c'est vide, utiliser le label original
      if (!produit) {
        produit = produitLabel.trim();
      }
      
      // Seulement rejeter si vraiment corrompu (avec un seuil plus élevé pour éviter les faux positifs)
      // Pour le champ "Produit" standard, on est plus tolérant
      const hasArabicChars = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(produit);
      
      // Vérifier à nouveau si c'est corrompu après nettoyage
      if (isCorruptedText(produit) && !hasArabicChars) {
        // Rejeter si corrompu ET pas d'arabe (même si long)
        debugLog('Nom de produit rejeté après nettoyage');
        produit = 'N/A';
      } else {
        debugLog('Nom de produit extrait');
        // Afficher un aperçu pour vérifier
        if (produit.length > 0) {
          const preview = produit.substring(0, Math.min(50, produit.length));
          debugLog('Aperçu produit disponible');
        }
      }
    } else {
      debugLog('Aucun nom de produit trouvé');
      // Log pour déboguer - afficher tous les champs disponibles
      debugLog('Aucun champ produit exploitable');
      // Afficher tous les champs et leurs valeurs (pour déboguer)
      debugLog('Inspection des champs de commande');
      for (const [key, value] of Object.entries(row)) {
        const valStr = String(value ?? '').trim();
        if (valStr && valStr.length > 2 && valStr.length < 200) {
          const isCorrupted = isCorruptedText(valStr);
          debugLog('Champ de commande inspecté');
        }
      }
    }
    
    const reference = String(row['Référence'] || row['Réf'] || 'N/A');
    
    // Extraire le commentaire/remarque (chercher dans plusieurs champs possibles)
    const remarqueKeys = ['Remarque', 'Remarques', 'Commentaire', 'Commentaires', 'Note', 'Notes'];
    let remarque = '';
    for (const key of remarqueKeys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
        remarque = String(row[key]).trim();
        break;
      }
    }
    
    // Extraire le montant total (priorité au champ "total")
    let prix = '0';
    const prixKeys = ['total', 'Total', 'TOTAL', 'Montant', 'Montant total', 'Prix total'];
    
    // D'abord chercher le champ "total" (en priorité)
    for (const key of prixKeys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        const parsed = parseLocaleAmount(row[key]);
        if (parsed !== null) {
          // Formater le montant (enlever les décimales si c'est un nombre entier)
          prix = parsed % 1 === 0 ? String(Math.round(parsed)) : parsed.toFixed(2);
          break;
        }
      }
    }
    
    // Si aucun montant trouvé, essayer de calculer depuis prix unitaire * quantité
    if (prix === '0') {
      const quantityForTotal = (() => {
        return parsePositiveQuantity(
          row['Quantité'] || row['Quantite'] || row['Qte']
        ) ?? 1;
      })();

      const unitPriceForTotal = (() => {
        const priceCandidates = ['Prix unitaire', 'Prix', 'PrixU', 'PU', 'Prix U'];
        for (const key of priceCandidates) {
          if (key in row) {
            const parsed = parseLocaleAmount(row[key]);
            if (parsed !== null) return parsed;
          }
        }
        return null;
      })();

      if (unitPriceForTotal !== null) {
        const computed = unitPriceForTotal * quantityForTotal;
        prix = computed % 1 === 0 ? String(Math.round(computed)) : computed.toFixed(2);
      }
    }

    // Format 1/4 A4 : 105mm x 148mm
    // Conversion: 1mm = 2.83465 points
    const width = 105 * 2.83465; // ~297 points (105mm)
    const height = 148 * 2.83465; // ~419 points (148mm)

    const doc = new PDFDocument({
      size: [width, height],
      margin: 10,
    });

    if (fs.existsSync(ARABIC_FONT_PATH)) {
      try {
        doc.registerFont('NotoSansArabic', ARABIC_FONT_PATH);
        doc.font('NotoSansArabic');
      } catch (fontError) {
        console.warn('⚠️ Impossible de charger la police arabe:', fontError);
        doc.font('Helvetica');
      }
    } else {
      console.warn('⚠️ Police arabe introuvable à', ARABIC_FONT_PATH);
      doc.font('Helvetica');
    }

    // Configurer les en-têtes de réponse
    res.setHeader('Content-Type', 'application/pdf');
    const safeFileId = String(order.rowId || orderId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    res.setHeader('Content-Disposition', `attachment; filename="bordereau_${safeFileId}.pdf"`);

    // Pipe le PDF directement vers la réponse
    doc.pipe(res);

    // Couleur bleu clair pour le fond (optionnel, peut être enlevé si vous préférez blanc)
    doc.rect(0, 0, width, height).fill('#F0F8FF');

    // Code-barres simulé (ligne noire)
    doc.rect(10, 10, width - 20, 15).fill('#000000');

    // Titre DESTINATAIRE
    doc.fontSize(10).fillColor('#000000');
    doc.text('DESTINATAIRE:', 10, 35);

    // Informations client
    let yPos = 50;
    doc.fontSize(9).fillColor('#000000');
    
    // Nom du client
    doc.text(clientName, 10, yPos, { width: width - 20, align: 'left' });
    yPos += 15;

    // Téléphone(s)
    const phoneParts = [phone, phone2].filter(value => value && value !== 'N/A');
    const phoneDisplay = phoneParts.length > 0 ? phoneParts.join(' - ') : 'N/A';
    doc.text(phoneDisplay, 10, yPos);
    yPos += 15;

    // Ville
    doc.text(wilaya, 10, yPos);
    yPos += 15;

    // Localisation/Commune
    if (commune !== 'N/A') {
      doc.text(commune, 10, yPos);
      yPos += 15;
    }

    // Adresse
    doc.text(address, 10, yPos, { width: width - 20, align: 'left' });
    yPos += 20;

    // Section Montant et Poids (dans des rectangles bleus)
    const boxY = yPos;
    const boxWidth = (width - 30) / 2;
    const boxHeight = 25;

    // Montant
    doc.rect(10, boxY, boxWidth, boxHeight).fill('#1E3A8A').stroke('#1E3A8A');
    doc.fontSize(8).fillColor('#FFFFFF').text('Montant:', 15, boxY + 5);
    doc.fontSize(10).text(`${prix} DA`, 15, boxY + 15);

    // Poids (simulé)
    doc.rect(20 + boxWidth, boxY, boxWidth, boxHeight).fill('#1E3A8A').stroke('#1E3A8A');
    doc.fontSize(8).fillColor('#FFFFFF').text('Poids:', 25 + boxWidth, boxY + 5);
    const poids = String(row['Poids'] || row['Weight'] || '0.00');
    doc.fontSize(10).text(`${poids} KG`, 25 + boxWidth, boxY + 15);

    yPos = boxY + boxHeight + 15;

    // Section Produit - Afficher le nom du produit (pas le numéro)
    doc.fillColor('#000000');
    doc.fontSize(9).text('Produit :', 10, yPos);
    yPos += 12;
    
    // Nom du produit (affiché de manière plus visible)
    // Vérifier si le texte contient de l'arabe pour configurer le RTL
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(produit);
    
    doc.fontSize(10);
    // Pour le texte arabe, utiliser align right (RTL)
    // PDFKit devrait supporter UTF-8 mais peut avoir des problèmes avec RTL sans police appropriée
    doc.text(produit || 'N/A', 10, yPos, { 
      width: width - 20, 
      align: hasArabic ? 'right' : 'left'
    });
    yPos += 18;
    
    // Log pour déboguer
    if (produit && produit !== 'N/A') {
      debugLog('Produit ajouté au bordereau');
    }

    // Référence (seulement si elle existe et n'est pas vide)
    if (reference && reference !== 'N/A' && reference.trim() !== '') {
      doc.fontSize(9).text(`Réf : ${reference}`, 10, yPos);
      yPos += 15;
    }

    // Remarque/Commentaire (afficher seulement si présent)
    if (remarque && remarque.trim() !== '') {
      doc.fontSize(9).text(`Remarque: ${remarque}`, 10, yPos, { width: width - 20 });
      yPos += 15;
    }

    // Date d'expédition
    const dateExp = order.createdAt || new Date();
    const formattedDate = dateExp.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    doc.fontSize(9).text(`Date d'expédition : ${formattedDate}`, 10, yPos);

    // Finaliser le PDF
    doc.end();

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la génération du bordereau.';
    console.error('Erreur lors de la génération du bordereau:', message);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

// Liste toutes les commandes assignées aux livreurs (vue admin)
export const getAllDeliveryOrders = async (_req: Request, res: Response) => {
  try {
    const deliveryPersons = await User.find({ role: 'livreur' }).select(
      '_id firstName lastName'
    );
    const deliveryPersonMap = new Map(
      deliveryPersons.map((person) => [
        String(person._id),
        `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() ||
          person.firstName ||
          person.lastName ||
          'Livreur',
      ])
    );

    const orders = await Order.find({ deliveryType: 'livreur' })
      .select('rowId status tracking deliveryType deliveryPersonId deliveryPersonName row createdAt updatedAt')
      .sort({ updatedAt: -1 });

    const decorated = orders.map((order) => {
      const normalizedId = order.deliveryPersonId
        ? String(order.deliveryPersonId)
        : '';
      const nameFromMap = normalizedId
        ? deliveryPersonMap.get(normalizedId)
        : undefined;
      const deliveryPersonName =
        order.deliveryPersonName ||
        nameFromMap ||
        (normalizedId ? `Livreur ${normalizedId}` : 'Livreur');
      return {
        ...order.toObject(),
        deliveryPersonName,
      };
    });

    return res.json({ success: true, orders: decorated });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erreur lors de la rÇ¸cupÇ¸ration des commandes livreurs';
    return res.status(500).json({ success: false, message });
  }
};
