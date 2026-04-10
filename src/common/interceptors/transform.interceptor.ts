import {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Injectable,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { ApiResponse } from '../dtos/response.dto';
import { generateLinks } from '../utils/hateoas.util';

interface RequestWithUser extends Request {
  user?: any;
  tenant?: string;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor() {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();
    const route = request.route?.path || '';

    return next
      .handle()
      .pipe(
        map((data) => {
          // Skip for simple responses (health, status)
          if (typeof data === 'string' || (data && data.status === 'ok')) {
            return data;
          }

          // HATEOAS links
          const links = generateLinks(request, route);

          // Ensure links has self
          const apiLinks = { ...links, self: links.self || `${request.protocol}://${request.headers.host}${request.originalUrl}` };

          // Pagination meta
          const meta = request.query.page
            ? {
                total: data.total || 0,
                page: parseInt(request.query.page as string) || 1,
                limit: parseInt(request.query.limit as string) || 10,
              }
            : undefined;

          const apiResponse: ApiResponse<any> = {
            data: data.data || data,
            meta,
            _links: apiLinks,
          };

          return apiResponse;
        }),
      );
  }
}

