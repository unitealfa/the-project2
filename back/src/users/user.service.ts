// back/src/users/user.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import dotenv from 'dotenv';
import User, { IUser } from './user.model';
import VerificationCode from './verificationCode.model';
import { CreateUserDto, LoginDto, VerifyCodeDto } from './user.dto';

dotenv.config();

export class UserService {
  private static readonly ADMIN_RESET_PASSWORD = 'adminadmin';
  /** Authentification + JWT */
  async authenticate(dto: LoginDto): Promise<{ user: IUser; token: string }> {
    const user = await User.findOne({ email: dto.email });
    if (!user) throw new Error('Utilisateur non trouvé');
    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new Error('Mot de passe invalide');

    const payload = { id: (user._id as any).toString(), email: user.email, role: user.role };
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET non défini');
    const token = jwt.sign(payload, secret);

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
    if (await User.findOne({ email: dto.email })) {
      throw new Error('Email déjà utilisé');
    }
    const hash = await bcrypt.hash(dto.password, 12);
    const u = await User.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hash,
      role: dto.role,
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
    const u = await User.findById(id);
    if (!u) throw new Error('Utilisateur non trouvé');
    if (dto.firstName) u.firstName = dto.firstName;
    if (dto.lastName)  u.lastName  = dto.lastName;
    if (dto.email)     u.email     = dto.email;
    if (dto.role)      u.role      = dto.role;
    if (dto.password)  u.password  = await bcrypt.hash(dto.password, 12);
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

    const code = this.generateVerificationCode();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await VerificationCode.deleteMany({ userId: user._id });
    await VerificationCode.create({ userId: user._id, code, expiration });

    await this.sendAdminVerificationEmail(user.email, code);

    return {
      message:
        'Un code de vérification a été envoyé à l\'adresse de l\'administrateur. Merci de consulter la boîte mail pour terminer la procédure.',      requiresVerification: true,
      maskedEmail: this.maskEmail(user.email),
    };
  }

  /** Vérification du code de réinitialisation */
  async verifyResetCode(dto: VerifyCodeDto): Promise<{ message: string }> {
        const user = await User.findOne({ role: 'admin' });
    if (!user) throw new Error('Administrateur introuvable');

    const verification = await VerificationCode.findOne({ userId: user._id, code: dto.code });
    if (!verification) {
      throw new Error('Code de vérification invalide.');
    }

    if (verification.expiration.getTime() < Date.now()) {
      await VerificationCode.deleteMany({ userId: user._id });
      throw new Error('Le code de vérification a expiré.');
    }

    user.password = await bcrypt.hash(UserService.ADMIN_RESET_PASSWORD, 12);
    await user.save();
    await VerificationCode.deleteMany({ userId: user._id });

    return {
      message:
        'Votre mot de passe a été réinitialisé avec succès. Utilisez “adminadmin” pour vous reconnecter et pensez à le modifier depuis votre espace administrateur.',
    };
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
    const webhookKey = process.env.GOOGLE_WEBHOOK_KEY ?? 'wkse ryxm mvwu pjhs';

        if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Key': webhookKey,
          },
          body: JSON.stringify({
            to: targetEmail,
            subject: 'Code de vérification - Réinitialisation du mot de passe administrateur',
            message: `Votre code de vérification est : ${code}`,
            sender: 'automatiquexmail@gmail.com',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Erreur lors de l\'envoi du webhook Google', response.status, errorText);
          throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
        }

        return;
      } catch (error) {
        console.error('Erreur lors de l\'envoi du webhook Google', error);
        throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
      }
    }

    const transporter = await this.createFallbackTransport();

    const fromAddress =
      process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'automatiquexmail@gmail.com';

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
      console.error('Erreur lors de l\'envoi du courriel de vérification', error);
      throw new Error('Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.');
    }
  }

  private async createFallbackTransport(): Promise<nodemailer.Transporter<SMTPTransport.SentMessageInfo>> {
    const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT ?? '465');
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    const user = process.env.SMTP_USER ?? 'automatiquexmail@gmail.com';
    const pass = (process.env.SMTP_PASS ?? 'wkse ryxm mvwu pjhs').replace(/\s+/g, '');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    try {
      await transporter.verify();
    } catch (error) {
      console.error('Vérification du transport SMTP échouée', error);
      throw new Error(
        "Le service d'envoi de courriels n'est pas correctement configuré. Merci de vérifier les identifiants SMTP."
      );
    }

    return transporter;
  }
}