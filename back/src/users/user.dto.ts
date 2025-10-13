export interface LoginDto {
  email:    string;
  password: string;
}

export interface CreateUserDto {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  role:      'gestionnaire' | 'confirmateur';
}

export interface VerifyCodeDto {
  code: string;
}