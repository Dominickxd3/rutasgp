import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';

import { verifyMobileToken } from '../auth/mobile-token';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  path?: string;
  method?: string;
}

/**
 * Compara hashes en lugar de los strings crudos para no filtrar
 * la longitud de la clave por diferencias de tiempo.
 */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function readBearer(request: IncomingRequest): string | null {
  const authorization = request.headers.authorization;

  if (typeof authorization !== 'string') {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  return scheme?.toLowerCase() === 'bearer' && token?.trim()
    ? token.trim()
    : null;
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

    const request = context.switchToHttp().getRequest<IncomingRequest>();
    const expected = this.config.get<string>('apiKey')?.trim();
    const header = request.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (
      expected &&
      typeof provided === 'string' &&
      provided.trim().length > 0 &&
      timingSafeEqual(digest(provided.trim()), digest(expected))
    ) {
      return true;
    }

    // La app móvil no lleva la API key: envía el token firmado del login.
    const bearer = readBearer(request);
    const authSecret = this.config.get<string>('auth.secret', '');

    if (request.method === 'POST' && request.path === '/api/mobile/positions/batch'
      && bearer && authSecret && verifyMobileToken(bearer, authSecret)) {
      return true;
    }

    if (!expected) {
      return true;
    }

    throw new UnauthorizedException(
      'Credencial inválida. Envía "x-api-key" o un token de sesión móvil.',
    );
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
