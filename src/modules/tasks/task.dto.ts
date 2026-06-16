import { z } from 'zod';
import { TaskCategory, TaskPriority, TaskStatus } from '@prisma/client';

export const taskStatusEnum = z.nativeEnum(TaskStatus);
export const taskPriorityEnum = z.nativeEnum(TaskPriority);
export const taskCategoryEnum = z.nativeEnum(TaskCategory);

export const createTextTaskSchema = z.object({
  text: z.string().min(1).max(5000),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  address: z.string().optional(),
});

export const confirmTaskSchema = z.object({
  finalText: z.string().min(1).max(10000),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  transcription: z.string().max(10000).nullable().optional(),
  priority: taskPriorityEnum.optional(),
  category: taskCategoryEnum.optional(),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || !Number.isNaN(Date.parse(v)), {
      message: 'Data limite inválida',
    }),
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  address: z.string().nullable().optional(),
  aiRawResponse: z.unknown().optional(),
  attachedPhotos: z.array(z.string().min(1)).default([]),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
        note: z.string().nullable().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
  audioReference: z.string().min(1).nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  transcription: z.string().max(10000).optional(),
  priority: taskPriorityEnum.optional(),
  category: taskCategoryEnum.optional(),
  status: taskStatusEnum.optional(),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || !Number.isNaN(Date.parse(v)), {
      message: 'Data limite inválida',
    }),
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  address: z.string().nullable().optional(),
  aiRawResponse: z.unknown().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
        note: z.string().nullable().optional(),
        createdAt: z.string().optional(),
      }),
    )
    .optional(),
});

export const taskFiltersSchema = z.object({
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  category: taskCategoryEnum.optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTextTaskDTO = z.infer<typeof createTextTaskSchema>;
export type ConfirmTaskDTO = z.infer<typeof confirmTaskSchema>;
export type UpdateTaskDTO = z.infer<typeof updateTaskSchema>;
export type TaskFiltersDTO = z.infer<typeof taskFiltersSchema>;

export interface TaskResponseDTO {
  id: string;
  title: string;
  description: string | null;
  transcription: string | null;
  priority: TaskPriority;
  category: TaskCategory;
  status: TaskStatus;
  dueDate: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  attachments: Array<{ id: string; url: string; note?: string | null; createdAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStatsDTO {
  today: number;
  overdue: number;
  urgent: number;
  completed: number;
}

export interface TaskDraftDTO {
  transcription: string | null;
  attachedPhotos: string[];
  audioReference: string | null;
  aiRawResponse?: unknown;
  latitude?: number;
  longitude?: number;
  address?: string;
}
