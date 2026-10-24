import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';

export type ImageKind = 'shop_logo' | 'upi_qr' | 'worker_photo';
const ALLOWED = new Set(['jpeg', 'png', 'webp']); // SVG & others rejected (SVG can carry scripts)

/** Decodes the upload as a real image (ignoring filename/MIME the client claims) and RE-ENCODES it:
 *  strips EXIF/GPS, defeats polyglot files, bounds dimensions. */
@Injectable()
export class ImageService {
  async process(buf: Buffer, kind: ImageKind): Promise<{ data: Buffer; mime: string; ext: string; width: number; height: number }> {
    const bad = (m: string) => new AppException(400, ErrorCodes.UNSUPPORTED_FILE, m);
    let format: string | undefined, width = 0, height = 0;
    try {
      const m = await sharp(buf, { limitInputPixels: 40_000_000 }).metadata();
      format = m.format; width = m.width ?? 0; height = m.height ?? 0;
    } catch { throw bad('This file is not a valid image. Please upload a JPG, PNG or WebP picture.'); }
    if (!format || !ALLOWED.has(format)) throw bad('Only JPG, PNG or WebP images are allowed.');

    if (kind === 'upi_qr') {
      if (Math.min(width, height) < 100) throw bad('This image is too small to be a scannable QR code (min 100px).');
      const data = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate()
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer(); // lossless: keep it scannable
      return { data, mime: 'image/png', ext: 'png', ...(await dims(data)) };
    }
    if (Math.min(width, height) < 32) throw bad('This image is too small (min 32px).');
    if (kind === 'worker_photo') {
      const data = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
      return { data, mime: 'image/webp', ext: 'webp', ...(await dims(data)) };
    }
    const data = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    return { data, mime: 'image/webp', ext: 'webp', ...(await dims(data)) };
  }
}
async function dims(b: Buffer) { const m = await sharp(b).metadata(); return { width: m.width ?? 0, height: m.height ?? 0 }; }
