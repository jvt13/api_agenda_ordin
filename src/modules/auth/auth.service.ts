import { UserRole } from '@prisma/client';
import { authRepository } from './auth.repository.js';
import { hashPassword, comparePassword, sanitizeString } from '../../utils/password.js';
import {
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
  signAccessToken,
} from '../../utils/jwt.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import type { AuthResponseDTO, LoginDTO, RegisterDTO } from './auth.dto.js';

export class AuthService {
  private formatUser(user: { id: string; name: string; email: string; role: UserRole }) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  private async ensureBootstrapAdmin(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  }) {
    const bootstrapEmail = env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
    if (!bootstrapEmail || user.email.toLowerCase() !== bootstrapEmail) {
      return user;
    }

    if (user.role === UserRole.ADMIN) {
      return user;
    }

    const updated = await authRepository.updateRole(user.id, UserRole.ADMIN);
    logger.info('Usuário promovido a administrador via ADMIN_BOOTSTRAP_EMAIL', {
      userId: updated.id,
      email: updated.email,
    });
    return updated;
  }

  private async issueTokens(user: { id: string; email: string; name: string; role: UserRole }): Promise<AuthResponseDTO> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = generateRefreshTokenValue();

    await authRepository.saveRefreshToken(user.id, refreshToken, getRefreshTokenExpiry());

    return {
      user: this.formatUser(user),
      accessToken,
      refreshToken,
    };
  }

  async register(data: RegisterDTO): Promise<AuthResponseDTO> {
    const existing = await authRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError(409, 'E-mail já cadastrado', 'EmailExists');
    }

    const passwordHash = await hashPassword(data.password);
    const bootstrapEmail = env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
    const role =
      bootstrapEmail && data.email.toLowerCase() === bootstrapEmail
        ? UserRole.ADMIN
        : UserRole.USER;

    const user = await authRepository.create({
      name: sanitizeString(data.name),
      email: data.email.toLowerCase(),
      passwordHash,
      role,
    });

    logger.info('Usuário registrado', { userId: user.id });
    return this.issueTokens(user);
  }

  async login(data: LoginDTO): Promise<AuthResponseDTO> {
    const user = await authRepository.findByEmail(data.email.toLowerCase());
    if (!user) {
      throw new AppError(401, 'Credenciais inválidas', 'InvalidCredentials');
    }

    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Credenciais inválidas', 'InvalidCredentials');
    }

    logger.info('Login realizado', { userId: user.id });
    const adminUser = await this.ensureBootstrapAdmin(user);
    return this.issueTokens(adminUser);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDTO> {
    const stored = await authRepository.findRefreshToken(refreshToken);
    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await authRepository.deleteRefreshToken(refreshToken);
      throw new AppError(401, 'Refresh token inválido', 'InvalidRefreshToken');
    }

    await authRepository.deleteRefreshToken(refreshToken);
    logger.info('Token renovado', { userId: stored.userId });
    const adminUser = await this.ensureBootstrapAdmin(stored.user);
    return this.issueTokens(adminUser);
  }

  async logout(refreshToken: string): Promise<void> {
    await authRepository.deleteRefreshToken(refreshToken);
    logger.info('Logout realizado');
  }

  async getProfile(userId: string) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'Usuário não encontrado', 'UserNotFound');
    }
    return this.formatUser(user);
  }
}

export const authService = new AuthService();
