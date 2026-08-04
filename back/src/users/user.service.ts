// back/src/users/user.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import dotenv from 'dotenv';
import { randomInt } from 'crypto';
import User, { IUser } from './user.model';
import VerificationCode from './verificationCode.model';
import { CreateUserDto, LoginDto, VerifyCodeDto } from './user.dto';
import { getJwtSecret, getJwtSignOptions, isAuthRole } from '../config/auth';

dotenv.config();

const DUMMY_PASSWORD_HASH = bcrypt.hash('invalid-login-placeholder', 12);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const validatePassword = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new Error('Le mot de passe doit contenir entre 12 et 128 caractères');
  }
  return value;
};

const validateName = (value: unknown, label: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 80) {
    throw new Error(`${label} invalide`);
  }
  return normalized;
};

export class UserService {
  /** Authentification + JWT */
  async authenticate(dto: LoginDto): Promise<{ user: IUser; token: string }> {
    const email = normalizeEmail(dto?.email);
    const password = typeof dto?.password === 'string' ? dto.password : '';
    if (
      !EMAIL_PATTERN.test(email) ||
      email.length > 254 ||
      !password ||
      password.length > 128
    ) {
      throw new Error('Identifiants invalides');
    }
    const user = await User.findOne({ email }).select('+password +tokenVersion');
    const match = await bcrypt.compare(
      password,
      user?.password || (await DUMMY_PASSWORD_HASH)
    );
    if (!user || !match) throw new Error('Identifiants invalides');

    const payload = {
      id: (user._id as any).toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    const token = jwt.sign(payload, getJwtSecret(), getJwtSignOptions());

    return { user, token };
  }

  /** Création d'utilisateur (admin only) */
  async createUser(dto: CreateUserDto): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }> {
    const firstName = validateName(dto?.firstName, 'Prénom');
    const lastName = validateName(dto?.lastName, 'Nom');
    const email = normalizeEmail(dto?.email);
    const password = validatePassword(dto?.password);
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new Error('Adresse e-mail invalide');
    }
    const requestedRole: unknown = dto?.role;
    if (!isAuthRole(requestedRole) || requestedRole === 'admin') {
      throw new Error('Rôle invalide');
    }
    if (await User.findOne({ email })) {
      throw new Error('Email déjà utilisé');
    }
    const hash = await bcrypt.hash(password, 12);
    const u = await User.create({
      firstName,
      lastName,
      email,
      password: hash,
      role: requestedRole,
    });
    return {
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    };
  }

  /** Récupérer un user */
  async getById(id: string): Promise<IUser> {
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    return u;
  }

  /** Liste de tous les users (admin only) */
  async getAllUsers(): Promise<Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }>> {
    const users = await User.find().select('firstName lastName email role');
    return users.map(u => ({
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    }));
  }

  /** Mise à jour d'un user (admin only) */
  async updateUser(
    id: string,
    dto: Partial<CreateUserDto> & { password?: string }
  ): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: IUser['role'];
  }> {
    const u = await User.findById(id).select('+password +tokenVersion');
    if (!u) throw new Error('Utilisateur non trouvé');
    if (dto.firstName !== undefined) u.firstName = validateName(dto.firstName, 'Prénom');
    if (dto.lastName !== undefined) u.lastName = validateName(dto.lastName, 'Nom');
    let invalidateSessions = false;
    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        throw new Error('Adresse e-mail invalide');
      }
      const duplicate = await User.exists({ email, _id: { $ne: u._id } });
      if (duplicate) throw new Error('Email déjà utilisé');
      u.email = email;
      invalidateSessions = true;
    }
    if (dto.role !== undefined) {
      const requestedRole: unknown = dto.role;
      if (!isAuthRole(requestedRole)) throw new Error('Rôle invalide');
      if (u.role === 'admin' && requestedRole !== 'admin') {
        throw new Error('Le rôle de l’administrateur principal ne peut pas être modifié');
      }
      if (u.role !== 'admin' && requestedRole === 'admin') {
        throw new Error('La promotion au rôle administrateur est désactivée');
      }
      u.role = requestedRole;
      invalidateSessions = true;
    }
    if (dto.password) {
      u.password = await bcrypt.hash(validatePassword(dto.password), 12);
      invalidateSessions = true;
    }
    if (invalidateSessions) {
      u.tokenVersion = (Number.isInteger(u.tokenVersion) ? u.tokenVersion : 0) + 1;
    }
    await u.save();
    return {
      id:        (u._id as any).toString(),
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      u.role,
    };
  }

  /** Suppression d'un user (admin only, sauf admin) */
  async deleteUser(id: string): Promise<void> {
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    if (u.role === 'admin') throw new Error('Suppression de l\'admin impossible'); // FIX: guillemets échappés
    await u.deleteOne();
  }
  /** Demande de réinitialisation de mot de passe */
  async requestPasswordReset(): Promise<{ message: string; requiresVerification: boolean; maskedEmail?: string }> {
    const user = await User.findOne({ role: 'admin' });
    if (!user) throw new Error('Administrateur introuvable');

    const existingCode = await VerificationCode.findOne({ userId: user._id })
      .select('updatedAt expiration')
      .lean();
    if (
      existingCode &&
      existingCode.expiration.getTime() > Date.now() &&
      Date.now() - existingCode.updatedAt.getTime() < 60_000
    ) {
      return {
        message:
          'Un code récent a déjà été envoyé. Merci de patienter avant une nouvelle demande.',
        requiresVerification: true,
        maskedEmail: this.maskEmail(user.email),
      };
    }

    const code = this.generateVerificationCode();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const codeHash = await bcrypt.hash(code, 12);
    const verification = await VerificationCode.findOneAndUpdate(
      { userId: user._id },
      { $set: { codeHash, expiration, attempts: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await this.sendAdminVerificationEmail(user.email, code);
    } catch (error) {
      await VerificationCode.deleteOne({ _id: verification._id }).catch(() => undefined);
      throw error;
    }

    return {
      message:
        'Un code de vérification a été envoyé à l\'adresse de l\'administrateur. Merci de consulter la boîte mail pour terminer la procédure.',      requiresVerification: true,
      maskedEmail: this.maskEmail(user.email),
    };
  }

  /** Vérification du code de réinitialisation */
  async verifyResetCode(dto: VerifyCodeDto): Promise<{ message: string }> {
    const code = typeof dto?.code === 'string' ? dto.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Code de vérification invalide.');
    }
    const newPassword = validatePassword(dto?.newPassword);
    const user = await User.findOne({ role: 'admin' }).select('+password +tokenVersion');
    if (!user) throw new Error('Administrateur introuvable');

    const verification = await VerificationCode.findOne({ userId: user._id }).select('+codeHash');
    if (!verification) {
      throw new Error('Code de vérification invalide.');
    }

    if (verification.expiration.getTime() < Date.now()) {
      await VerificationCode.deleteMany({ userId: user._id });
      throw new Error('Le code de vérification a expiré.');
    }

    if (verification.attempts >= 5) {
      await verification.deleteOne();
      throw new Error('Trop de tentatives. Demandez un nouveau code.');
    }

    const codeMatches = await bcrypt.compare(code, verification.codeHash);
    if (!codeMatches) {
      verification.attempts += 1;
      if (verification.attempts >= 5) await verification.deleteOne();
      else await verification.save();
      throw new Error('Code de vérification invalide.');
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.tokenVersion =
      (Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) + 1;
    await user.save();
    await VerificationCode.deleteMany({ userId: user._id });

    return {
      message:
        'Votre mot de passe a été réinitialisé avec succès.',
    };
  }

  private generateVerificationCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;

    if (localPart.length <= 2) {
      return `${localPart[0] ?? ''}***@${domain}`;
    }

    const visibleChars = Math.min(3, localPart.length - 1);
    const start = localPart.slice(0, visibleChars);
    return `${start}***@${domain}`;
  }

  private async sendAdminVerificationEmail(targetEmail: string, code: string): Promise<void> {
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL;
    const webhookKey = process.env.GOOGLE_WEBHOOK_KEY?.trim();

    if (webhookUrl) {
      if (!webhookKey) {
        throw new Error('GOOGLE_WEBHOOK_KEY doit etre configure.');
      }
      let parsedWebhookUrl: URL;
      try {
        parsedWebhookUrl = new URL(webhookUrl);
      } catch {
        throw new Error('GOOGLE_WEBHOOK_URL est invalide.');
      }
      if (
        parsedWebhookUrl.protocol !== 'https:' ||
        parsedWebhookUrl.username ||
        parsedWebhookUrl.password
      ) {
        throw new Error('GOOGLE_WEBHOOK_URL doit utiliser HTTPS sans identifiants intégrés.');
      }
      try {
        const response = await fetch(parsedWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Key': webhookKey,
          },
          body: JSON.stringify({
            to: targetEmail,
            subject: 'Code de vérification - Réinitialisation du mot de passe administrateur',
            message: `Votre code de vérification est : ${code}`,
            sender: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          console.error('Erreur lors de l\'envoi du webhook Google', response.status);
          throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
        }

        return;
      } catch (error) {
        console.error('Erreur lors de l\'envoi du webhook Google');
        throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
      }
    }

    const transporter = await this.createFallbackTransport();

    const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    if (!fromAddress) {
      throw new Error("SMTP_FROM ou SMTP_USER doit etre configure.");
    }

    try {
      await transporter.sendMail({
        from: fromAddress,
        to: targetEmail,
        subject: 'Code de vérification - Réinitialisation du mot de passe administrateur',
        text: `Votre code de vérification est : ${code}`,
        html: `
          <p>Bonjour,</p>
          <p>Votre code de vérification pour la réinitialisation du mot de passe administrateur est :</p>
          <p style="font-size: 1.5rem; font-weight: bold; letter-spacing: 0.2rem;">${code}</p>
          <p>Ce code expirera dans 15 minutes.</p>
        `,
      });
    } catch (error) {
      console.error('Erreur lors de l\'envoi du courriel de vérification');
      throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
    }
  }

  private async createFallbackTransport(): Promise<nodemailer.Transporter<SMTPTransport.SentMessageInfo>> {
    const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT ?? '465');
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = (process.env.SMTP_PASS ?? '').replace(/\s+/g, '');
    if (!user || !pass) {
      throw new Error('SMTP_USER et SMTP_PASS doivent etre configures.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    try {
      await transporter.verify();
    } catch (error) {
      console.error('Vérification du transport SMTP échouée');
      throw new Error(
        "Le service d'envoi de courriels n'est pas correctement configuré. Merci de vérifier les identifiants SMTP."
      );
    }

    return transporter;
  }
}
