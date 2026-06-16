import axios from 'axios';
import { getAppConfig, isCloudinaryConfigured } from '../../config/runtime-config.js';
import { prisma } from '../../config/database.js';
import { checkSttHealth } from '../../providers/stt.provider.js';
import { getActiveGeminiModel, isGeminiInitialized } from '../../providers/gemini.provider.js';

export type ServiceHealthStatus = 'ONLINE' | 'OFFLINE';

export interface ServiceHealthItem {
  name: string;
  status: ServiceHealthStatus;
  detail?: string;
}

export interface SystemHealthResponse {
  checkedAt: string;
  services: ServiceHealthItem[];
}

async function checkPostgres(): Promise<ServiceHealthItem> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'PostgreSQL', status: 'ONLINE' };
  } catch (error) {
    return {
      name: 'PostgreSQL',
      status: 'OFFLINE',
      detail: (error as Error).message,
    };
  }
}

async function checkGemini(): Promise<ServiceHealthItem> {
  const config = getAppConfig();

  if (!config.GEMINI_API_KEY) {
    return { name: 'Gemini', status: 'OFFLINE', detail: 'GEMINI_API_KEY não configurada' };
  }

  if (!isGeminiInitialized()) {
    return { name: 'Gemini', status: 'OFFLINE', detail: 'Provider não inicializado' };
  }

  try {
    const model = getActiveGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
    const response = await axios.get(url, { timeout: 8000 });

    if (response.status === 200) {
      return { name: 'Gemini', status: 'ONLINE', detail: `modelo=${model}` };
    }

    return { name: 'Gemini', status: 'OFFLINE', detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      name: 'Gemini',
      status: 'OFFLINE',
      detail: (error as Error).message,
    };
  }
}

async function checkWhisper(): Promise<ServiceHealthItem> {
  const config = getAppConfig();

  if (config.STT_PROVIDER !== 'local') {
    return { name: 'Whisper', status: 'OFFLINE', detail: 'STT_PROVIDER não é local' };
  }

  const online = await checkSttHealth();
  if (online) {
    return { name: 'Whisper', status: 'ONLINE', detail: config.STT_SERVICE_URL };
  }

  return {
    name: 'Whisper',
    status: 'OFFLINE',
    detail: `Inacessível em ${config.STT_SERVICE_URL}`,
  };
}

async function checkCloudinary(): Promise<ServiceHealthItem> {
  const config = getAppConfig();

  if (!isCloudinaryConfigured(config)) {
    return {
      name: 'Cloudinary',
      status: 'OFFLINE',
      detail: 'Não configurado — usando uploads locais',
    };
  }

  try {
    const response = await axios.get(
      `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/usage`,
      {
        auth: {
          username: config.CLOUDINARY_API_KEY,
          password: config.CLOUDINARY_API_SECRET,
        },
        timeout: 8000,
      },
    );

    if (response.status === 200) {
      return { name: 'Cloudinary', status: 'ONLINE' };
    }

    return { name: 'Cloudinary', status: 'OFFLINE', detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      name: 'Cloudinary',
      status: 'OFFLINE',
      detail: (error as Error).message,
    };
  }
}

export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const [postgres, gemini, whisper, cloudinary] = await Promise.all([
    checkPostgres(),
    checkGemini(),
    checkWhisper(),
    checkCloudinary(),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    services: [
      { name: 'API', status: 'ONLINE' },
      postgres,
      gemini,
      whisper,
      cloudinary,
    ],
  };
}
