import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { MobileAuthService } from './mobile-auth.service';
import { parseMobileLogin } from './mobile-auth.validation';

@ApiTags('mobile')
@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly auth: MobileAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Iniciar sesión de la app móvil con credenciales del ERP',
    description:
      'Valida contra dbo.Tab_SYS_Usuarios. Devuelve un token firmado que ' +
      'la app envía como "Authorization: Bearer <token>" al subir posiciones.',
  })
  login(@Body() body: unknown) {
    return this.auth.login(parseMobileLogin(body));
  }

  /** Público para el guard: el token se valida dentro (puede estar recién vencido). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Renovar el token de la app móvil sin contraseña' })
  refresh(@Headers('authorization') authorization: string | undefined) {
    const [scheme, token] = (authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
      throw new UnauthorizedException('Envíe el token actual como "Authorization: Bearer <token>".');
    }
    return this.auth.refresh(token.trim());
  }
}
