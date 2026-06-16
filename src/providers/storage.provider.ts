import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAppConfig, isCloudinaryConfigured } from '../config/runtime-config.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middlewares/errorHandler.js';

const uploadsRoot = path.resolve(process.cwd(), 'uploads');

export function reconfigureCloudinary(): void {
  const config = getAppConfig();

  if (!isCloudinaryConfigured(config)) {
    logger.info('[STORAGE] Cloudinary desativado — fallback local');
    return;
  }

  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
  });

  logger.info('[STORAGE] Cloudinary reconfigurado');
}

reconfigureCloudinary();

export type UploadFolder = 'audio' | 'images';

export async function uploadBuffer(
  buffer: Buffer,
  folder: UploadFolder,
  mimeType: string,
): Promise<string> {
  const config = getAppConfig();

  if (!isCloudinaryConfigured(config)) {
    const ext = mimeType.split('/')[1] ?? 'bin';
    const relativeDir = path.join(folder);
    const filename = `${Date.now()}-${randomUUID()}.${ext}`;
    const absoluteDir = path.join(uploadsRoot, relativeDir);
    const absolutePath = path.join(absoluteDir, filename);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, buffer);

    const publicPath = `/uploads/${folder}/${filename}`;
    logger.warn('Cloudinary não configurado — usando fallback local', { publicPath });
    return publicPath;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `agenda-inteligente/${folder}`,
        resource_type: folder === 'audio' ? 'video' : 'image',
      },
      (error, result) => {
        if (error || !result) {
          logger.error('Upload falhou', { error: error?.message });
          reject(new AppError(500, 'Falha no upload do arquivo', 'UploadError'));
          return;
        }
        logger.info('Upload concluído', { url: result.secure_url, folder });
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
