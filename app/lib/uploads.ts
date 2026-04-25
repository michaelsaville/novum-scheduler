import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/uploads';

export const PHOTO_MAX_DIMENSION = 2048;
export const PHOTO_JPEG_QUALITY = 70;
export const PHOTO_MAX_BYTES = 15_000_000; // 15 MB raw upload before resize
export const PHOTO_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export type ProcessedPhoto = {
  filename: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function processAndStorePhoto(buf: Buffer, photoId: string): Promise<ProcessedPhoto> {
  await ensureUploadsDir();
  const filename = `${photoId}.jpg`;
  const outPath = path.join(UPLOADS_DIR, filename);

  const info = await sharp(buf)
    .rotate() // honor EXIF orientation
    .resize(PHOTO_MAX_DIMENSION, PHOTO_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
    .toFile(outPath);

  return {
    filename,
    width: info.width,
    height: info.height,
    sizeBytes: info.size,
  };
}

export function safeUploadPath(filename: string): string | null {
  // Defense-in-depth against path traversal: normalize, ensure no separators.
  if (!/^[A-Za-z0-9_-]+\.jpg$/.test(filename)) return null;
  const full = path.resolve(path.join(UPLOADS_DIR, filename));
  const root = path.resolve(UPLOADS_DIR);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  return full;
}
