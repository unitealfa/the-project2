import { Schema } from 'mongoose';

export const UserSchema = new Schema({
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName:  { type: String, required: true, trim: true, maxlength: 80 },
  email:     { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254 },
  password:  { type: String, required: true, select: false },
  role:      { type: String, required: true, enum: ['admin','gestionnaire','confirmateur','livreur'] },
  tokenVersion: { type: Number, required: true, default: 0, select: false },
}, { timestamps: true });
