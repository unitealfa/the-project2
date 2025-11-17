import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import sheetService from './order.service';
import { syncOfficialStatuses as syncOfficialStatusesService } from './orderStatusSync.service';
import Order from './order.model';
import User from '../users/user.model';
import { decrementStockForDeliveredOrder } from './orderStockUtils';

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

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { rowId, status, tracking, row, deliveryType, deliveryPersonId } =
    req.body ?? {};

  if (!rowId || !status) {
    return res.status(400).json({
      success: false,
      message: 'Les champs "rowId" et "status" sont requis.',
    });
  }

  try {
    const existingOrder = await Order.findOne({ rowId: String(rowId) });

    const normalizedDeliveryType: 'api_dhd' | 'api_sook' | 'livreur' = (() => {
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

    // Si c'est un envoi vers un livreur, vérifier que le livreur existe
    let resolvedDeliveryPersonId: string | undefined;
    let deliveryPersonName: string | undefined;

    if (normalizedDeliveryType === 'livreur') {
      if (deliveryPersonId) {
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

    if (normalizedDeliveryType !== 'livreur') {
      resolvedDeliveryPersonId = undefined;
      deliveryPersonName = undefined;
    }

    // Mettre à jour le statut dans Google Sheets
    const result = await sheetService.updateStatus({
      rowId: String(rowId),
      status: String(status),
      tracking: typeof tracking === 'string' ? tracking : undefined,
      row,
    });

    // Sauvegarder ou mettre à jour la commande dans la base de données
    const orderData = {
      rowId: String(rowId),
      status: String(status),
      tracking: typeof tracking === 'string' ? tracking : undefined,
      deliveryType: normalizedDeliveryType,
      deliveryPersonId: resolvedDeliveryPersonId,
      deliveryPersonName,
      row: row ?? existingOrder?.row,
    };

    console.log('💾 Sauvegarde de la commande:', {
      rowId: String(rowId),
      status: String(status),
      deliveryType: normalizedDeliveryType,
      deliveryPersonId: resolvedDeliveryPersonId,
      deliveryPersonName
    });

    const savedOrder = await Order.findOneAndUpdate(
      { rowId: String(rowId) },
      orderData,
      { upsert: true, new: true }
    );

    console.log('✅ Commande sauvegardée:', {
      _id: savedOrder._id,
      rowId: savedOrder.rowId,
      status: savedOrder.status,
      deliveryType: savedOrder.deliveryType,
      deliveryPersonId: savedOrder.deliveryPersonId,
      deliveryPersonName: savedOrder.deliveryPersonName
    });

    // Décrémenter automatiquement le stock si le statut devient "delivered"
    // et que le statut précédent n'était pas déjà "delivered" (pour éviter les doubles décrémentations)
    const normalizedStatus = String(status).toLowerCase().trim();
    const previousStatus = existingOrder?.status ? String(existingOrder.status).toLowerCase().trim() : '';
    const isDelivered = normalizedStatus === 'delivered' || normalizedStatus === 'livrée';
    const wasAlreadyDelivered = previousStatus === 'delivered' || previousStatus === 'livrée';

    if (isDelivered && !wasAlreadyDelivered) {
      const orderRow = row ?? existingOrder?.row ?? savedOrder.row;
      if (orderRow) {
        // Décrémenter le stock de manière asynchrone (ne pas bloquer la réponse)
        decrementStockForDeliveredOrder(orderRow, String(rowId)).catch((error) => {
          console.error('Erreur lors de la décrémentation automatique du stock:', error);
        });
      }
    }

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

// Nouvelle fonction pour obtenir les livreurs disponibles
export const getDeliveryPersons = async (req: Request, res: Response) => {
  try {
    const deliveryPersons = await User.find({ role: 'livreur' })
      .select('_id firstName lastName email');
    
    return res.json({
      success: true,
      deliveryPersons: deliveryPersons.map(person => ({
        id: person._id,
        name: `${person.firstName} ${person.lastName}`,
        email: person.email
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la récupération des livreurs';
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

// Nouvelle fonction pour obtenir les commandes assignées à un livreur
export const getDeliveryPersonOrders = async (req: Request, res: Response) => {
  try {
    const { deliveryPersonId } = req.params;
    
    console.log('🔍 Recherche des commandes pour le livreur:', deliveryPersonId);
    
    // Rechercher avec l'ID exact (string) et aussi avec ObjectId si c'est un ObjectId valide
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
          'En cours de livraison',
          'delivered',
          'returned'
        ] 
      }
    };
    
    // Essayer de matcher l'ID comme string d'abord
    query.deliveryPersonId = deliveryPersonId;
    
    let orders = await Order.find(query).sort({ updatedAt: -1 });
    
    console.log(`📦 Trouvé ${orders.length} commandes avec deliveryPersonId string`);
    
    // Si aucune commande trouvée, essayer avec ObjectId
    if (orders.length === 0) {
      try {
        const mongoose = require('mongoose');
        const objectId = new mongoose.Types.ObjectId(deliveryPersonId);
        query.deliveryPersonId = objectId;
        orders = await Order.find(query).sort({ updatedAt: -1 });
        console.log(`📦 Trouvé ${orders.length} commandes avec deliveryPersonId ObjectId`);
      } catch (objectIdError) {
        console.log('❌ Erreur lors de la conversion en ObjectId:', objectIdError);
      }
    }
    
    // Debug: afficher toutes les commandes avec deliveryType 'livreur'
    const allDeliveryOrders = await Order.find({ deliveryType: 'livreur' });
    console.log(`📦 Total des commandes pour livreurs: ${allDeliveryOrders.length}`);
    allDeliveryOrders.forEach(order => {
      console.log(`   - Commande ${order.rowId}: deliveryPersonId="${order.deliveryPersonId}" (type: ${typeof order.deliveryPersonId})`);
    });
    
    return res.json({
      success: true,
      orders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la récupération des commandes';
    console.error('❌ Erreur dans getDeliveryPersonOrders:', error);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getDeliveryPersonHistory = async (req: Request, res: Response) => {
  try {
    const { deliveryPersonId } = req.params;

    if (!deliveryPersonId) {
      return res.status(400).json({
        success: false,
        message: 'L\'identifiant du livreur est requis',
      });
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
      'retournée',
      'Retournée',
      'retournee',
      'Retournee',
      'annulée',
      'Annulée',
      'annulee',
      'Annulee'
    ];

    const baseQuery: Record<string, unknown> = {
      deliveryType: 'livreur',
      status: { $in: finalStatuses }
    };

    const queries = [{ ...baseQuery, deliveryPersonId }];

    try {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(deliveryPersonId)) {
        queries.push({ ...baseQuery, deliveryPersonId: new mongoose.Types.ObjectId(deliveryPersonId) });
      }
    } catch (objectIdError) {
      console.log('❌ Erreur lors de la conversion en ObjectId pour l\'historique:', objectIdError);
    }

    let orders: any[] = [];
    for (const query of queries) {
      orders = await Order.find(query).sort({ updatedAt: -1 });
      if (orders.length > 0) {
        break;
      }
    }

    return res.json({
      success: true,
      orders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la récupération de l\'historique';
    console.error('❌ Erreur dans getDeliveryPersonHistory:', error);
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
    const order = await Order.findOne({ 
      $or: [
        { _id: orderId },
        { rowId: orderId }
      ]
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée.',
      });
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
          console.log('✅ Nom de produit trouvé dans:', rawKey, '=', trimmed.substring(0, 50));
          break;
        } else if (trimmed) {
          const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(trimmed);
          console.log('⚠️ Champ produit ignoré:', rawKey, '=', trimmed.substring(0, 30), '| Arabe:', hasArabic, '| Valide:', isValidProductName(trimmed));
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
          console.log('✅ Utilisation du champ "Produit":', fallbackValue.substring(0, 50));
        } else {
          const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(fallbackValue);
          console.log('⚠️ Champ "Produit" ignoré:', fallbackValue.substring(0, 30), '| Arabe:', hasArabic, '| Valide:', isValidProductName(fallbackValue));
        }
      }
      
      // Si toujours pas trouvé (ou si "Produit" était corrompu), chercher dans TOUS les autres champs
      if (!produitLabel) {
        console.log('🔍 Recherche du nom de produit dans tous les champs disponibles...');
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
            console.log('✅ Nom de produit trouvé dans le champ alternatif:', key, '=', trimmed.substring(0, 50));
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
        console.log('⚠️ Nom de produit rejeté comme corrompu après nettoyage:', produit, '(origine:', produitLabel.substring(0, 30), '...)');
        produit = 'N/A';
      } else {
        console.log('✅ Nom de produit extrait:', produit, '| Longueur:', produit.length, '| Contient arabe:', hasArabicChars);
        // Afficher un aperçu pour vérifier
        if (produit.length > 0) {
          const preview = produit.substring(0, Math.min(50, produit.length));
          console.log('   Aperçu:', preview, '...');
        }
      }
    } else {
      console.log('⚠️ Aucun nom de produit trouvé dans les données de la commande');
      // Log pour déboguer - afficher tous les champs disponibles
      console.log('   Champs disponibles contenant "produit":', Object.keys(row).filter(k => k.toLowerCase().includes('produit')));
      // Afficher tous les champs et leurs valeurs (pour déboguer)
      console.log('   📋 Tous les champs de la commande:');
      for (const [key, value] of Object.entries(row)) {
        const valStr = String(value ?? '').trim();
        if (valStr && valStr.length > 2 && valStr.length < 200) {
          const isCorrupted = isCorruptedText(valStr);
          console.log(`     - ${key}: "${valStr.substring(0, 60)}${valStr.length > 60 ? '...' : ''}" (corrompu: ${isCorrupted}, longueur: ${valStr.length})`);
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
    
    // Fonction pour parser un montant
    const parseAmount = (value: unknown): number | null => {
      if (value === undefined || value === null) return null;
      const cleaned = String(value)
        .replace(/\s+/g, '')
        .replace(/[^\d,.-]/g, '')
        .replace(/,/g, '.');
      if (!cleaned) return null;
      const parsed = parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    };
    
    // Extraire le montant total (priorité au champ "total")
    let prix = '0';
    const prixKeys = ['total', 'Total', 'TOTAL', 'Montant', 'Montant total', 'Prix total'];
    
    // D'abord chercher le champ "total" (en priorité)
    for (const key of prixKeys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        const parsed = parseAmount(row[key]);
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
        const raw = String(row['Quantité'] || row['Quantite'] || row['Qte'] || '1');
        const sanitized = raw.replace(/[^\d]/g, '');
        const n = parseInt(sanitized, 10);
        return Number.isNaN(n) || n <= 0 ? 1 : n;
      })();

      const unitPriceForTotal = (() => {
        const priceCandidates = ['Prix unitaire', 'Prix', 'PrixU', 'PU', 'Prix U'];
        for (const key of priceCandidates) {
          if (key in row) {
            const parsed = parseAmount(row[key]);
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
    res.setHeader('Content-Disposition', `attachment; filename="bordereau_${order.rowId || orderId}.pdf"`);

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
      console.log('📦 Produit à afficher:', produit.substring(0, 50), '... | Contient de l\'arabe:', hasArabic, '| Longueur:', produit.length);
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
    console.error('Erreur lors de la génération du bordereau:', error);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};