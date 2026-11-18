import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql from 'mssql/msnodesqlv8';

import { signMobileToken } from '../common/auth/mobile-token';
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

    const ttlHours = this.config.get<number>('auth.tokenTtlHours', 12);
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
}
