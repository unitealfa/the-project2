// front/src/types.ts

/** Représente un utilisateur authentifié */
export interface User {
  id:        string;
  firstName: string;
  lastName:  string;
  email:     string;
  role:      'admin' | 'gestionnaire' | 'confirmateur';
}

/** DTO pour la création d’un nouvel utilisateur */
export interface CreateUserDto {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  role:      'gestionnaire' | 'confirmateur';
}
