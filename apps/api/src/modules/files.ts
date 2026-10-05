import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { z } from 'zod';
import { Actor, Db, audit, fail, notFound, own, uuid } from '../common/core';
import { Public } from './auth';
export const storage = (publicUrl = false) =>
  new S3Client({
    region: process.env.STORAGE_REGION ?? 'auto',
    endpoint: publicUrl ? (process.env.STORAGE_PUBLIC_ENDPOINT || process.env.STORAGE_ENDPOINT) : process.env.STORAGE_ENDPOINT,
    forcePathStyle: process.env.STORAGE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    },
  });
export async function scan(buffer: Buffer) {
  if (!process.env.CLAMAV_HOST) {
    if (process.env.NODE_ENV === 'production')
      fail(503, 'SCANNER_UNAVAILABLE', 'Проверка файлов временно недоступна');
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({
      host: process.env.CLAMAV_HOST!,
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    });
    let response = '';
    socket.setTimeout(30000);
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < buffer.length; i += 65536) {
        const chunk = buffer.subarray(i, i + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (d) => {
      response += d.toString();
      if (response.includes('\0')) {
        socket.end();
        if (response.includes('OK')) resolve();
        else reject(new Error('SCAN_REJECTED'));
      }
    });
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('SCAN_TIMEOUT'));
    });
  });
}
@Injectable()
export class FilesService {
  constructor(@Inject(Db) readonly db: Db) {}
  async access(actor: Actor, id: string) {
    const f = await this.db.file.findUnique({ where: { id: uuid(id) } });
    if (!f || f.status !== 'ready') notFound();
    if(f.carId) await own(this.db, actor, f.carId);
    if (f.userId !== actor.id && (!f.carId || !f.transferAllowed)) notFound();
    return f;
  }
  async download(f: any) {
    return {
      url: await getSignedUrl(
        storage(true),
        new GetObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: f.objectKey,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
        }),
        { expiresIn: 300 },
      ),
      expiresIn: 300,
    };
  }
}
@Controller()
export class FilesController {
  constructor(@Inject(FilesService) readonly files: FilesService) {}
  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 15728640), files: 1, fields: 4 },
    }),
  )
  async upload(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body() body: any) {
    const input = z
      .object({ carId: z.string().uuid().optional(),
      avatar: z.enum(['true','false']).optional(), photo: z.enum(['true', 'false']).optional() })
      .strict()
      .parse(body);
    if (!input.carId && input.avatar !== 'true') fail(400,'CAR_REQUIRED','Укажите автомобиль или фото профиля');
    if (!file) fail(400, 'FILE_REQUIRED', 'Выберите файл');
    const type = await fileTypeFromBuffer(file.buffer);
    if (!type || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type.mime))
      fail(400, 'FILE_TYPE', 'Разрешены JPEG, PNG, WebP и PDF. HEIC необходимо конвертировать');
    if ((input.photo === 'true' || input.avatar === 'true') && !type.mime.startsWith('image/'))
      fail(400, 'FILE_TYPE', 'Для фото выберите изображение');
    await scan(file.buffer);
    const f = await this.files.db.$transaction(async (tx) => {
      if(input.carId) await own(tx, req.actor, input.carId, true);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.actor.id}::uuid FOR UPDATE`;
      const used = await tx.file.aggregate({
        where: { userId: req.actor.id, status: { in: ['pending', 'ready'] } },
        _sum: { size: true },
      });
      if ((used._sum.size ?? 0) + file.size > Number(process.env.USER_STORAGE_MAX_BYTES ?? 524288000))
        fail(413, 'STORAGE_QUOTA', 'Превышен лимит хранения файлов');
      return tx.file.create({
        data: {
          carId: input.carId,
          userId: req.actor.id,
          objectKey: `private/${crypto.randomUUID()}.${type.ext}`,
          originalName: file.originalname.replace(/[\r\n\x00-\x1f/\\]/g, '_').slice(0, 200),
          mime: type.mime,
          size: file.size,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
        },
      });
    });
    try {
      await storage().send(
        new PutObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: f.objectKey,
          Body: file.buffer,
          ContentType: type.mime,
        }),
      );
      await this.files.db.$transaction(async (tx) => {
        if(input.carId) await own(tx, req.actor, input.carId, true);
        const max = await tx.file.aggregate({ where: { carId: input.carId }, _max: { photoPosition: true } });
        await tx.file.update({
          where: { id: f.id },
          data: {
            status: 'ready',
            photoPosition: input.carId && input.photo === 'true' ? (max._max.photoPosition ?? -1) + 1 : null,
          },
        });
        if(input.avatar === 'true') await tx.user.update({where:{id:req.actor.id},data:{avatarFileId:f.id}});
        if(input.carId) await audit(tx, req.actor, input.carId, 'file', f.id, 'create', null, {
          name: f.originalName,
          mime: f.mime,
          size: f.size,
        });
      });
    } catch {
      await this.files.db.file.update({ where: { id: f.id }, data: { status: 'failed' } });
      fail(503, 'UPLOAD_FAILED', 'Не удалось загрузить файл. Повторите попытку');
    }
    return { id: f.id, name: f.originalName, mime: f.mime, size: f.size };
  }
  @Get('files/:id/download') async download(@Req() req: any, @Param('id') id: string) {
    return this.files.download(await this.files.access(req.actor, id));
  }
  @Patch('files/:id') async update(@Req() req: any, @Param('id') id: string, @Body() raw: unknown) {
    const input = z
      .object({
        transferAllowed: z.boolean().optional(),
        photoPosition: z.number().int().nonnegative().max(1000).optional(),
      })
      .strict()
      .parse(raw);
    return this.files.db.$transaction(async (tx) => {
      const f = await tx.file.findUnique({ where: { id: uuid(id) } });
      if (!f) notFound();
      if(f.carId) await own(tx, req.actor, f.carId, true);
      if (f.userId !== req.actor.id && (!f.carId || !f.transferAllowed)) notFound();
      await tx.file.update({ where: { id }, data: input });
      if(f.carId) await audit(tx, req.actor, f.carId, 'file', id, 'update', null, input);
      return { ok: true };
    });
  }
  @Delete('files/:id') async remove(@Req() req: any, @Param('id') id: string) {
    return this.files.db.$transaction(async (tx) => {
      const f = await tx.file.findUnique({ where: { id: uuid(id) } });
      if (!f) notFound();
      if(f.carId) await own(tx, req.actor, f.carId, true);
      if (f.userId !== req.actor.id && (!f.carId || !f.transferAllowed)) notFound();
      const published = await tx.reportFile.count({
        where: { fileId: id, reportVersion: { report: { active: true } } },
      });
      if (published) fail(409, 'FILE_PUBLISHED', 'Сначала отзовите отчёты, в которых опубликован файл');
      await tx.user.updateMany({where:{avatarFileId:id},data:{avatarFileId:null}});
      await tx.attachment.deleteMany({ where: { fileId: id } });
      await tx.file.update({ where: { id }, data: { status: 'deleted', photoPosition: null } });
      await tx.outbox.create({ data: { kind: 'delete-file', payload: { fileId: id, key: f.objectKey } } });
      if(f.carId) await audit(tx, req.actor, f.carId, 'file', id, 'delete', null, null);
      return { ok: true };
    });
  }
  @Public() @Get('public/reports/:token/files/:id') async publicFile(
    @Param('token') token: string,
    @Param('id') id: string,
  ) {
    const r = await this.files.db.report.findFirst({
      where: {
        token,
        active: true,
        car: { deletedAt: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!r) notFound();
    const link = await this.files.db.reportFile.findFirst({
      where: { fileId: uuid(id), reportVersion: { reportId: r.id, version: r.currentVersion } },
      include: { file: true },
    });
    if (!link || link.file.status !== 'ready') notFound();
    return this.files.download(link.file);
  }
}
