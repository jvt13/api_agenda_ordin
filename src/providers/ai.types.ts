import { TaskCategory, TaskPriority } from '@prisma/client';

export interface StructuredTaskAI {
  title: string;
  description?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  dueDate?: string | null;
  urgency?: boolean;
}
