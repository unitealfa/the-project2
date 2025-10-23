import { Request, Response } from 'express';
import sheetService from './order.service';
import { syncOfficialStatuses as syncOfficialStatusesService } from './orderStatusSync.service';
import Order from './order.model';
import User from '../users/user.model';

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { rowId, status, tracking, row, deliveryType, deliveryPersonId } = req.body ?? {};

  if (!rowId || !status) {
    return res.status(400).json({
      success: false,
      message: 'Les champs "rowId" et "status" sont requis.',
    });
  }

  try {
    // Si c'est un envoi vers un livreur, vérifier que le livreur existe
    let deliveryPersonName;
    if (deliveryType === 'livreur' && deliveryPersonId) {
      const deliveryPerson = await User.findById(deliveryPersonId);
      if (!deliveryPerson || deliveryPerson.role !== 'livreur') {
        return res.status(400).json({
          success: false,
          message: 'Livreur non trouvé ou invalide.',
        });
      }
      deliveryPersonName = `${deliveryPerson.firstName} ${deliveryPerson.lastName}`;
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
      deliveryType: deliveryType || 'api_dhd',
      deliveryPersonId: deliveryType === 'livreur' ? deliveryPersonId : undefined,
      deliveryPersonName,
      row
    };

    console.log('💾 Sauvegarde de la commande:', {
      rowId: String(rowId),
      status: String(status),
      deliveryType: deliveryType || 'api_dhd',
      deliveryPersonId: deliveryType === 'livreur' ? deliveryPersonId : undefined,
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