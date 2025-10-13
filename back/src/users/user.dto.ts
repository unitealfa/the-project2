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

export interface ForgotPasswordDto {
  email: string;
}

export interface VerifyCodeDto {
  email: string;
  code:  string;
}