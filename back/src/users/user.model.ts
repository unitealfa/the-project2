import { Document, model } from 'mongoose';
import { UserSchema } from './user.schema';

export interface IUser extends Document {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  role:      'admin' | 'gestionnaire' | 'confirmateur' | 'livreur';
  tokenVersion: number;
}

export default model<IUser>('User', UserSchema);
