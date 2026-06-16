import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';
import { authRepository } from '../modules/auth/auth.repository.js';
import { AppError } from './errorHandler.js';

declare module 'fastify' {
  interface FastifyRequest {
    userRole?: UserRole;
  }
}

export async function adminMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.userId) {
    throw new AppError(401, 'Token não fornecido', 'Unauthorized');
  }

  const user = await authRepository.findById(request.userId);
  if (!user || user.role !== UserRole.ADMIN) {
    throw new AppError(403, 'Acesso restrito a administradores', 'Forbidden');
  }

  request.userRole = user.role;
}
