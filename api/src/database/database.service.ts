import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql, { ConnectionPool } from 'mssql/msnodesqlv8';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private poolPromise: Promise<ConnectionPool> | null = null;

  constructor(private readonly config: ConfigService) {}

  get pool(): Promise<ConnectionPool> {
    if (!this.poolPromise) {
      const server = this.config.get<string>('database.host', '');
      const user = this.config.get<string>('database.user', '');

      if (!server || !user) {
        throw new Error('La conexión GPS a SQL Server no está configurada.');
      }

      const escapeOdbcSecret = (value: string): string =>
        `{${value.replace(/}/g, '}}')}}`;
      const database = this.config.get<string>(
        'database.name',
        'DB_GP_DistribucionML',
      );
      const port = this.config.get<number>('database.port', 1433);
      const connectionString = [
        'Driver={ODBC Driver 17 for SQL Server}',
        `Server=${server},${port}`,
        `Database=${database}`,
        `Uid=${user}`,
        `Pwd=${escapeOdbcSecret(this.config.get<string>('database.password', ''))}`,
        `Encrypt=${this.config.get<boolean>('database.encrypt', false) ? 'yes' : 'no'}`,
        `TrustServerCertificate=${this.config.get<boolean>('database.trustServerCertificate', true) ? 'yes' : 'no'}`,
      ].join(';');

      const pool = new sql.ConnectionPool(
        { connectionString } as unknown as sql.config,
      );

      pool.on('error', (error) => {
        this.logger.error(`Error del pool SQL Server: ${error.message}`);
      });

      this.poolPromise = pool.connect().catch((error: unknown) => {
        this.poolPromise = null;
        throw error;
      });
    }

    return this.poolPromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.poolPromise) return;
    const pool = await this.poolPromise.catch(() => null);
    await pool?.close();
  }
}
