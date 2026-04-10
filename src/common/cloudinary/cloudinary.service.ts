import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  format?: string;
  error?: {
    message?: string;
  };
}

export interface CloudinaryUploadFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly mode: 'cloudinary' | 'local';
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly uploadFolder = 'edusphere/schools';
  private readonly localUploadRoot = join(process.cwd(), 'uploads', 'schools');

  constructor(private readonly config: ConfigService) {
    this.cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim() ?? '';
    this.apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim() ?? '';
    this.apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim() ?? '';
    this.mode = this.hasCloudinaryCredentials() ? 'cloudinary' : 'local';

    if (this.mode === 'local') {
      this.logger.warn(
        'Cloudinary is not fully configured. School logos will be stored locally under /uploads/schools.',
      );
    }
  }

  async uploadSchoolLogo(file: CloudinaryUploadFile, baseUrl?: string): Promise<string> {
    if (!file) {
      throw new BadRequestException("Le logo de l'école est obligatoire.");
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Le logo doit être une image.');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('Le fichier logo est vide.');
    }

    if (this.mode === 'local') {
      return this.uploadLocally(file, baseUrl);
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.buildSignature({
      folder: this.uploadFolder,
      timestamp,
    });

    const formData = new FormData();
    formData.append(
      'file',
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
    );
    formData.append('api_key', this.apiKey);
    formData.append('timestamp', timestamp);
    formData.append('folder', this.uploadFolder);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );

    const payload = (await response.json().catch(() => null)) as CloudinaryUploadResponse | null;

    if (!response.ok) {
      const message =
        payload?.error?.message || 'Le téléversement du logo sur Cloudinary a échoué.';
      throw new BadRequestException(message);
    }

    if (!payload?.secure_url) {
      throw new InternalServerErrorException('Cloudinary a répondu sans URL sécurisée.');
    }

    return payload.secure_url;
  }

  private hasCloudinaryCredentials(): boolean {
    return !!(this.cloudName && this.apiKey && this.apiSecret);
  }

  private async uploadLocally(file: CloudinaryUploadFile, baseUrl?: string): Promise<string> {
    await mkdir(this.localUploadRoot, { recursive: true });

    const extension = this.resolveFileExtension(file);
    const filename = `${randomUUID()}${extension}`;
    const filePath = join(this.localUploadRoot, filename);

    await writeFile(filePath, file.buffer);

    const publicPath = `/uploads/schools/${filename}`;
    return this.buildPublicUrl(publicPath, baseUrl);
  }

  private resolveFileExtension(file: CloudinaryUploadFile): string {
    const originalExtension = extname(file.originalname ?? '').trim().toLowerCase();
    if (originalExtension) {
      return originalExtension;
    }

    switch (file.mimetype) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      case 'image/svg+xml':
        return '.svg';
      default:
        return '.png';
    }
  }

  private buildPublicUrl(publicPath: string, baseUrl?: string): string {
    const resolvedBaseUrl = (baseUrl?.trim() || this.getFallbackBaseUrl()).replace(/\/+$/, '');
    return new URL(publicPath, `${resolvedBaseUrl}/`).toString();
  }

  private getFallbackBaseUrl(): string {
    const configuredBaseUrl = this.config.get<string>('APP_BASE_URL')?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }

    const port = this.config.get<string>('PORT')?.trim() || '3000';
    return `http://localhost:${port}`;
  }

  private buildSignature(params: Record<string, string>): string {
    const payload = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1').update(`${payload}${this.apiSecret}`).digest('hex');
  }
}
