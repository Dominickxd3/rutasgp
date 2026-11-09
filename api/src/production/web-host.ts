import { existsSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export function configureWebHost(app: NestExpressApplication, directory: string): void {
  const index = join(directory, 'index.html');
  if (!existsSync(index)) throw new Error('Falta web/dist/index.html. Ejecute npm run build:production.');
  app.useStaticAssets(directory, { index: false, redirect: false,
    setHeaders: (response, file) => {
      response.setHeader('Cache-Control', relative(directory, file).startsWith(`assets${sep}`)
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    } });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(request.method) || request.path === '/api'
      || request.path.startsWith('/api/') || request.path.startsWith('/assets/')
      || request.path.startsWith('/vehicles/') || extname(request.path)) return next();
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(index, error => { if (error) next(error); });
  });
}
