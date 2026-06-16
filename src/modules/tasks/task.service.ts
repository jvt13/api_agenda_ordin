import { Task, TaskActivity } from '@prisma/client';
import { taskRepository } from './task.repository.js';
import {
  processTextWithAI,
  structureTaskFromTextWithFallback,
  StructuredTaskAI,
} from '../../providers/gemini.provider.js';
import { transcribeAudioLocal } from '../../providers/stt.provider.js';
import { processVoicePipeline } from '../voice/voice.pipeline.js';
import { uploadBuffer } from '../../providers/storage.provider.js';
import { voiceLog } from '../../utils/voice-logger.js';
import { logDueDate, parseDueDateOrThrow } from '../../utils/due-date.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { logger } from '../../utils/logger.js';
import type {
  ConfirmTaskDTO,
  CreateTextTaskDTO,
  DashboardStatsDTO,
  TaskDraftDTO,
  TaskFiltersDTO,
  TaskResponseDTO,
  UpdateTaskDTO,
} from './task.dto.js';

type Attachment = { id: string; url: string; note?: string | null; createdAt?: string };

function extractAttachments(task: Task): Attachment[] {
  const raw = task.aiRawResponse as { attachments?: Attachment[]; attachedPhotos?: string[] } | null;
  const attachments: Attachment[] = [];

  if (raw?.attachments?.length) {
    for (const item of raw.attachments) {
      if (!item?.url) continue;
      attachments.push(item);
    }
  }

  if (attachments.length === 0 && raw?.attachedPhotos?.length) {
    for (const url of raw.attachedPhotos) {
      if (!url) continue;
      attachments.push({ id: `legacy_${attachments.length}_${Date.now()}`, url, note: null });
    }
  }

  if (task.imageUrl && !attachments.some((a) => a.url === task.imageUrl)) {
    attachments.unshift({ id: 'primary', url: task.imageUrl, note: null });
  }

  return attachments;
}

function mapTask(task: Task): TaskResponseDTO {
  const attachments = extractAttachments(task);
  const imageUrls = attachments.map((a) => a.url);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    transcription: task.transcription,
    priority: task.priority,
    category: task.category,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    latitude: task.latitude,
    longitude: task.longitude,
    address: task.address,
    audioUrl: task.audioUrl,
    imageUrl: imageUrls[0] ?? task.imageUrl,
    imageUrls,
    attachments,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function applyAIStructure(
  structured: StructuredTaskAI,
  existing?: {
    priorityEditedByUser: boolean;
    dueDateEditedByUser: boolean;
    categoryEditedByUser: boolean;
    priority: Task['priority'];
    category: Task['category'];
    dueDate: Date | null;
  },
) {
  const priority =
    existing?.priorityEditedByUser && existing.priority
      ? existing.priority
      : structured.priority ?? (structured.urgency ? 'URGENT' : 'MEDIUM');

  const category =
    existing?.categoryEditedByUser && existing.category
      ? existing.category
      : structured.category ?? 'OTHER';

  const dueDate =
    existing?.dueDateEditedByUser && existing.dueDate
      ? existing.dueDate
      : structured.dueDate
        ? new Date(structured.dueDate)
        : null;

  return { priority, category, dueDate };
}

export class TaskService {
  async buildDraftFromText(data: CreateTextTaskDTO): Promise<TaskDraftDTO> {
    return {
      transcription: data.text.trim(),
      attachedPhotos: [],
      audioReference: null,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
    };
  }

  async buildDraftFromVoice(
    audioBuffer: Buffer,
    filename: string,
    location?: { latitude?: number; longitude?: number; address?: string },
  ): Promise<TaskDraftDTO> {
    const audioUrl = await uploadBuffer(audioBuffer, 'audio', 'audio/m4a');
    const stt = await transcribeAudioLocal(audioBuffer, filename);

    voiceLog.whisper('Draft de voz — apenas STT (sem Gemini)', {
      textLength: stt.text.length,
      preview: stt.text.slice(0, 120),
    });

    return {
      transcription: stt.text,
      attachedPhotos: [] as string[],
      audioReference: audioUrl,
      aiRawResponse: {
        stt: {
          model: stt.model,
          durationMs: stt.durationMs,
          language: stt.language,
          mimeType: stt.mimeType,
          sizeBytes: stt.sizeBytes,
          audioDurationSec: stt.audioDurationSec,
        },
      },
      latitude: location?.latitude,
      longitude: location?.longitude,
      address: location?.address,
    };
  }

  async uploadImageAttachment(imageBuffer: Buffer, mimeType: string): Promise<{ url: string }> {
    const url = await uploadBuffer(imageBuffer, 'images', mimeType);
    return { url };
  }

  async confirmDraft(userId: string, draft: ConfirmTaskDTO): Promise<TaskResponseDTO> {
    const finalText = (draft.finalText ?? draft.transcription ?? '').trim();
    if (!finalText) {
      throw new AppError(400, 'Texto da tarefa é obrigatório para salvar', 'MissingTaskText');
    }

    voiceLog.gemini('Interpretação única no confirmar (texto final)', {
      textLength: finalText.length,
    });

    const aiResult = await structureTaskFromTextWithFallback(finalText);
    const { priority, category, dueDate: aiDueDate } = applyAIStructure(aiResult.structured);

    logDueDate('Confirmar tarefa — dueDate recebido', { dueDate: draft.dueDate ?? null });
    const userDueDate = parseDueDateOrThrow(draft.dueDate ?? null);
    const dueDate = userDueDate ?? aiDueDate;
    logDueDate('DueDate resolvido', {
      userDueDate: userDueDate?.toISOString() ?? null,
      aiDueDate: aiDueDate?.toISOString() ?? null,
      final: dueDate?.toISOString() ?? null,
    });

    let geminiPayload: object;
    try {
      geminiPayload = JSON.parse(aiResult.rawResponse);
    } catch {
      geminiPayload = { raw: aiResult.rawResponse };
    }

    const sttMeta =
      typeof draft.aiRawResponse === 'object' &&
      draft.aiRawResponse !== null &&
      'stt' in (draft.aiRawResponse as Record<string, unknown>)
        ? (draft.aiRawResponse as { stt: object }).stt
        : undefined;

    const attachmentItems =
      draft.attachments?.length
        ? draft.attachments.map((a) => ({
            ...a,
            createdAt: a.createdAt ?? new Date().toISOString(),
          }))
        : draft.attachedPhotos.map((url, idx) => ({
            id: `legacy_${idx}_${Date.now()}`,
            url,
            note: null,
            createdAt: new Date().toISOString(),
          }));

    const aiRawResponse = {
      gemini: geminiPayload,
      ...(sttMeta ? { stt: sttMeta } : {}),
      attachedPhotos: attachmentItems.map((a) => a.url),
      attachments: attachmentItems,
      ...(aiResult.geminiFailed
        ? {
            processingStatus: 'partial',
            geminiFailed: true,
            geminiError: aiResult.geminiError,
            retryable: true,
          }
        : { processingStatus: 'complete' }),
    };

    const imageUrls = attachmentItems.map((a) => a.url).filter(Boolean);
    const imageUrl = imageUrls[0] ?? null;

    const task = await taskRepository.create({
      title: draft.title?.trim() || aiResult.structured.title,
      description: aiResult.structured.description ?? finalText,
      transcription: finalText,
      priority: draft.priority ?? priority,
      category: draft.category ?? category,
      dueDate,
      dueDateEditedByUser: Boolean(userDueDate),
      latitude: draft.latitude ?? null,
      longitude: draft.longitude ?? null,
      address: draft.address ?? null,
      audioUrl: draft.audioReference ?? null,
      imageUrl,
      aiRawResponse,
      user: { connect: { id: userId } },
      activities: {
        create: [
          { type: 'CREATED', message: 'Tarefa criada após revisão do rascunho' },
          {
            type: 'AI_PROCESSED',
            message: aiResult.geminiFailed
              ? 'Gemini indisponível — tarefa salva com estruturação parcial'
              : 'Gemini estruturou o texto final da tarefa',
            metadata: aiRawResponse,
          },
          ...(draft.audioReference
            ? [{ type: 'ATTACHMENT_ADDED' as const, message: 'Áudio anexado', metadata: { audioUrl: draft.audioReference } }]
            : []),
          ...(imageUrls.length > 0
            ? imageUrls.map((url) => ({
                type: 'ATTACHMENT_ADDED' as const,
                message: 'Imagem anexada',
                metadata: { imageUrl: url },
              }))
            : []),
        ],
      },
    });

    logger.info('Tarefa confirmada a partir de rascunho', { taskId: task.id, userId });
    return mapTask(task);
  }

  async createFromText(userId: string, data: CreateTextTaskDTO): Promise<TaskResponseDTO> {
    const { structured, rawResponse } = await processTextWithAI(data.text);
    const { priority, category, dueDate } = applyAIStructure(structured);

    const task = await taskRepository.create({
      title: structured.title,
      description: structured.description ?? data.text,
      transcription: data.text,
      aiRawResponse: JSON.parse(rawResponse),
      priority,
      category,
      dueDate,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      user: { connect: { id: userId } },
      activities: {
        create: [
          { type: 'CREATED', message: 'Tarefa criada por texto' },
          { type: 'AI_PROCESSED', message: 'IA estruturou a tarefa', metadata: JSON.parse(rawResponse) },
        ],
      },
    });

    logger.info('Tarefa criada por texto', { taskId: task.id, userId });
    return mapTask(task);
  }

  async createFromVoice(
    userId: string,
    audioBuffer: Buffer,
    filename: string,
    location?: { latitude?: number; longitude?: number; address?: string },
  ): Promise<TaskResponseDTO> {
    const audioUrl = await uploadBuffer(audioBuffer, 'audio', 'audio/m4a');

    let pipeline: Awaited<ReturnType<typeof processVoicePipeline>>;

    try {
      pipeline = await processVoicePipeline(audioBuffer, filename);
    } catch (error) {
      logger.error('Pipeline de voz falhou — áudio preservado', {
        audioUrl,
        filename,
        error: (error as Error).message,
      });
      throw error;
    }

    const { transcription, structured, rawResponse, sttMetadata, geminiFailed, geminiError } =
      pipeline;
    const { priority, category, dueDate } = applyAIStructure(structured);

    let aiPayload: object;
    try {
      aiPayload = JSON.parse(rawResponse);
    } catch {
      aiPayload = { raw: rawResponse };
    }

    const aiRawResponse = {
      gemini: aiPayload,
      stt: sttMetadata,
      ...(geminiFailed
        ? {
            processingStatus: 'partial',
            geminiFailed: true,
            geminiError,
            retryable: true,
          }
        : { processingStatus: 'complete' }),
    };

    const activities: Array<{
      type: 'CREATED' | 'AI_PROCESSED' | 'ATTACHMENT_ADDED';
      message: string;
      metadata?: object;
    }> = [
      { type: 'CREATED', message: 'Tarefa criada por voz' },
      {
        type: 'AI_PROCESSED',
        message: geminiFailed
          ? 'Whisper transcreveu; Gemini indisponível — tarefa salva com estruturação parcial (retry possível)'
          : 'Whisper transcreveu e Gemini estruturou a tarefa',
        metadata: {
          transcription,
          stt: sttMetadata,
          gemini: aiPayload,
          geminiFailed,
          ...(geminiError ? { geminiError } : {}),
        },
      },
      { type: 'ATTACHMENT_ADDED', message: 'Áudio original salvo', metadata: { audioUrl } },
    ];

    const task = await taskRepository.create({
      title: structured.title,
      description: structured.description ?? transcription,
      transcription,
      aiRawResponse,
      priority,
      category,
      dueDate,
      audioUrl,
      latitude: location?.latitude,
      longitude: location?.longitude,
      address: location?.address,
      user: { connect: { id: userId } },
      activities: { create: activities },
    });

    logger.info('Tarefa criada por voz', { taskId: task.id, userId });
    return mapTask(task);
  }

  async createFromPhoto(
    userId: string,
    imageBuffer: Buffer,
    mimeType: string,
    text?: string,
    location?: { latitude?: number; longitude?: number; address?: string },
  ): Promise<TaskResponseDTO> {
    const imageUrl = await uploadBuffer(imageBuffer, 'images', mimeType);

    let title = 'Tarefa com foto';
    let description: string | undefined;
    let priority = 'MEDIUM' as Task['priority'];
    let category = 'OTHER' as Task['category'];
    let dueDate: Date | null = null;
    let aiRawResponse: object | undefined;
    let transcription: string | undefined;

    if (text?.trim()) {
      const ai = await processTextWithAI(text.trim());
      const applied = applyAIStructure(ai.structured);
      title = ai.structured.title;
      description = ai.structured.description ?? text;
      priority = applied.priority;
      category = applied.category;
      dueDate = applied.dueDate;
      aiRawResponse = JSON.parse(ai.rawResponse);
      transcription = text;
    }

    const task = await taskRepository.create({
      title,
      description,
      transcription,
      aiRawResponse,
      priority,
      category,
      dueDate,
      imageUrl,
      latitude: location?.latitude,
      longitude: location?.longitude,
      address: location?.address,
      user: { connect: { id: userId } },
      activities: {
        create: [
          { type: 'CREATED', message: 'Tarefa criada com foto' },
          { type: 'ATTACHMENT_ADDED', message: 'Imagem anexada', metadata: { imageUrl } },
          ...(text ? [{ type: 'AI_PROCESSED' as const, message: 'IA estruturou descrição', metadata: aiRawResponse }] : []),
        ],
      },
    });

    logger.info('Tarefa criada com foto', { taskId: task.id, userId });
    return mapTask(task);
  }

  async list(userId: string, filters: TaskFiltersDTO) {
    const result = await taskRepository.findMany(userId, filters);
    return {
      ...result,
      tasks: result.tasks.map(mapTask),
    };
  }

  async getById(userId: string, id: string) {
    const task = await taskRepository.findById(id, userId);
    if (!task) {
      throw new AppError(404, 'Tarefa não encontrada', 'TaskNotFound');
    }
    return {
      ...mapTask(task),
      activities: task.activities.map((a: TaskActivity) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async update(userId: string, id: string, data: UpdateTaskDTO) {
    const existing = await taskRepository.findById(id, userId);
    if (!existing) {
      throw new AppError(404, 'Tarefa não encontrada', 'TaskNotFound');
    }

    const updateData: Record<string, unknown> = { ...data };

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? parseDueDateOrThrow(data.dueDate) : null;
      updateData.dueDateEditedByUser = true;
    }
    if (data.priority !== undefined) {
      updateData.priorityEditedByUser = true;
    }
    if (data.category !== undefined) {
      updateData.categoryEditedByUser = true;
    }

    const textChanged =
      (data.transcription !== undefined && data.transcription !== (existing.transcription ?? '')) ||
      (data.description !== undefined && data.description !== (existing.description ?? '')) ||
      (data.title !== undefined && data.title !== existing.title);

    if (textChanged) {
      const finalText = (
        data.transcription ??
        data.description ??
        `${data.title ?? ''} ${existing.title ?? ''}`.trim() ??
        existing.transcription ??
        existing.description ??
        existing.title
      ).trim();

      if (finalText) {
        voiceLog.gemini('Reestruturação por edição de texto', {
          taskId: id,
          textLength: finalText.length,
        });

        const ai = await structureTaskFromTextWithFallback(finalText);
        const applied = applyAIStructure(ai.structured, {
          priorityEditedByUser: existing.priorityEditedByUser,
          dueDateEditedByUser: existing.dueDateEditedByUser,
          categoryEditedByUser: existing.categoryEditedByUser,
          priority: existing.priority,
          category: existing.category,
          dueDate: existing.dueDate,
        });

        if (data.priority === undefined && !existing.priorityEditedByUser) {
          updateData.priority = applied.priority;
        }
        if (data.category === undefined && !existing.categoryEditedByUser) {
          updateData.category = applied.category;
        }
        if (data.dueDate === undefined && !existing.dueDateEditedByUser) {
          updateData.dueDate = applied.dueDate;
        }

        let geminiPayload: object;
        try {
          geminiPayload = JSON.parse(ai.rawResponse);
        } catch {
          geminiPayload = { raw: ai.rawResponse };
        }

        const incomingAi =
          typeof data.aiRawResponse === 'object' && data.aiRawResponse !== null
            ? (data.aiRawResponse as object)
            : {};

        updateData.aiRawResponse = {
          ...(typeof existing.aiRawResponse === 'object' && existing.aiRawResponse !== null
            ? (existing.aiRawResponse as object)
            : {}),
          ...incomingAi,
          gemini: geminiPayload,
          reprocessedOnUpdate: true,
          reprocessedAt: new Date().toISOString(),
          ...(ai.geminiFailed
            ? { processingStatus: 'partial', geminiFailed: true, geminiError: ai.geminiError }
            : {}),
        };
      }
    }

    if (!textChanged && data.aiRawResponse !== undefined) {
      updateData.aiRawResponse = data.aiRawResponse as object;
    }

    await taskRepository.update(id, userId, updateData);
    await taskRepository.addActivity(id, 'UPDATED', 'Tarefa atualizada manualmente', data as object);

    if (data.status && data.status !== existing.status) {
      await taskRepository.addActivity(id, 'STATUS_CHANGED', `Status alterado para ${data.status}`);
    }

    const updated = await taskRepository.getUpdated(id, userId);
    return mapTask(updated!);
  }

  async delete(userId: string, id: string) {
    const result = await taskRepository.delete(id, userId);
    if (result.count === 0) {
      throw new AppError(404, 'Tarefa não encontrada', 'TaskNotFound');
    }
    logger.info('Tarefa excluída', { taskId: id, userId });
  }

  async dashboard(userId: string): Promise<DashboardStatsDTO> {
    return taskRepository.getDashboardStats(userId);
  }
}

export const taskService = new TaskService();
