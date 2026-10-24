import { Injectable } from '@nestjs/common';
import { createReadStream, promises as fs, ReadStream } from 'fs';
import path from 'path';
import { loadConfig } from '../config';

/** Local-disk storage. Keys are server-generated ("<shopId>/<uuid>.<ext>"); client filenames are never used.
 *  Swap this class for an S3-compatible implementation in production without touching callers. */
@Injectable()
export class StorageService {
  private root = path.resolve(loadConfig().UPLOAD_DIR);

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key'); // defence in depth
    return full;
  }
  async save(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: 'wx', mode: 0o640 });
  }
  read(key: string): ReadStream { return createReadStream(this.resolve(key)); }
  async remove(key: string) { await fs.rm(this.resolve(key), { force: true }); }
}
