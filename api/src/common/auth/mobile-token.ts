import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MobileTokenPayload {
  /** User_Logon del ERP. */
  sub: string;
  /** Nombre completo para mostrar en el cliente. */
  name: string;
  /** Identificador del equipo que inició la sesión. */
  deviceId?: string;
  /** Momento de expiración en milisegundos. */
  exp: number;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signature(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('base64url');
}

/**
 * Token firmado con HMAC. No requiere almacenamiento en base de datos:
 * la firma permite validar que fue emitido por esta API y la fecha `exp`
 * evita que una sesión quede abierta indefinidamente.
 */
export function signMobileToken(
  payload: MobileTokenPayload,
  secret: string,
): string {
  const body = encode(JSON.stringify(payload));

  return `${body}.${signature(body, secret)}`;
}

export function verifyMobileToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): MobileTokenPayload | null {
  const [body, provided] = token.split('.');

  if (!body || !provided) {
    return null;
  }

  const expected = signature(body, secret);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as MobileTokenPayload;

    if (
      !payload?.sub ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
