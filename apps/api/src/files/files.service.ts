import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { ImageKind, ImageService } from './image.service';
import { StorageService } from './storage.service';

export interface AttachTarget {
  kind: ImageKind;
  table: 'shops' | 'workers';   // internal constants only, never user input
  column: 'logo_file_id' | 'upi_qr_file_id' | 'photo_file_id';
  rowId: string; entity: string; auditPrefix: string;
}

/** One implementation of "replace / remove the image attached to a row", shared by shops and workers. */
@Injectable()
export class FilesService {
  constructor(private images: ImageService, private storage: StorageService, private audit: AuditService) {}

  async replace(db: Db, ctx: AuthContext, t: AttachTarget, buf: Buffer) {
    const img = await this.images.process(buf, t.kind);
    const key = `${ctx.shopId}/${randomUUID()}.${img.ext}`;
    await this.storage.save(key, img.data);
    try {
      const oldKey = await db.tenant({ shopId: ctx.shopId }, async (c) => {
        const row = (await c.query(`SELECT r.id, f.id AS fid, f.storage_key FROM ${t.table} r LEFT JOIN files f ON f.id = r.${t.column} WHERE r.id = $1 FOR UPDATE OF r`, [t.rowId])).rows[0];
        if (!row) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Not found.'); // RLS hides other shops' rows
        const fid = (await c.query(
          `INSERT INTO files (shop_id, kind, storage_key, mime, size_bytes, sha256, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.shopId, t.kind, key, img.mime, img.data.length, createHash('sha256').update(img.data).digest('hex'), ctx.userId])).rows[0].id;
        await c.query(`UPDATE ${t.table} SET ${t.column} = $2, updated_at = now() WHERE id = $1`, [t.rowId, fid]);
        if (row.fid) await c.query('DELETE FROM files WHERE id = $1', [row.fid]);
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: `${t.auditPrefix}.update`, entity: t.entity, entityId: t.rowId, oldValues: { fileId: row.fid ?? null }, newValues: { fileId: fid }, ip: ctx.ip });
        return row.storage_key as string | undefined;
      });
      if (oldKey) await this.storage.remove(oldKey).catch(() => undefined);
      return { uploaded: true, kind: t.kind, width: img.width, height: img.height };
    } catch (e) { await this.storage.remove(key).catch(() => undefined); throw e; }
  }

  async remove(db: Db, ctx: AuthContext, t: AttachTarget) {
    const key = await db.tenant({ shopId: ctx.shopId }, async (c) => {
      const row = (await c.query(`SELECT r.id, f.id AS fid, f.storage_key FROM ${t.table} r LEFT JOIN files f ON f.id = r.${t.column} WHERE r.id = $1 FOR UPDATE OF r`, [t.rowId])).rows[0];
      if (!row) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Not found.');
      if (!row.fid) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Nothing to remove.');
      await c.query('DELETE FROM files WHERE id = $1', [row.fid]); // FK clears the pointer column
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: `${t.auditPrefix}.remove`, entity: t.entity, entityId: t.rowId, oldValues: { fileId: row.fid }, ip: ctx.ip });
      return row.storage_key as string;
    });
    await this.storage.remove(key).catch(() => undefined);
    return { removed: true };
  }

  stream(key: string) { return this.storage.read(key); }
}
