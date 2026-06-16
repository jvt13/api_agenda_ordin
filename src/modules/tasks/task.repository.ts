import { Prisma, TaskActivityType } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { TaskFiltersDTO } from './task.dto.js';

export class TaskRepository {
  async create(data: Prisma.TaskCreateInput) {
    return prisma.task.create({ data });
  }

  async findById(id: string, userId: string) {
    return prisma.task.findFirst({
      where: { id, userId },
      include: {
        activities: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async findMany(userId: string, filters: TaskFiltersDTO) {
    const where: Prisma.TaskWhereInput = { userId };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.dueFrom || filters.dueTo) {
      where.dueDate = {};
      if (filters.dueFrom) where.dueDate.gte = new Date(filters.dueFrom);
      if (filters.dueTo) where.dueDate.lte = new Date(filters.dueTo);
    }

    const skip = (filters.page - 1) * filters.limit;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: filters.limit,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, page: filters.page, limit: filters.limit };
  }

  async update(id: string, userId: string, data: Prisma.TaskUpdateInput) {
    return prisma.task.updateMany({
      where: { id, userId },
      data,
    });
  }

  async getUpdated(id: string, userId: string) {
    return prisma.task.findFirst({ where: { id, userId } });
  }

  async delete(id: string, userId: string) {
    return prisma.task.deleteMany({ where: { id, userId } });
  }

  async addActivity(taskId: string, type: TaskActivityType, message: string, metadata?: Prisma.InputJsonValue) {
    return prisma.taskActivity.create({
      data: { taskId, type, message, metadata },
    });
  }

  async getDashboardStats(userId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const [today, overdue, urgent, completed] = await Promise.all([
      prisma.task.count({
        where: {
          userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: startOfDay },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          priority: 'URGENT',
        },
      }),
      prisma.task.count({
        where: { userId, status: 'DONE' },
      }),
    ]);

    return { today, overdue, urgent, completed };
  }
}

export const taskRepository = new TaskRepository();
