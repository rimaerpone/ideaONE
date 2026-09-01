import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/core/shared/db'

/**
 * هسته Storage — سرویس ۱۱ از ۱۸ سرویس هسته سند منبع (بخش ۵.۱: File & Document Storage)
 * قرارداد S3-مانند (putObject/getObject) با آداپتر فایل‌سیستم محلی برای سندباکس؛
 * در استقرار تولیدی همین قرارداد روی MinIO/S3 پیاده می‌شود بدون تغییر ماژول‌ها.
 *
 * امنیت:
 *   - کلید ذخیره‌سازی سمت سرور ساخته می‌شود (UUID) — ورودی کاربر هرگز وارد مسیر نمی‌شود
 *   - پسوند و MIME از allowlist — جلوگیری از آپلود اجراپذیر
 *   - سقف حجم ۱۰ مگابایت
 */

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export type StoredObject = {
  id: string
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

function storageRoot(): string {
  return process.env.STORAGE_ROOT ?? path.join(process.cwd(), '.storage')
}

export async function putObject(opts: {
  namespace: string // نمونه: letters
  fileName: string
  bytes: Buffer
  uploadedById?: string | null
}): Promise<StoredObject> {
  const ext = path.extname(opts.fileName ?? '').toLowerCase()
  const mime = ALLOWED[ext]
  if (!mime) return Promise.reject(new Error('نوع فایل مجاز نیست (PDF، تصویر، Word، Excel یا متن)'))
  if (opts.bytes.byteLength === 0) return Promise.reject(new Error('فایل خالی است'))
  if (opts.bytes.byteLength > MAX_BYTES) return Promise.reject(new Error('حجم فایل بیش از حد مجاز (۱۰ مگابایت) است'))

  const stamp = new Date().toISOString().slice(0, 7) // yyyy-mm
  const storageKey = `${opts.namespace}/${stamp}/${randomUUID()}${ext}`
  const abs = path.join(storageRoot(), storageKey)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, opts.bytes)

  const rec = await db.fileObject.create({
    data: {
      storageKey,
      fileName: (opts.fileName ?? 'فایل').slice(0, 180),
      mimeType: mime,
      sizeBytes: opts.bytes.byteLength,
      sha256: createHash('sha256').update(opts.bytes).digest('hex'),
    },
  })
  return {
    id: rec.id,
    storageKey,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    sizeBytes: rec.sizeBytes,
  }
}

export async function attachToEntity(opts: {
  entityType: string // نمونه: letter
  entityId: string
  fileObjectId: string
  uploadedById?: string | null
}): Promise<void> {
  await db.attachment.create({
    data: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      fileObjectId: opts.fileObjectId,
      uploadedById: opts.uploadedById ?? null,
    },
  })
}

export async function listAttachments(entityType: string, entityId: string) {
  const rows = await db.attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
    include: { fileObject: true },
  })
  return rows.map((a) => ({
    id: a.id,
    fileObjectId: a.fileObjectId,
    fileName: a.fileObject.fileName,
    mimeType: a.fileObject.mimeType,
    sizeBytes: a.fileObject.sizeBytes,
    createdAt: a.createdAt,
  }))
}

export async function getObject(fileObjectId: string): Promise<StoredObject & { bytes: Buffer } | null> {
  const rec = await db.fileObject.findUnique({ where: { id: fileObjectId } })
  if (!rec) return null
  try {
    const bytes = await readFile(path.join(storageRoot(), rec.storageKey))
    return { id: rec.id, storageKey: rec.storageKey, fileName: rec.fileName, mimeType: rec.mimeType, sizeBytes: rec.sizeBytes, bytes }
  } catch {
    return null
  }
}
