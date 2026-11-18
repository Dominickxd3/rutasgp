import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql from 'mssql/msnodesqlv8';

import { signMobileToken, verifyMobileToken } from '../common/auth/mobile-token';
import { DatabaseService } from '../database/database.service';
import type {
  MobileLoginInput,
  MobileLoginResult,
} from './mobile-auth.types';

interface UserRow {
  User_Logon: string;
  User_Fullname: string | null;
  User_Email: string | null;
  User_EsAdmin: number | null;
  Rol: string | null;
}

@Injectable()
export class MobileAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async login(input: MobileLoginInput): Promise<MobileLoginResult> {
    // Sin AUTH_SECRET el guard rechaza todos los tokens móviles (401): no tiene
    // sentido emitir uno que la propia API no aceptará al subir posiciones.
    if (!this.config.get<string>('auth.secret', '').trim()) {
      throw new ServiceUnavailableException(
        'El servidor no tiene AUTH_SECRET configurado; la app móvil no puede iniciar sesión. Avise al administrador.',
      );
    }
    const pool = await this.database.pool;
    const result = await pool
      .request()
      .input('username', sql.VarChar(50), input.username)
      .input('password', sql.VarChar(50), input.password)
      .query<UserRow>(`
        SELECT TOP (1)
          User_Logon,
          User_Fullname,
          User_Email,
          User_EsAdmin,
          Rol
        FROM dbo.Tab_SYS_Usuarios
        WHERE User_Logon = @username
          AND User_PassBin = @password
          AND User_Estado = '1';
      `);

    const user = result.recordset[0];

    if (!user) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }

    const ttlHours = this.config.get<number>('auth.tokenTtlHours', 720);
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1_000;
    const secret = this.config.get<string>('auth.secret', '');
    const token = signMobileToken(
      {
        sub: user.User_Logon,
        name: user.User_Fullname ?? user.User_Logon,
        deviceId: input.deviceId ?? undefined,
        exp: expiresAt,
      },
      secret,
    );

    return {
      success: true,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      user: {
        username: user.User_Logon,
        fullName: user.User_Fullname ?? user.User_Logon,
        email: user.User_Email ?? '',
        role:
          user.Rol?.trim() ||
          (Number(user.User_EsAdmin ?? 0) === 1 ? 'admin' : 'tecnico'),
        isAdmin: Number(user.User_EsAdmin ?? 0) === 1,
      },
    };
  }

  /**
   * Renueva el token de un celular sin pedir contraseña, para que funcione sin
   * que nadie abra la app. Exige firma válida, que el token no haya vencido hace
   * más de AUTH_REFRESH_GRACE_DAYS, que el usuario siga activo en el ERP y que el
   * celular no esté desactivado en GPS_DispositivosMoviles.
   */
  async refresh(token: string): Promise<{ success: true; token: string; expiresAt: string }> {
    const secret = this.config.get<string>('auth.secret', '').trim();
    if (!secret) {
      throw new ServiceUnavailableException('El servidor no tiene AUTH_SECRET configurado.');
    }
    // now = 0: se valida la firma aunque el token ya haya vencido; el plazo se revisa abajo.
    const payload = verifyMobileToken(token, secret, 0);
    if (!payload) throw new UnauthorizedException('Token inválido.');
    const graceMs = this.config.get<number>('auth.refreshGraceDays', 90) * 24 * 60 * 60 * 1_000;
    if (payload.exp + graceMs < Date.now()) {
      throw new UnauthorizedException('La sesión venció hace demasiado tiempo. Inicie sesión de nuevo.');
    }

    const pool = await this.database.pool;
    const check = await pool.request()
      .input('username', sql.VarChar(50), payload.sub)
      .input('deviceId', sql.VarChar(128), payload.deviceId ?? null)
      .query<{ userActive: number; deviceBlocked: number }>(`
        SELECT
          CASE WHEN EXISTS (SELECT 1 FROM dbo.Tab_SYS_Usuarios
                            WHERE User_Logon = @username AND User_Estado = '1') THEN 1 ELSE 0 END AS userActive,
          CASE WHEN @deviceId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.GPS_DispositivosMoviles
                            WHERE device_id = @deviceId AND activo = 0) THEN 1 ELSE 0 END AS deviceBlocked;
      `);
    const row = check.recordset[0];
    if (!row || Number(row.userActive) !== 1) throw new UnauthorizedException('El usuario ya no está activo en el ERP.');
    if (Number(row.deviceBlocked) === 1) throw new UnauthorizedException('Este celular fue desactivado en la web.');

    const ttlHours = this.config.get<number>('auth.tokenTtlHours', 720);
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1_000;
    return {
      success: true,
      token: signMobileToken({ sub: payload.sub, name: payload.name, deviceId: payload.deviceId, exp: expiresAt }, secret),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
}
