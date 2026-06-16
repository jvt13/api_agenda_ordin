import '../src/config/load-env.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@agenda.com' },
    update: {},
    create: {
      name: 'Usuário Demo',
      email: 'demo@agenda.com',
      passwordHash,
      role: 'USER',
    },
  });

  const adminPasswordHash = await bcrypt.hash('123456', 10);
  await prisma.user.upsert({
    where: { email: 'admin@agenda.com' },
    update: { role: 'ADMIN' },
    create: {
      name: 'Administrador',
      email: 'admin@agenda.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.task.createMany({
    data: [
      {
        userId: user.id,
        title: 'Verificar câmera estacionamento bloco B',
        description: 'Checar funcionamento das câmeras de segurança',
        priority: 'HIGH',
        category: 'SECURITY',
        status: 'PENDING',
        dueDate: tomorrow,
      },
      {
        userId: user.id,
        title: 'Trocar lâmpada corredor principal',
        description: 'Lâmpada queimada reportada pela equipe',
        priority: 'URGENT',
        category: 'MAINTENANCE',
        status: 'PENDING',
        dueDate: yesterday,
      },
      {
        userId: user.id,
        title: 'Relatório mensal de despesas',
        description: 'Consolidar despesas do mês anterior',
        priority: 'MEDIUM',
        category: 'FINANCIAL',
        status: 'IN_PROGRESS',
      },
      {
        userId: user.id,
        title: 'Inspeção de extintores',
        description: 'Verificação trimestral concluída',
        priority: 'LOW',
        category: 'OPERATIONAL',
        status: 'DONE',
      },
    ],
  });

  console.log('Seed concluído.');
  console.log('Demo: demo@agenda.com / 123456');
  console.log('Admin: admin@agenda.com / 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
