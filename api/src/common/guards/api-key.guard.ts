import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Compara hashes en lugar de los strings crudos para no filtrar
 * la longitud de la clave por diferencias de tiempo.
 */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function readApiKey(request: IncomingRequest): string | null {
  const header = request.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;

  if (typeof fromHeader === 'string' && fromHeader.trim().length > 0) {
    return fromHeader.trim();
  }

  const authorization = request.headers.authorization;

  if (typeof authorization === 'string') {
    const [scheme, token] = authorization.split(' ');

    if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
      return token.trim();
    }
  }

  return null;
}

/**
 * Protege toda la API con una clave compartida.
 *
 * Si `API_KEY` está vacía el guard queda deshabilitado, para que el
 * entorno local y `npm run dev` sigan funcionando sin configuración.
 * En producción SIEMPRE debe estar definida.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublic(context)) {
      return true;
    }

    const expected = this.config.get<string>('apiKey')?.trim();

    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IncomingRequest>();
    const provided = readApiKey(request);

    if (!provided) {
      throw new UnauthorizedException(
        'Falta la API key. Envía el header "x-api-key" o "Authorization: Bearer <clave>".',
      );
    }

    if (!timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException('API key inválida.');
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
  }
}
