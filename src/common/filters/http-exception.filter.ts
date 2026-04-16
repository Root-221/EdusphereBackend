import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import type { Request } from 'express';
import { ErrorResponse } from '../dtos/response.dto';
import { ErrorCode } from '../enums/error-codes.enum';
import { ErrorMessages } from '../i18n/error-messages';
import * as fs from 'fs';
import * as path from 'path';

type PrismaErrorLike = {
  code?: string;
  meta?: {
    target?: unknown;
  };
};

const isPrismaErrorLike = (value: unknown): value is PrismaErrorLike => {
  return !!value && typeof value === 'object' && 'code' in value && typeof (value as { code?: unknown }).code === 'string';
};

const getPrismaUniqueConstraintMessage = (target: string[], locale: 'fr' | 'en'): string => {
  const normalizedTarget = target.map((field) => field.toLowerCase());

  if (normalizedTarget.includes('email')) {
    return locale === 'fr'
      ? 'Cette adresse e-mail existe déjà.'
      : 'This email address already exists.';
  }

  if (normalizedTarget.includes('slug')) {
    return locale === 'fr'
      ? 'Ce slug existe déjà.'
      : 'This slug already exists.';
  }

  if (normalizedTarget.includes('code')) {
    return locale === 'fr'
      ? 'Ce code existe déjà.'
      : 'This code already exists.';
  }

  if (normalizedTarget.includes('name')) {
    return locale === 'fr'
      ? 'Un élément avec ce nom existe déjà.'
      : 'An item with this name already exists.';
  }

  if (normalizedTarget.includes('token')) {
    return locale === 'fr'
      ? 'Ce jeton existe déjà.'
      : 'This token already exists.';
  }

  return locale === 'fr'
    ? 'Un élément avec ces valeurs existe déjà.'
    : 'An item with these values already exists.';
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const acceptLanguage = request.headers['accept-language']?.split(',')[0] || 'fr';
    const locale: 'fr' | 'en' = (acceptLanguage.startsWith('fr') ? 'fr' : 'en') as 'fr' | 'en';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.INTERNAL_ERROR;
    let message = ErrorMessages[ErrorCode.INTERNAL_ERROR][locale];
    let details: string[] = [];

    if (isPrismaErrorLike(exception)) {
      const target = Array.isArray(exception.meta?.target)
        ? exception.meta.target.filter((item): item is string => typeof item === 'string')
        : [];

      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = ErrorCode.CONFLICT;
        message = getPrismaUniqueConstraintMessage(target, locale);
        details = target.length > 0 ? [`Champs concernés : ${target.join(', ')}`] : [];
      } else if (exception.code === 'P2028') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = ErrorCode.INTERNAL_ERROR;
        message =
          locale === 'fr'
            ? 'La transaction a expiré. Réessayez.'
            : 'The transaction timed out. Please try again.';
      } else if (
        exception.code === 'P2010' ||
        exception.code === 'P2021' ||
        exception.code === 'P2022'
      ) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = ErrorCode.INTERNAL_ERROR;
        message =
          locale === 'fr'
            ? 'Le schéma de la base du tenant est désynchronisé. Réessayez dans un instant.'
            : 'The tenant database schema is out of sync. Please try again shortly.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ErrorCode.NOT_FOUND;
        message = ErrorMessages[ErrorCode.NOT_FOUND][locale];
      } else if (exception.code === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        code = ErrorCode.BAD_REQUEST;
        message =
          locale === 'fr'
            ? 'La référence liée est invalide.'
            : 'The related reference is invalid.';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.BAD_REQUEST;
      message =
        locale === 'fr'
          ? 'Les données envoyées sont invalides.'
          : 'The submitted data is invalid.';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = ErrorCode.INTERNAL_ERROR;
      message =
        locale === 'fr'
          ? 'La base de données est temporairement indisponible.'
          : 'The database is temporarily unavailable.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && (exceptionResponse as any).code) {
        const exceptionCode = (exceptionResponse as any).code as ErrorCode;
        code = exceptionCode in ErrorMessages ? exceptionCode : ErrorCode.INTERNAL_ERROR;
        message = ErrorMessages[code][locale];
        details = (exceptionResponse as any).details || [];
      } else {
        const msg = typeof exceptionResponse === 'string' ? exceptionResponse : (exceptionResponse as any).message;
        code = status.toString() as ErrorCode;
        message = Array.isArray(msg) ? msg[0] : msg as string;
        details = Array.isArray(msg) ? msg.slice(1) : [];
      }
    }

    const errorResponse: ErrorResponse = {
      error: {
        code,
        message,
        details,
      },
      _links: {
        documentation: '/api/docs#errors',
      },
    };

    response.status(status).json(errorResponse);
  }
}
