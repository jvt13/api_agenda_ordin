import { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from './errorHandler.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userEmail?: string;
  }
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Token não fornecido', 'Unauthorized');
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    request.userId = payload.sub;
    request.userEmail = payload.email;
  } catch {
    throw new AppError(401, 'Token inválido ou expirado', 'Unauthorized');
  }
}
