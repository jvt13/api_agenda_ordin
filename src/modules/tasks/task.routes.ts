import { FastifyInstance } from 'fastify';
import { taskService } from './task.service.js';
import { confirmTaskSchema, createTextTaskSchema, taskFiltersSchema, updateTaskSchema } from './task.dto.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { AppError } from '../../middlewares/errorHandler.js';

export async function taskRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/dashboard', async (request, reply) => {
    const stats = await taskService.dashboard(request.userId!);
    return reply.send(stats);
  });

  app.get('/', async (request, reply) => {
    const filters = taskFiltersSchema.parse(request.query);
    const result = await taskService.list(request.userId!, filters);
    return reply.send(result);
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await taskService.getById(request.userId!, id);
    return reply.send(task);
  });

  app.post('/text', async (request, reply) => {
    const body = createTextTaskSchema.parse(request.body);
    const task = await taskService.createFromText(request.userId!, body);
    return reply.status(201).send(task);
  });

  app.post('/text/draft', async (request, reply) => {
    const body = createTextTaskSchema.parse(request.body);
    const draft = await taskService.buildDraftFromText(body);
    return reply.send(draft);
  });

  app.post('/voice', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'Arquivo de áudio obrigatório', 'MissingAudio');
    }

    const buffer = await data.toBuffer();
    const fields = data.fields as Record<string, { value?: string } | undefined>;
    const latitude = fields.latitude?.value ? parseFloat(fields.latitude.value) : undefined;
    const longitude = fields.longitude?.value ? parseFloat(fields.longitude.value) : undefined;
    const address = fields.address?.value;

    const task = await taskService.createFromVoice(
      request.userId!,
      buffer,
      data.filename ?? 'recording.m4a',
      { latitude, longitude, address },
    );

    return reply.status(201).send(task);
  });

  app.post('/voice/draft', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'Arquivo de áudio obrigatório', 'MissingAudio');
    }

    const buffer = await data.toBuffer();
    const fields = data.fields as Record<string, { value?: string } | undefined>;
    const latitude = fields.latitude?.value ? parseFloat(fields.latitude.value) : undefined;
    const longitude = fields.longitude?.value ? parseFloat(fields.longitude.value) : undefined;
    const address = fields.address?.value;

    const draft = await taskService.buildDraftFromVoice(
      buffer,
      data.filename ?? 'recording.m4a',
      { latitude, longitude, address },
    );

    return reply.send(draft);
  });

  app.post('/photo', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'Arquivo de imagem obrigatório', 'MissingImage');
    }

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype ?? 'image/jpeg';
    const fields = data.fields as Record<string, { value?: string } | undefined>;
    const text = fields.text?.value;
    const latitude = fields.latitude?.value ? parseFloat(fields.latitude.value) : undefined;
    const longitude = fields.longitude?.value ? parseFloat(fields.longitude.value) : undefined;
    const address = fields.address?.value;

    const task = await taskService.createFromPhoto(
      request.userId!,
      buffer,
      mimeType,
      text,
      { latitude, longitude, address },
    );

    return reply.status(201).send(task);
  });

  app.post('/attachments/image', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'Arquivo de imagem obrigatório', 'MissingImage');
    }

    const buffer = await data.toBuffer();
    const mimeType = data.mimetype ?? 'image/jpeg';
    const result = await taskService.uploadImageAttachment(buffer, mimeType);
    return reply.send(result);
  });

  app.post('/confirm', async (request, reply) => {
    const body = confirmTaskSchema.parse(request.body);
    const task = await taskService.confirmDraft(request.userId!, body);
    return reply.status(201).send(task);
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateTaskSchema.parse(request.body);
    const task = await taskService.update(request.userId!, id, body);
    return reply.send(task);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await taskService.delete(request.userId!, id);
    return reply.status(204).send();
  });
}
