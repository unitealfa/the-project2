// front/src/types.ts

/** Représente un utilisateur authentifié */
export interface User {
  id:        string;
  firstName: string;
  lastName:  string;
  email:     string;
  role:      'admin' | 'gestionnaire' | 'confirmateur' | 'livreur';
}

/** DTO pour la création d'un nouvel utilisateur */
export interface CreateUserDto {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  role:      'gestionnaire' | 'confirmateur' | 'livreur';
}

export interface ProductDto {
  id?: string;
  code?: string;
  name: string;
  costPrice: number; // prix d'achat
  salePrice: number; // prix de vente
  image?: string;
  variants: Array<{ name: string; quantity: number }>;
}