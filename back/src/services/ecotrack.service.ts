import axios, { AxiosInstance } from 'axios';

export interface EcotrackConfig {
  baseUrl: string;
  token: string;
}

export interface EcotrackOrder {
  order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  wilaya: string;
  commune: string;
  products: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  total_amount: number;
  notes?: string;
}

export interface EcotrackOrderResponse {
  success: boolean;
  order_id: string;
  tracking_number: string;
  message?: string;
}

export interface EcotrackStatusResponse {
  success: boolean;
  status: string;
  tracking_number: string;
  last_update: string;
  message?: string;
}

export interface Wilaya {
  wilaya_id: number;
  wilaya_name: string;
}

export interface Commune {
  nom: string;
  wilaya_id: number;
  code_postal: string;
  has_stop_desk: number;
}

export class EcotrackService {
  private client: AxiosInstance;
  private config: EcotrackConfig;

  constructor(config: EcotrackConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get list of available wilayas
   */
  async getWilayas(): Promise<Wilaya[]> {
    try {
      const response = await this.client.get('/api/v1/get/wilayas');
      return response.data;
    } catch (error) {
      console.error('Error fetching wilayas:', error);
      throw new Error('Failed to fetch wilayas from ECOTRACK');
    }
  }

  /**
   * Get list of communes for a specific wilaya
   */
  async getCommunes(wilayaId: number): Promise<Commune[]> {
    try {
      const response = await this.client.get(`/api/v1/get/communes?wilaya_id=${wilayaId}`);
      return Object.values(response.data);
    } catch (error) {
      console.error('Error fetching communes:', error);
      throw new Error('Failed to fetch communes from ECOTRACK');
    }
  }

  /**
   * Create a new order in ECOTRACK
   */
  async createOrder(order: EcotrackOrder): Promise<EcotrackOrderResponse> {
    try {
      const response = await this.client.post('/api/v1/orders', order);
      return response.data;
    } catch (error) {
      console.error('Error creating order in ECOTRACK:', error);
      throw new Error('Failed to create order in ECOTRACK');
    }
  }

  /**
   * Get order status from ECOTRACK
   */
  async getOrderStatus(trackingNumber: string): Promise<EcotrackStatusResponse> {
    try {
      const response = await this.client.get(`/api/v1/orders/${trackingNumber}/status`);
      return response.data;
    } catch (error) {
      console.error('Error fetching order status from ECOTRACK:', error);
      throw new Error('Failed to fetch order status from ECOTRACK');
    }
  }

  /**
   * Update order status in ECOTRACK
   */
  async updateOrder(orderId: string, updates: Partial<EcotrackOrder>): Promise<EcotrackOrderResponse> {
    try {
      const response = await this.client.put(`/api/v1/orders/${orderId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Error updating order in ECOTRACK:', error);
      throw new Error('Failed to update order in ECOTRACK');
    }
  }

  /**
   * Request package return
   */
  async requestReturn(trackingNumber: string, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.post(`/api/v1/orders/${trackingNumber}/return`, { reason });
      return response.data;
    } catch (error) {
      console.error('Error requesting return from ECOTRACK:', error);
      throw new Error('Failed to request return from ECOTRACK');
    }
  }

  /**
   * Track delivery progress
   */
  async trackDelivery(trackingNumber: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/v1/orders/${trackingNumber}/track`);
      return response.data;
    } catch (error) {
      console.error('Error tracking delivery from ECOTRACK:', error);
      throw new Error('Failed to track delivery from ECOTRACK');
    }
  }
}
