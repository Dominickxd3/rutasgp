import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProviderEvidenceService {
  constructor(private readonly config: ConfigService, private readonly database: DatabaseService) {}

  async preserve(body: string, receivedAt: Date, status: number): Promise<void> {
    if (this.config.get<string>('GPS_EVIDENCE_ENABLED') !== 'true') return;
    const pool = await this.database.pool;
    // Se conserva la respuesta completa, incluso si luego no es JSON válido.
    // Si falla el archivo, se propaga el error: no aparentar captura verificable.
    await pool.request()
      .input('body', sql.NVarChar(sql.MAX), body)
      .input('received', sql.DateTime2(3), receivedAt)
      .input('status', sql.Int, status)
      .input('hash', sql.Char(64), createHash('sha256').update(body, 'utf8').digest('hex'))
      .query(`INSERT dbo.GPS_EvidenciaProveedor
        (fecha_recepcion_utc,respuesta_original,sha256,version_captura,estado_http)
        VALUES (@received,@body,@hash,'provider-envelope-v1',@status);`);
  }
}
