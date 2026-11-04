/**
 * File storage for Version exports: an S3-compatible bucket (Cloudflare R2) when S3_BUCKET is
 * configured, otherwise the local filesystem under .data/files. Files are served only through
 * short-lived signed URLs (/api/files/<id>?t=…), never directly (spec 11.5).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';

export interface Storage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}
  async put(key: string, bytes: Buffer) {
    const path = join(this.root, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  async get(key: string) {
    const path = join(this.root, key);
    return existsSync(path) ? readFileSync(path) : null;
  }
}

class S3Storage implements Storage {
  private client: Promise<S3Client>;
  constructor(private readonly bucket: string) {
    this.client = import('@aws-sdk/client-s3').then(
      (m) =>
        new m.S3Client({
          region: process.env.S3_REGION ?? 'auto',
          ...(process.env.S3_ENDPOINT
            ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
            : {}),
        }),
    );
  }
  async put(key: string, bytes: Buffer, contentType: string) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (
      await this.client
    ).send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      const res = await (
        await this.client
      ).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = res.Body as { transformToByteArray(): Promise<Uint8Array> } | undefined;
      return body ? Buffer.from(await body.transformToByteArray()) : null;
    } catch {
      return null;
    }
  }
}

let instance: Storage | undefined;

export function storage(): Storage {
  if (!instance) {
    instance = process.env.S3_BUCKET
      ? new S3Storage(process.env.S3_BUCKET)
      : new LocalStorage(resolve(process.env.PENCIL_FILES_DIR ?? '.data/files'));
  }
  return instance;
}

export const CONTENT_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
