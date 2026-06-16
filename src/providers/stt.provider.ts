import FormData from 'form-data';
import axios, { type AxiosError } from 'axios';
import { env } from '../config/env.js';
import { getAppConfig } from '../config/runtime-config.js';
import { AppError } from '../middlewares/errorHandler.js';
import { logger } from '../utils/logger.js';
import { voiceLog } from '../utils/voice-logger.js';

export interface SttTranscriptionResult {
  text: string;
  model: string;
  language?: string;
  rawText?: string;
  durationMs: number;
  audioDurationSec?: number;
  mimeType?: string;
  sizeBytes?: number;
}

function resolveMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

function mapSttAxiosError(error: AxiosError): AppError {
  const url = getAppConfig().STT_SERVICE_URL;
  const responseDetail = (error.response?.data as { detail?: string })?.detail;

  if (error.code === 'ECONNREFUSED') {
    voiceLog.error('STT', 'Conexão recusada — serviço Whisper não está rodando', {
      url,
      code: error.code,
    });
    return new AppError(
      503,
      'Serviço de transcrição (Whisper) indisponível. Inicie o processo whisper-stt (porta 8001).',
      'SttServiceOffline',
    );
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    voiceLog.error('STT', 'Timeout ao contactar serviço Whisper', {
      url,
      code: error.code,
      timeoutMs: env.STT_TIMEOUT_MS,
    });
    return new AppError(
      504,
      'Tempo esgotado ao transcrever áudio. Tente novamente com um áudio mais curto.',
      'SttTimeout',
    );
  }

  if (error.response?.status === 503) {
    voiceLog.error('STT', 'Serviço Whisper indisponível (503)', {
      url,
      detail: responseDetail ?? error.message,
    });
    return new AppError(
      503,
      responseDetail ?? 'Serviço de transcrição (Whisper) ainda não está pronto.',
      'SttServiceUnavailable',
    );
  }

  voiceLog.error('STT', 'Falha na transcrição local', {
    url,
    status: error.response?.status,
    code: error.code,
    detail: responseDetail ?? error.message,
  });

  return new AppError(
    502,
    responseDetail ?? 'Falha ao transcrever áudio no serviço Whisper local.',
    'SttServiceError',
  );
}

export async function transcribeAudioLocal(
  buffer: Buffer,
  filename: string,
): Promise<SttTranscriptionResult> {
  const config = getAppConfig();

  if (config.STT_PROVIDER !== 'local') {
    throw new AppError(500, 'Provedor STT não suportado', 'SttProviderError');
  }

  const mimeType = resolveMimeType(filename);
  const started = Date.now();

  voiceLog.stt('Enviando áudio para serviço Whisper local', {
    filename,
    mimeType,
    sizeBytes: buffer.length,
    url: config.STT_SERVICE_URL,
  });

  try {
    const form = new FormData();
    form.append('audio', buffer, { filename, contentType: mimeType });

    const { data } = await axios.post<SttTranscriptionResult>(
      `${config.STT_SERVICE_URL}/transcribe`,
      form,
      {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: env.STT_TIMEOUT_MS,
      },
    );

    voiceLog.whisper('Transcrição local concluída', {
      model: data.model,
      language: data.language,
      durationMs: data.durationMs ?? Date.now() - started,
      audioDurationSec: data.audioDurationSec,
      textLength: data.text.length,
      preview: data.text.slice(0, 120),
    });

    return data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw mapSttAxiosError(error);
    }

    voiceLog.error('STT', 'Erro inesperado na transcrição', { message: (error as Error).message });
    throw new AppError(502, 'Falha ao transcrever áudio localmente', 'SttServiceError');
  }
}

export async function checkSttHealth(): Promise<boolean> {
  try {
    const { data } = await axios.get(`${getAppConfig().STT_SERVICE_URL}/health`, { timeout: 5000 });
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function logSttStartupStatus(): Promise<void> {
  const config = getAppConfig();

  if (config.STT_PROVIDER !== 'local') {
    voiceLog.stt('Provedor STT não-local — verificação ignorada', { provider: config.STT_PROVIDER });
    return;
  }

  const url = config.STT_SERVICE_URL;
  const online = await checkSttHealth();

  if (online) {
    console.log('[STT] Online');
    voiceLog.stt('Serviço Whisper acessível', { url });
    return;
  }

  console.warn('[STT] Offline');
  logger.warn('[STT] Offline — transcrição de voz falhará até whisper-stt estar ativo', {
    url,
    hint: 'pm2 start ecosystem.config.js  (sobe api-ordin-flow + whisper-stt)',
    manual: 'bash services/stt/start.sh',
  });
}
