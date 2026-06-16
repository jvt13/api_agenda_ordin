import { AppError } from '../middlewares/errorHandler.js';
import { logger } from './logger.js';

export function logDueDate(message: string, meta?: Record<string, unknown>) {
  logger.info(`[DUE_DATE] ${message}`, meta);
}

export function parseDueDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    logDueDate('Data inválida recebida', { value });
    return null;
  }
  return parsed;
}

export function parseDueDateOrThrow(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseDueDateInput(value);
  if (!parsed) {
    throw new AppError(400, 'Data limite inválida', 'InvalidDueDate');
  }
  return parsed;
}
