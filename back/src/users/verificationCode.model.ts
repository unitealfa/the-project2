import { Document, Schema, Types, model } from 'mongoose';

export interface IVerificationCode extends Document {
  userId: Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiration: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationCodeSchema = new Schema<IVerificationCode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, required: true, default: 0, min: 0, max: 5 },
    expiration: { type: Date, required: true, expires: 0 },
  },
  {
    collection: 'verification_codes',
    timestamps: true,
  }
);

export default model<IVerificationCode>('VerificationCode', VerificationCodeSchema);
