import { Document, Schema, Types, model } from 'mongoose';

export interface IVerificationCode extends Document {
  userId: Types.ObjectId;
  code: string;
  expiration: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationCodeSchema = new Schema<IVerificationCode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    code: { type: String, required: true, maxlength: 10 },
    expiration: { type: Date, required: true },
  },
  {
    collection: 'verification_codes',
    timestamps: true,
  }
);

export default model<IVerificationCode>('VerificationCode', VerificationCodeSchema);